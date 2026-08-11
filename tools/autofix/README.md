# The overnight fix proposer (self-healing, level 2)

Every morning at 7:00 NZ — fifteen minutes after the error-digest email —
`autofix.py` runs on the Mac (launchd: `com.tradies2quote.autofix`), asks the
production error monitor what broke in the last day, and for each new problem
spawns a headless Claude Code session in the right repository:

- website errors → `~/Desktop/tradies2quote`
- T2QCAL crash reports (`route = /t2qcal`) → the blocklayer worktree

Each session must find the cause, **write the failing test first**, fix
minimally, run every gate (web: lint + vitest + build; iOS: model audit +
simulator build), and commit to an `autofix/<fingerprint>-<date>` branch. The
owner wakes to a "proposed fixes" email listing tested diffs.

## The safety envelope

- **Nothing ships itself.** No push, no deploy, no restart — a local branch is
  as far as an unreviewed fix can travel. Shipping is a human saying
  "review and ship `autofix/…`" to Claude Code.
- Sessions are forbidden from touching `.env*`, `supabase/migrations/**`,
  payments/Stripe, auth or RLS code. A problem living there comes back as
  `needs_human`, not as a "fix".
- Bot noise and stale-client errors come back as `not_a_code_bug`, untouched.
- At most 3 fixes a night; an attempted fingerprint rests 7 days before retry;
  a quiet night spawns nothing and emails nothing.
- Mail credentials are read off the VPS at send time, never stored here.

## Running it by hand

    python3 tools/autofix/autofix.py --dry-run          # list candidates only
    python3 tools/autofix/autofix.py --fingerprint <fp> # force one group
    python3 tools/autofix/autofix.py                    # the real morning run

State, logs and reports live in `~/.t2q-autofix/`. Kill switch:
`launchctl bootout gui/501/com.tradies2quote.autofix`.

## The bridge (production → STR8SENTRY, live)

`bridge.py` polls the production monitor every 45s and forwards each event into
STR8SENTRY's ingest (`localhost:8969`, project "20") with the monitor's own
fingerprint and event id — same grouping, idempotent replays. A brand-new
production problem also starts an autofix session immediately (same caps and
envelope as the 7:00am run; backfilled history never triggers). If the VPS
stops answering for ~3 minutes, the bridge posts "production monitor
unreachable" into STR8SENTRY so the server dying finally raises a Mac
notification — recovery is posted the same way.

**macOS trap, learned the hard way:** launchd agents cannot read `~/Desktop`
(TCC privacy). Both plists therefore run copies in `~/.t2q-autofix/bin/` —
re-copy after editing these files. The fixer's own git/build work still needs
Desktop access, so under launchd it requires python3 granted Full Disk Access
(System Settings → Privacy & Security); a bridge started from a terminal
session has access and needs nothing.
