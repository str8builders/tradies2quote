#!/usr/bin/env python3
"""
The bridge: production errors → STR8SENTRY on this Mac, as they happen.

STR8SENTRY sees every local app on this machine but is blind to production —
its ingest server has no Linux build, so the VPS can never call it. This
daemon closes that gap from the other side: it polls the production error
monitor (the same tables the morning digest reads), and forwards each new
event into STR8SENTRY's Sentry-compatible ingest on localhost:8969.

What that buys, the moment an error happens in production:
  - it appears in STR8SENTRY within a minute, grouped exactly as the
    monitor groups it (the fingerprint is passed through verbatim);
  - STR8SENTRY's default alert rule raises a Mac notification;
  - its Doctor watcher auto-diagnoses it (heuristics always; AI root-cause
    once an Anthropic key is in its Settings);
  - for a brand-new problem, this bridge also kicks the overnight fixer
    (autofix.py) immediately instead of waiting for 7:00am — the fix
    arrives as a tested branch + email, same rules, same safety envelope.

The bridge is also the off-box heartbeat this stack has been missing: if
the VPS stops answering, that itself becomes an error event in STR8SENTRY
("production monitor unreachable"), so the server dying finally rings a
bell somewhere it can be heard.

Runs forever under launchd (com.tradies2quote.sentry-bridge). State in
~/.t2q-autofix/bridge-state.json. Safe to kill and restart at any point:
event ids are passed through, and STR8SENTRY's store endpoint is
idempotent on event_id, so replays never duplicate.
"""

import datetime
import json
import pathlib
import re
import shlex
import subprocess
import time
import urllib.request
import uuid

SSH_HOST = "nursemate-vps"
DB_CONTAINER = "tradies-supabase-db"

SINK = "http://127.0.0.1:8969/api/20/store/"   # project 20 auto-provisions
SINK_AUTH = "Sentry sentry_version=7, sentry_client=t2q-bridge/1.0, sentry_key=t2qbridge"
SINK_APP = pathlib.Path("~/STR8SENTRY/dist/STR8SENTRY.app").expanduser()

# Beside this file, wherever this file lives — the repo copy calls the repo
# fixer, the installed ~/.t2q-autofix/bin copy calls its neighbour.
AUTOFIX = pathlib.Path(__file__).resolve().with_name("autofix.py")
HOME = pathlib.Path("~/.t2q-autofix").expanduser()
STATE_PATH = HOME / "bridge-state.json"
LOGS = HOME / "logs"

POLL_SECONDS = 45
BATCH = 200
OUTAGE_AFTER_FAILURES = 4          # ~3 minutes of silence = the server is down
OUTAGE_REMINDER_S = 3600           # then one event per hour, not a flood
FIX_TRIGGERS_PER_DAY = 3           # same posture as the 7:00am run
FRESH_ENOUGH_S = 2 * 3600          # only fresh errors trigger a fix — backfill never does


def log(msg: str) -> None:
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    with open(LOGS / f"bridge-{datetime.date.today().isoformat()}.log", "a") as f:
        f.write(line + "\n")


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except json.JSONDecodeError:
            pass
    return {"watermark": "1970-01-01T00:00:00+00:00", "watermark_id": "",
            "triggered": {}, "outage": None, "last_outage_post": 0}


def save_state(state: dict) -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


# ── Reading the monitor ───────────────────────────────────────────────────

def fetch_events(state: dict):
    """Events strictly after the (occurred_at, id) watermark, oldest first."""
    ts = state["watermark"]
    last_id = state["watermark_id"] or "00000000-0000-0000-0000-000000000000"
    query = f"""
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select id, fingerprint, name, message, stack, surface, route,
               environment, http_status, release_sha, occurred_at
        from app_error_events
        where occurred_at > '{ts}'
           or (occurred_at = '{ts}' and id > '{last_id}')
        order by occurred_at, id
        limit {BATCH}
      ) t
    """
    remote = f"docker exec {DB_CONTAINER} psql -U postgres -d postgres -Atc {shlex.quote(query)}"
    out = subprocess.run(["ssh", "-o", "ConnectTimeout=15", SSH_HOST, remote],
                         capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:160] or "ssh failed")
    return json.loads(out.stdout.strip() or "[]")


# ── Writing into STR8SENTRY ───────────────────────────────────────────────

STACK_LINE = re.compile(r"^\s*at\s+(?:(.+?)\s+\()?([^()]+?):(\d+):(\d+)\)?\s*$")


def frames_from(stack: str):
    """Best-effort V8-style parse; Sentry wants oldest frame first."""
    frames = []
    for line in (stack or "").splitlines():
        m = STACK_LINE.match(line)
        if not m:
            continue
        func, filename, lineno, col = m.groups()
        frames.append({
            "function": func or "<anonymous>",
            "filename": filename,
            "lineno": int(lineno),
            "colno": int(col),
            "in_app": "node_modules" not in filename,
        })
    frames.reverse()
    return frames[:50]


def post_to_sink(event: dict) -> bool:
    payload = json.dumps(event).encode()
    req = urllib.request.Request(SINK, data=payload, headers={
        "Content-Type": "application/json",
        "X-Sentry-Auth": SINK_AUTH,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return 200 <= res.status < 300
    except Exception as e:  # noqa: BLE001
        log(f"sink refused event: {e}")
        # The most likely reason is that the app isn't running — open it
        # in the background and let the next cycle retry the same ids.
        if SINK_APP.exists():
            subprocess.run(["open", "-g", str(SINK_APP)], capture_output=True)
        return False


def sentry_event(row: dict) -> dict:
    stack = row.get("stack") or ""
    exception = {
        "type": row.get("name") or "Error",
        "value": (row.get("message") or "")[:1000] or (row.get("name") or "Error"),
    }
    frames = frames_from(stack)
    if frames:
        exception["stacktrace"] = {"frames": frames}
    tags = {
        "surface": row.get("surface") or "unknown",
        "monitor": "t2q-production",
    }
    if row.get("route"):
        tags["route"] = str(row["route"])[:200]
    if row.get("http_status"):
        tags["http_status"] = str(row["http_status"])
    return {
        # The monitor's uuid, re-used verbatim: replaying a batch after a
        # crash cannot double-count, because the sink dedupes on event_id.
        "event_id": uuid.UUID(row["id"]).hex,
        "timestamp": row["occurred_at"],
        "platform": "javascript" if frames else "other",
        "level": "error",
        "logger": row.get("surface") or "server",
        "environment": row.get("environment") or "production",
        "release": row.get("release_sha") or None,
        "fingerprint": [row["fingerprint"]],
        "exception": {"values": [exception]},
        "extra": {"stack_raw": stack[:8000]} if stack and not frames else {},
    }


def post_bridge_notice(fingerprint: str, level: str, message: str) -> None:
    post_to_sink({
        "event_id": uuid.uuid4().hex,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "platform": "other",
        "level": level,
        "logger": "bridge",
        "environment": "production",
        "fingerprint": [fingerprint],
        "message": message,
        "tags": {"monitor": "t2q-production", "source": "bridge"},
    })


# ── Kicking the fixer ─────────────────────────────────────────────────────

def maybe_trigger_fix(row: dict, state: dict) -> None:
    if row.get("environment") != "production":
        return
    fp = row["fingerprint"]
    if fp in state["triggered"]:
        return
    occurred = row.get("occurred_at") or ""
    try:
        age = time.time() - datetime.datetime.fromisoformat(occurred).timestamp()
    except ValueError:
        age = FRESH_ENOUGH_S + 1
    if age > FRESH_ENOUGH_S:
        return  # historical backfill must never wake the fixer
    day_ago = time.time() - 86400
    recent = sum(1 for t in state["triggered"].values() if t > day_ago)
    if recent >= FIX_TRIGGERS_PER_DAY:
        log(f"fix trigger for {fp[:8]} skipped — daily cap reached")
        return
    state["triggered"][fp] = time.time()
    LOGS.mkdir(parents=True, exist_ok=True)
    out = open(LOGS / f"autofix-triggered-{fp[:8]}.log", "a")
    subprocess.Popen(["/usr/bin/python3", str(AUTOFIX), "--fingerprint", fp],
                     stdout=out, stderr=out, start_new_session=True)
    log(f"NEW problem {fp[:8]} — fixer session started immediately")


# ── The loop ──────────────────────────────────────────────────────────────

def cycle(state: dict, failures: int) -> int:
    try:
        rows = fetch_events(state)
    except Exception as e:  # noqa: BLE001
        failures += 1
        log(f"monitor unreachable ({failures}x): {e}")
        now = time.time()
        if failures == OUTAGE_AFTER_FAILURES or (
            state.get("outage") and now - state.get("last_outage_post", 0) >= OUTAGE_REMINDER_S
        ):
            if not state.get("outage"):
                state["outage"] = now
            state["last_outage_post"] = now
            minutes = int((now - state["outage"]) / 60)
            post_bridge_notice(
                "t2q-monitor-unreachable", "error",
                f"Production monitor unreachable for {minutes} min — the VPS "
                f"(tradies2quote.com and everything beside it) is likely down. "
                f"Restart it at my.contabo.com.",
            )
            save_state(state)
        return failures

    if failures >= OUTAGE_AFTER_FAILURES and state.get("outage"):
        minutes = int((time.time() - state["outage"]) / 60)
        post_bridge_notice("t2q-monitor-recovered", "info",
                           f"Production monitor reachable again after {minutes} min down.")
        log(f"monitor reachable again after {minutes} min")
    state["outage"] = None
    failures = 0

    for row in rows:
        if post_to_sink(sentry_event(row)):
            state["watermark"] = row["occurred_at"]
            state["watermark_id"] = row["id"]
            maybe_trigger_fix(row, state)
        else:
            break  # sink is down; keep the watermark so nothing is skipped
    if rows:
        log(f"forwarded {len(rows)} event(s) up to {state['watermark']}")
        save_state(state)
    return failures


def main() -> None:
    log(f"bridge up — monitor:{SSH_HOST} → sink:{SINK} · poll {POLL_SECONDS}s")
    state = load_state()
    failures = 0
    while True:
        try:
            failures = cycle(state, failures)
        except Exception as e:  # noqa: BLE001 — the bridge must outlive any one bug
            log(f"cycle error: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
