#!/usr/bin/env python3
"""
Level 2 of the self-healing ladder: the overnight fix proposer.

Every morning at 7:00 NZ — fifteen minutes after the error digest email —
this runner asks the production error monitor what broke in the last day,
and for each new problem spawns a headless Claude Code session in the
right repository with one job: reproduce it, write the failing test,
fix it, run every gate, and leave the result on an `autofix/…` branch.
The owner wakes to a "proposed fixes" email holding tested diffs.

What this deliberately does NOT do:
  - It never pushes, never deploys, never restarts anything. A branch on
    this laptop is as far as an unreviewed fix can travel.
  - The fix sessions are forbidden (by prompt, and by review) from
    touching migrations, auth, RLS, payments or .env files — a problem
    in those is reported as needs_human instead of "fixed".
  - A quiet night sends no email and spawns no sessions.

Run it by hand:
  python3 autofix.py                  # what launchd runs every morning
  python3 autofix.py --fingerprint X  # force one group, ignoring windows
  python3 autofix.py --dry-run        # show candidates, spawn nothing
"""

import argparse
import datetime
import json
import pathlib
import re
import shlex
import subprocess
import sys
import urllib.request

# ── Where everything lives ────────────────────────────────────────────────

SSH_HOST = "nursemate-vps"
DB_CONTAINER = "tradies-supabase-db"
CLAUDE = "/Users/admin/.local/bin/claude"
MODEL = "claude-opus-5"

WEB_REPO = pathlib.Path("~/Desktop/tradies2quote").expanduser()
IOS_REPO = pathlib.Path(
    "~/Desktop/blocklayer/.claude/worktrees/blocklayer-diagram-alignment-cd4a7f"
).expanduser()

HOME = pathlib.Path("~/.t2q-autofix").expanduser()
STATE = HOME / "state.json"
LOGS = HOME / "logs"
REPORTS = HOME / "reports"

OWNER_EMAIL = "challis836@gmail.com"
MAX_FIXES_PER_NIGHT = 3
SESSION_TIMEOUT_S = 35 * 60
RETRY_AFTER_DAYS = 7  # an attempted fingerprint rests this long before retry


def log(msg: str) -> None:
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    day = datetime.date.today().isoformat()
    with open(LOGS / f"run-{day}.log", "a") as f:
        f.write(line + "\n")


# ── Reading the monitor ───────────────────────────────────────────────────

def sql(query: str):
    """One row of JSON out of production, over ssh. Read-only queries only."""
    remote = (
        f"docker exec {DB_CONTAINER} psql -U postgres -d postgres -Atc {shlex.quote(query)}"
    )
    out = subprocess.run(
        ["ssh", "-o", "ConnectTimeout=15", SSH_HOST, remote],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"query failed: {out.stderr.strip()[:200]}")
    text = out.stdout.strip()
    return json.loads(text) if text else None


def candidates(forced_fingerprint=None):
    """Unresolved groups that hurt someone in the last day, worst first,
    each carrying its latest scrubbed event for the fixer to read."""
    where = (
        f"g.fingerprint = '{forced_fingerprint}'"
        if forced_fingerprint
        else "g.resolved_at is null and g.last_seen_at > now() - interval '1 day'"
    )
    query = f"""
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select g.fingerprint, g.title, g.surface, g.route, g.event_count,
               g.first_seen_at, g.last_seen_at,
               (select count(*) from app_error_events e
                 where e.group_id = g.id
                   and e.occurred_at > now() - interval '1 day') as window_count,
               le.name, le.message, le.stack, le.http_status, le.release_sha,
               le.occurred_at as sample_at
        from app_error_groups g
        left join lateral (
          select * from app_error_events e
          where e.group_id = g.id and e.environment = 'production'
          order by e.occurred_at desc limit 1
        ) le on true
        where {where}
        order by window_count desc, g.last_seen_at desc
        limit {MAX_FIXES_PER_NIGHT}
      ) t
    """
    return sql(query) or []


# ── Choosing the repo ─────────────────────────────────────────────────────

def repo_for(group) -> tuple[pathlib.Path, str]:
    """T2QCAL's crash reports land as client errors on /t2qcal; everything
    else in the monitor is the website's own."""
    if (group.get("route") or "") == "/t2qcal":
        return IOS_REPO, "ios"
    return WEB_REPO, "web"


GATES = {
    "web": "npm run lint, npx vitest run (all of it), npm run build — all three must pass.",
    "ios": (
        "the pure-model audit (copy tools/AuditSheets.swift to a scratch main.swift and "
        "`swiftc -O ios/T2QCAL/T2QCAL/Models/*.swift ios/T2QCAL/T2QCAL/Engine/*.swift main.swift`), "
        "then an `xcodebuild -project ios/T2QCAL/T2QCAL.xcodeproj -scheme T2QCAL "
        "-destination 'generic/platform=iOS Simulator' build`. Both must pass, zero BROKEN lines."
    ),
}


# ── The fix session ───────────────────────────────────────────────────────

def build_prompt(group, kind: str, branch: str) -> str:
    sample = {
        "name": group.get("name"),
        "message": group.get("message"),
        "stack": (group.get("stack") or "")[:4000],
        "route": group.get("route"),
        "http_status": group.get("http_status"),
        "release_sha": group.get("release_sha"),
        "occurred_at": group.get("sample_at"),
    }
    return f"""You are the overnight fix proposer for this repository. One production error group is yours tonight. Work autonomously; the owner is asleep and will review your branch in the morning.

THE ERROR (from the internal monitor; message and stack already PII-scrubbed):
  title: {group['title']}
  surface: {group['surface']}   route: {group.get('route')}
  hits: {group.get('window_count')} in the last day, {group.get('event_count')} lifetime; first seen {group.get('first_seen_at')}
  latest event: {json.dumps(sample, indent=2)}

YOUR JOB, in order:
1. Find the code that produced this error and understand the real cause. Read before you write.
2. If the cause can be captured in a test, write the FAILING test first, then make it pass. If it truly cannot be unit-tested, say so in your summary honestly.
3. Fix minimally, in the style of the surrounding code. No drive-by refactors.
4. Run the gates: {GATES[kind]}
5. Commit on a NEW branch `{branch}` created from the current branch, then RETURN the repo to the branch it was on. Use `git add <specific files you changed>` only.

HARD RULES — breaking any of these makes the night's work worthless:
- NEVER push, deploy, ssh anywhere, or restart any service. The branch is the deliverable.
- NEVER touch: .env* files, supabase/migrations/**, anything under payments/billing/Stripe, auth or RLS code. If the real fix lives there, do NOT fix it — set verdict "needs_human" and explain.
- Leave every pre-existing uncommitted change exactly as you found it; never `git add -A`.
- If you cannot reproduce or the error is external noise (bots, stale clients), set verdict "not_a_code_bug" and change nothing.

YOUR FINAL MESSAGE must be ONLY this JSON object, nothing else:
{{"fingerprint": "{group['fingerprint']}", "verdict": "fixed|needs_human|not_a_code_bug|failed",
 "branch": "{branch}", "summary": "2-3 plain sentences: cause, and what the fix does",
 "test_added": true, "gates_passed": true, "files_touched": ["..."]}}"""


def run_session(group) -> dict:
    repo, kind = repo_for(group)
    slug = group["fingerprint"][:8]
    branch = f"autofix/{slug}-{datetime.date.today().strftime('%Y%m%d')}"
    prompt = build_prompt(group, kind, branch)
    log(f"session start: {slug} in {repo.name} ({kind})")
    try:
        out = subprocess.run(
            [CLAUDE, "-p", prompt, "--model", MODEL, "--dangerously-skip-permissions"],
            cwd=repo, capture_output=True, text=True, timeout=SESSION_TIMEOUT_S,
        )
        raw = out.stdout.strip()
    except subprocess.TimeoutExpired:
        return {"fingerprint": group["fingerprint"], "verdict": "failed",
                "branch": branch, "summary": "Fix session hit the 35-minute limit.",
                "test_added": False, "gates_passed": False, "files_touched": []}

    match = re.search(r"\{[\s\S]*\}\s*$", raw)
    if not match:
        return {"fingerprint": group["fingerprint"], "verdict": "failed",
                "branch": branch,
                "summary": f"Session ended without its report. Last output: {raw[-300:]}",
                "test_added": False, "gates_passed": False, "files_touched": []}
    try:
        report = json.loads(match.group(0))
    except json.JSONDecodeError:
        report = {"fingerprint": group["fingerprint"], "verdict": "failed",
                  "branch": branch, "summary": f"Unparseable report: {match.group(0)[:300]}",
                  "test_added": False, "gates_passed": False, "files_touched": []}

    # Trust, then verify the one claim that matters: does the branch exist?
    if report.get("verdict") == "fixed":
        show = subprocess.run(["git", "rev-parse", "--verify", branch],
                              cwd=repo, capture_output=True, text=True)
        if show.returncode != 0:
            report["verdict"] = "failed"
            report["summary"] += " (Claimed fixed, but the branch does not exist.)"
    report["title"] = group["title"]
    report["repo"] = repo.name
    log(f"session done: {slug} → {report.get('verdict')}")
    return report


# ── Telling the owner ─────────────────────────────────────────────────────

def vps_env(key: str) -> str:
    """Read a mail credential off the VPS at send time — nothing secret is
    stored on this laptop, and the value is used, not printed."""
    out = subprocess.run(
        ["ssh", SSH_HOST, f"grep '^{key}=' ~/tradies2quote/.env.local | head -1 | cut -d= -f2-"],
        capture_output=True, text=True, timeout=30,
    )
    return out.stdout.strip().strip('"')


def send_email(reports: list) -> bool:
    api_key = vps_env("RESEND_API_KEY")
    sender = vps_env("RESEND_FROM_EMAIL")
    if not api_key or not sender:
        log("email not configured; report saved to disk only")
        return False

    fixed = [r for r in reports if r["verdict"] == "fixed"]
    subject = (
        f"T2Q autofix — {len(fixed)} proposed fix{'es' if len(fixed) != 1 else ''} ready to review"
        if fixed else "T2Q autofix — looked at last night's errors, no branch to offer"
    )
    lines = ["WHAT THE OVERNIGHT FIXER DID", ""]
    for r in reports:
        lines += [f"  • [{r['verdict'].upper()}] {r.get('title', r['fingerprint'][:12])}",
                  f"      {r['summary']}"]
        if r["verdict"] == "fixed":
            lines += [f"      branch: {r['branch']}  (repo: {r['repo']})",
                      f"      test added: {'yes' if r.get('test_added') else 'no'} · gates: {'green' if r.get('gates_passed') else 'NOT green'}",
                      f"      files: {', '.join(r.get('files_touched', [])[:6])}"]
        lines.append("")
    lines += [
        "Nothing has been deployed and nothing was pushed — each fix is a local branch on the Mac.",
        "To ship one: open Claude Code and say “review and ship <branch>”.",
    ]
    body = "\n".join(lines)

    payload = json.dumps({
        "from": sender, "to": [OWNER_EMAIL], "subject": subject, "text": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            ok = 200 <= res.status < 300
    except Exception as e:  # noqa: BLE001 — a failed email must not kill the run
        log(f"email failed: {e}")
        return False
    log(f"email {'sent' if ok else 'refused'}: {subject}")
    return ok


# ── The night's run ───────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fingerprint", help="force one group, ignoring windows and rest days")
    parser.add_argument("--dry-run", action="store_true", help="list candidates, spawn nothing")
    args = parser.parse_args()

    HOME.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}

    try:
        groups = candidates(args.fingerprint)
    except Exception as e:  # noqa: BLE001
        log(f"could not read the monitor: {e}")
        return 1

    if not args.fingerprint:
        fresh_cut = (datetime.datetime.now() - datetime.timedelta(days=RETRY_AFTER_DAYS)).isoformat()
        groups = [g for g in groups
                  if state.get(g["fingerprint"], {}).get("at", "") < fresh_cut]

    if not groups:
        log("quiet night — nothing to fix, nobody to email")
        return 0

    log(f"{len(groups)} candidate(s): " + ", ".join(g["fingerprint"][:8] for g in groups))
    if args.dry_run:
        for g in groups:
            print(json.dumps({k: g[k] for k in ("fingerprint", "title", "surface", "route",
                                                "window_count", "event_count")}, indent=2))
        return 0

    reports = []
    for g in groups:
        report = run_session(g)
        reports.append(report)
        state[g["fingerprint"]] = {
            "at": datetime.datetime.now().isoformat(),
            "verdict": report["verdict"], "branch": report["branch"],
        }
        STATE.write_text(json.dumps(state, indent=2))

    stamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    (REPORTS / f"report-{stamp}.json").write_text(json.dumps(reports, indent=2))
    send_email(reports)
    return 0


if __name__ == "__main__":
    sys.exit(main())
