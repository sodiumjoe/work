# work

Daily work tracking with Obsidian integration for Claude Code. Manages daily notes, project files, plan files, and work logging through slash commands backed by a Node.js CLI.

## Architecture

```
User ──> /command ──> command prompt (commands/*.md)
                          │
                          ├── calls `work` CLI (bin/work)
                          ├── reads/writes daily note
                          ├── reads/writes project files
                          └── reads/writes plan files
```

Commands are markdown prompt templates that Claude Code executes. Each command declares its allowed tools in YAML frontmatter. The `work` CLI handles deterministic operations (file parsing, section insertion, deduplication). The LLM handles judgment calls (user interaction, plan context summarization, duplicate detection).

### Module layout

```
bin/work          CLI entrypoint
lib/paths.js      Path constants (VAULT_ROOT, PLAN_DIR, PROJECT_DIR)
lib/daily.js      Daily note operations (ensure, carry, mark, inject)
lib/scan.js       Plan/project scanning (scanOpenItems, syncCheck)
lib/project.js    Project file operations (createProject, resolveProject)
lib/changelog.js  Changelog mutations (checkOff, appendLog)
lib/markdown.js   Markdown parsing (extractSection, parseFrontmatter)
lib/checkbox.js   Checkbox parsing and state management
lib/atomic.js     Atomic file rewrite (read-transform-rename)
```

### Data flow: typical day

```
/start-day
  work gather ──> ensure (create daily note)
                ├─> carry   (yesterday's open items → today's queue)
                ├─> sync    (plan/project completions not in daily note)
                ├─> scan    (unchecked changelog items across plans + projects)
                └─> inject  (open items → today's queue)
  work sync --apply         (log unlogged completions)

/next
  work gather (same as above)
  work sync --apply
  work queue                (TSV of open items for selection)
  work mark <item> '[/]'   (set in progress)
  → create-project + EnterPlanMode (new) or resume context (existing)

/log
  work ensure
  work sync --apply
  work check-off <file> <description>   (update project/plan changelog)
  work mark <item> '[x]'               (mark queue item complete)
  work append-log <description> --source-type=... --source-slug=... --source-title=...

/end-day
  work gather
  work sync --apply
  work summary              (compile end-of-day summary)
```

## CLI

```
work <command> [options]

Commands:
  ensure                       Create today's daily note if missing
  carry                        Carry forward open queue items from previous day
  sync [--apply]               Find unlogged changelog completions
  scan                         Scan plans/projects for open changelog items (TSV)
  inject                       Add scanned items to queue (reads stdin or runs scan)
  gather                       Run ensure + carry + sync + scan + inject
  mark <substr> <status>       Toggle a queue item's checkbox
  queue                        List open/in-progress queue items (TSV)
  summary                      Generate end-of-day summary
  check-off <file> <desc>      Check off or append a changelog entry
  append-log <desc>            Append entry to daily note log section
  create-project <slug> <title> Create a new project file
  resolve-project <plan-file>  Find project file from plan frontmatter
  parse-changelog <file> <pat> Extract matching changelog lines (TSV)

Options:
  --date=YYYY-MM-DD            Override date (defaults to today)
  --source-type=plan|project   Source type for append-log
  --source-slug=<slug>         Source slug for append-log wikilink
  --source-title=<title>       Source title for append-log wikilink
```

## Data model

### TSV convention

Commands that output structured data use tab-separated values: `filename\ttitle\titem_text\tsource_type`

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
## Plans
## Changelog
- [x] Completed step ✅ YYYY-MM-DD
- [ ] Pending step

## Notes
```

### Plan file format

Path: `~/.claude/plans/YYYY-MM-DD-slug.md`

With project (no changelog — project owns the canonical task list):
```markdown
---
status: active
project: "[[projects/project-slug]]"
---

# Plan Title
## Context
## Approach
## Files to modify
## Verification
## Notes
```

Without project (standalone, has its own changelog):
```markdown
---
status: active
---

# Plan Title
## Context
## Approach
## Changelog
- [x] Step ✅ YYYY-MM-DD
## Notes
```

### Checkbox states

| State | Meaning | Markdown |
|-------|---------|----------|
| Open | Not started | `- [ ]` |
| In progress | Currently working | `- [/]` |
| Completed | Done | `- [x]` |

### Done-date metadata

Completed changelog entries use `✅ YYYY-MM-DD` suffix for Obsidian Tasks integration.

## File layout

| Path | Purpose |
|------|---------|
| `~/stripe/work/` | Obsidian vault root |
| `~/stripe/work/YYYY-MM-DD.md` | Daily notes |
| `~/stripe/work/projects/` | Project files |
| `~/.claude/plans/` | Active plan files (symlinked into vault at `~/stripe/work/plans/`) |
| `~/stripe/work/archive/` | Archived plans |
| `~/stripe/work/monthly/YYYY-MM.md` | Monthly work summaries |

## Devbox integration

The `dev` zsh function (`~/.dotfiles/zsh/.zshrc`) connects the daily workflow to remote devboxes.

```
dev
  1. work queue → parse open/in-progress items
  2. FZF task selection
  3. work mark <item> '[/]'
  4. FZF devbox selection (existing or create new)
  5. Sync plans + projects to devbox
  6. tmux nest → SSH → tmux unnest
  7. Sync plans + projects back from devbox
```

## Dependencies

- Node.js >= 18
- fzf (dev function only)
- nvim-remote (`scripts/nvim-remote/`) for editor integration (silently skipped if unavailable)