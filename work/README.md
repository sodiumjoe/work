# daily-workflow

Daily work tracking with Obsidian integration for Claude Code. Manages daily notes, project files, plan files, and work logging through slash commands backed by composable shell scripts.

## Architecture

```
User ──> /command ──> command prompt (commands/*.md)
                          │
                          ├── calls scripts (scripts/*)
                          ├── reads/writes daily note
                          ├── reads/writes project files
                          └── reads/writes plan files
```

Commands are markdown prompt templates that Claude Code executes. Each command declares its allowed tools in YAML frontmatter. Scripts handle deterministic operations (file parsing, section insertion, deduplication). The LLM handles judgment calls (user interaction, plan context summarization, duplicate detection).

### Data flow: typical day

```
/start-day
  gather ──> ensure-daily-note
           ├─> carry-forward-queue   (yesterday's open items → today's queue)
           ├─> sync-check            (plan/project completions not in daily note)
           ├─> scan-open-items       (unchecked changelog items across plans + projects)
           └─> inject-plan-items     (open items → today's queue)
  sync-check | log-sync-entries      (log unlogged completions)

/next
  gather (same as above)
  sync-check | log-sync-entries
  user picks task → mark-queue-item  (set [/] in progress)
  → create-project + EnterPlanMode (new task) or resume project/plan context (existing task)

/log
  ensure-daily-note
  sync-check | log-sync-entries
  resolve-project → update project or plan changelog + daily note
  mark-queue-item                    (set [x] completed)

/end-day
  gather (same as above)
  sync-check | log-sync-entries
  compile-summary                    (daily note → summary section)
```

## Commands

| Command | Description | Key scripts used |
|---------|-------------|-----------------|
| `/start-day` | Initialize daily note, sync completions, review queue | gather, log-sync-entries |
| `/log` | Log completed work to daily note and project/plan changelog | ensure-daily-note, sync-check, log-sync-entries, resolve-project, mark-queue-item |
| `/next` | Pick a task, start or resume it | gather, log-sync-entries, create-project, mark-queue-item |
| `/note` | Append freeform note to daily note log | ensure-daily-note |
| `/end-day` | Summarize day's progress and open items | gather, log-sync-entries, compile-summary |
| `/archive-plans` | Archive completed plans, generate monthly summary | resolve-project, (direct file operations) |

## Scripts

All scripts live in `scripts/`. They use `set -euo pipefail` (except `gather` which uses `set -uo pipefail` for per-script error tracking).

### Orchestration

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `gather` | Run all sync scripts in sequence; cache scan output | optional date arg | per-script status to stderr; scan cache at `/tmp/daily-workflow-scan` |

`gather` runs: ensure-daily-note → carry-forward-queue → sync-check → scan-open-items → inject-plan-items

### Daily note operations

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `ensure-daily-note` | Create today's `YYYY-MM-DD.md` if missing | (none) | "created" or "exists" |
| `carry-forward-queue` | Copy open/in-progress queue items from previous day | (none) | count of carried items |
| `inject-plan-items` | Add open plan/project changelog items to queue (deduped) | scan-open-items TSV on stdin | count of injected items |
| `log-sync-entries` | Append sync-check results to `## Log` section | sync-check TSV on stdin; `--dry-run` flag | count logged, or preview lines with `--dry-run` |
| `mark-queue-item` | Toggle a queue item's checkbox status | `<substring> <status>` args | matched line, or error if 0/multiple matches |
| `compile-summary` | Generate end-of-day summary from daily note + scan data | optional date arg; scan data on stdin or runs scan-open-items | formatted summary text |

### Plan/project file operations

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `scan-open-items` | Find unchecked changelog items across plans and projects | (none) | TSV: `filename\ttitle\titem_text\tsource_type` |
| `sync-check` | Find plan/project completions not yet in daily note | optional date arg | TSV: `filename\ttitle\titem_text\tsource_type` |
| `parse-changelog` | Extract matching lines from a file's changelog | `<file> <pattern>` args | TSV: `filename\ttitle\tmatching_line` |
| `create-project` | Create a new project file from template | `<slug> <title>` args | created file path |
| `resolve-project` | Find parent project for a plan file | `<plan-file-path>` arg | project file path (empty if none) |

### Utilities

| Script | Purpose |
|--------|---------|
| `lib.sh` | Shared functions (`extract_section`). Source with `. "$DIR/lib.sh"` |
| `nvim-edit` | Open a file in the editor neovim window via nvim-remote plugin |

## Data model

### TSV convention

Scripts that output structured data use tab-separated values: `filename\ttitle\titem_text\tsource_type`

- `filename`: file basename (e.g. `2026-02-27-my-plan.md` or `my-project.md`)
- `title`: first `# ` heading from the file
- `item_text`: changelog entry text with checkbox prefix stripped
- `source_type`: `plan` or `project` — determines wikilink prefix and file path resolution

### Daily note format

Path: `~/stripe/work/YYYY-MM-DD.md`

```markdown
## Queue
- [ ] Open task — [[projects/project-slug|Project Title]]
- [/] In-progress task — [[projects/project-slug|Project Title]]
- [ ] Standalone task — [[plans/plan-file|Plan Title]]

## Log
- [x] Completed item ✅ YYYY-MM-DD — [[projects/project-slug|Project Title]]
- [x] Standalone item ✅ YYYY-MM-DD — [[plans/plan-file|Plan Title]]
- HH:MM — Freeform note

## Summary
### Completed
- [x] ...
### Open
- [ ] ...
### Stale (>7d)
- Title (Nd)
```

### Project file format

Path: `~/stripe/work/projects/<slug>.md`

```markdown
---
status: active
---

# Project Title

## Links
External references.

## Plans
- [[plans/plan-file|Plan Title]]

## Changelog
- [x] Completed step ✅ YYYY-MM-DD
- [ ] Pending step

## Notes
Cross-plan context and decisions.
```

Projects are the primary work unit. They own the canonical task list (changelog). Plans are implementation documents underneath a project.

### Plan file format

Path: `~/.claude/plans/YYYY-MM-DD-slug.md`

**With project (no changelog):**
```markdown
---
status: active
project: "[[projects/project-slug]]"
---

# Plan Title

## Context
Why this change is needed.

## Approach
Implementation strategy.

## Files to modify
| File | Changes |

## Verification
How to test.

## Notes
Investigation findings.
```

**Without project (standalone, has changelog):**
```markdown
---
status: active
---

# Plan Title

## Context
## Approach
## Files to modify
## Verification
## Notes

## Changelog
- [x] Completed step ✅ YYYY-MM-DD
- [ ] Pending step
```

### Checkbox states

| State | Meaning | Markdown |
|-------|---------|----------|
| Open | Not started | `- [ ]` |
| In progress | Currently working | `- [/]` |
| Completed | Done | `- [x]` |

### Done-date metadata

Completed changelog entries use `✅ YYYY-MM-DD` suffix for Obsidian Tasks integration. This allows daily notes to query completed work from plans and projects by date.

## File layout

| Path | Purpose |
|------|---------|
| `~/stripe/work/` | Obsidian vault root |
| `~/stripe/work/YYYY-MM-DD.md` | Daily notes |
| `~/stripe/work/projects/` | Project files (canonical task lists) |
| `~/.claude/plans/` | Active plan files (symlinked into vault at `~/stripe/work/plans/`) |
| `~/stripe/work/archive/` | Archived plans (not synced to devboxes) |
| `~/stripe/work/monthly/YYYY-MM.md` | Monthly work summaries |

## Devbox integration

The `dev` zsh function (`~/.dotfiles/zsh/.zshrc`) connects the daily workflow to remote devboxes. It is a shell function, not a Claude Code command, because it needs FZF and interactive SSH.

### Flow

```
dev
  1. Parse today's queue (open + in-progress items)
  2. FZF task selection
  3. Mark selected task as [/] in-progress (via mark-queue-item)
  4. FZF devbox selection (existing or create new)
  5. Sync plans + projects to devbox
  6. tmux nest → SSH → tmux unnest
  7. Sync plans + projects back from devbox
```

### Devbox file layout

| Local path | Devbox path | Sync direction |
|------------|-------------|----------------|
| `~/stripe/work/plans/` → `~/.claude/plans/` | `~/.claude/plans/` | Bidirectional (`--delete`) |
| `~/stripe/work/projects/` | `~/.claude/projects/` | Bidirectional (no `--delete`) |

`resolve-project` has a fallback: if `~/stripe/work/projects/<slug>.md` doesn't exist (devbox), it checks `~/.claude/projects/<slug>.md`.

### Sync functions (`~/.dotfiles/zsh/.zshrc`)

| Function | Purpose |
|----------|---------|
| `_sync_plans_to_remote <host>` | rsync plans (with `--delete`) and projects to devbox |
| `_sync_plans_from_remote <host>` | rsync plans and projects back from devbox |
| `_sync_project_to_remote <host> <slug>` | rsync a single project file to devbox |

These are also called by `remotes()`, `remote()`, and `mremote()` for plan syncing. The `dev` function adds project syncing on top.

## Dependencies

- **nvim-remote plugin** (`~/.dotfiles/claude/marketplace/plugins/nvim-remote/`): Required by `nvim-edit` for opening files in neovim. Silently skipped if unavailable.
- **Obsidian vault**: Daily notes and plan symlinks assume the vault structure above.
- **bash 3.2+**: All scripts use bash features available in macOS default bash (nullglob, arrays, `[[ ]]`).
- **awk**: Used by `scan-open-items` and `sync-check` for changelog parsing.
- **fzf**: Required by the `dev` shell function for interactive task and devbox selection.