# Changelog

## 2.4.0 — 2026-03-10

- Moved tick log from `/tmp/work-tick.log` to `~/Library/Logs/work-tick.log` (persists across reboots)
- Added log rotation to `tick` — rotates to dated file when log exceeds 1000 lines
- Fixed error injection to target `## Tasks` section instead of `## Log`
- Fixed `wrap` to pass `--allowedTools Read Edit` to Claude and send prompt via stdin
- Added tests for log rotation, error injection, and Claude permissions

## 2.2.1 — 2026-03-09

- Fixed evergreen project filtering — projects with `evergreen: true` now included regardless of status
- Fixed evergreen placeholder logic — uses `hasOpenTasks` instead of `tasks.length` to determine when to add placeholder

## 2.0.0 — 2026-03-05

Rewrote from bash scripts to Node.js modules with a single `work` CLI.

- Replaced all bash scripts with `lib/*.js` modules and `bin/work` CLI
- Created `lib/paths.js` — centralized path constants (VAULT_ROOT, PLAN_DIR, PROJECT_DIR)
- Fixed `lib/atomic.js` — cross-volume rename bug (temp file now same directory as target)
- Fixed `lib/markdown.js` — parseFrontmatter returns `{}` on unclosed frontmatter
- Fixed `lib/daily.js` — TOCTOU race in `mark` (search inside atomicRewrite callback)
- Added `parseStatusArg` — validates mark status input, accepts `[/]` or bare `/`
- Fixed `lib/scan.js` — syncCheck dedup scoped to Log section instead of entire daily note
- Fixed `lib/daily.js` inject — no double-blank-lines when inserting before section
- Fixed `lib/project.js` — regex try/catch in parseChangelog, throws instead of process.exit
- Fixed `scripts/nvim-edit` — relative path resolution instead of hardcoded absolute path
- Created `lib/changelog.js` — `checkOff` and `appendLog` functions
- Added `work check-off` and `work append-log` CLI commands
- Updated `commands/log.md` — uses CLI commands instead of LLM file editing
- Added `work queue` command — TSV output of open/in-progress queue items
- Removed `Write` and `Edit` from `commands/log.md` allowed-tools
- All lib modules throw errors instead of calling process.exit
- Added error wrapper in bin/work for consistent exit handling
- Added package.json with test script and engine requirement
- Added tests: parseFrontmatter unclosed, parseStatusArg, checkOff

## 1.2.0 — 2026-02-26

- Added `set -euo pipefail` to all scripts (`set -uo pipefail` for gather)
- gather: deterministic cache path, error propagation with per-script failure reporting
- scan-open-items, sync-check: null-delimited xargs for filenames with spaces
- sync-check: replaced subprocess-per-entry dedup loop with bash string matching
- carry-forward-queue: structural validity guard before mv, standardized checkbox regex
- archive-plans: backup step before deleting abandoned plans
- end-day: deterministic scan cache path (no more stdout parsing)
- next: explicit branching criteria for task state
- log: plan file existence validation
- start-day: documented sync-check recovery behavior
- compile-summary: improved variable naming

## 1.1.0 — 2026-02-25

- Merged `/next-task` into `/next` — single command now loads plan context and pauses for elaboration before starting work

## 1.0.0

- Initial release — daily notes, plan management, devbox sync detection
- Commands: start-day, end-day, next, log, note, archive-plans