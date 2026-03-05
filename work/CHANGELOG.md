# Changelog

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