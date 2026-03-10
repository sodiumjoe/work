# work

Daily work tracking with Obsidian integration for Claude Code. Manages daily notes, project files, plan files, and work logging through slash commands backed by a Node.js CLI.

## Usage

### Starting work

`<leader>ap` opens a picker showing all open tasks across projects and plans. Select one to start a scoped Claude Code session with the project file and task description injected as context. The tmux window label updates to the task name.

`<leader>aP` creates a new project from scratch — prompts for a title, generates the project file, opens it in a buffer, and starts a session scoped to it.

### During a session

The session knows which project it belongs to. Use `EnterPlanMode` to plan implementation, then execute. When work is done:

- Claude uses `work check-off <project-file> <description>` to mark changelog entries complete
- Claude uses `work append-log <description> --source-type=project --source-slug=<slug> --source-title=<title>` to log completions to the daily note
- `/note` to record freeform observations, links, or discoveries
- `/name` to relabel the tmux window if the focus shifts

### Adding tasks to a project

Add `- [ ] Description` lines to the project's `## Changelog` section. They surface in the picker next time `<leader>ap` runs (or on the next hourly `work tick`).

### Lifecycle

Open changelog items keep a project visible in the queue. When all items are checked off, the nightly `work tick` marks the project `status: completed` automatically. No manual cleanup needed.

### Devbox workflow

The `dev` shell function connects the same task-picking flow to remote devboxes — pick a task, pick or create a devbox, and the plans/projects sync both ways over SSH.

## Architecture

```
launchd (hourly) ──> work tick ──> gather + sync + conditional wrap
                                       │
User ──> /command ──> command prompt    │
              │       (commands/*.md)   │
              │           │             │
              └───────────┼─────────────┘
                          │
                          ├── calls `work` CLI (bin/work)
                          ├── reads/writes daily note
                          ├── reads/writes project files
                          └── reads/writes plan files
```

The `work` CLI handles deterministic operations (file parsing, section insertion, deduplication). The LLM handles judgment calls (user interaction, plan context summarization, end-of-day summary). A launchd timer runs `work tick` hourly to keep the daily note queue current and trigger end-of-day wrap automatically.

### Module layout

```
bin/work          CLI entrypoint
lib/paths.js      Path constants (VAULT_ROOT, PLAN_DIR, PROJECT_DIR)
lib/daily.js      Daily note operations (ensure, carry, mark, inject)
lib/scan.js       Plan/project scanning (scanOpenItems, syncCheck)
lib/project.js    Project file operations (createProject, resolveProject, completeProjects)
lib/changelog.js  Changelog mutations (checkOff, appendLog)
lib/markdown.js   Markdown parsing (extractSection, parseFrontmatter)
lib/checkbox.js   Checkbox parsing and state management
lib/atomic.js     Atomic file rewrite (read-transform-rename)
```

### Data flow

```
work tick (hourly via launchd)
├── gather ──> ensure + carry + scan + inject
├── sync --apply (flush unlogged completions)
└── if hour >= 18 AND no ## Summary:
    └── wrap
        ├── sync --apply
        ├── claude -p (LLM writes comprehensive summary)
        └── completeProjects (mark fully done projects as completed)

/next (interactive)
├── work gather + sync --apply
├── work queue (TSV of open items)
├── work mark <item> '[/]' (set in progress)
└── create-project + EnterPlanMode (new) or resume context (existing)
```

### Automation: work tick

A launchd plist (`~/.dotfiles/launchd/com.moon.work-tick.plist`) runs `work tick` at the top of every hour. `tick` does:

1. **gather** — ensure daily note exists, carry forward yesterday's open items, scan all plans/projects for open changelog items, inject them into the queue
2. **sync --apply** — find changelog entries completed today that aren't in the daily note's Log section, and add them
3. **wrap** (after 18:00, once per day) — sync again, spawn `claude -p` to write a comprehensive LLM summary into the daily note's `## Summary` section, then mark fully completed projects as `status: completed`

If any step fails, `tick` injects a queue item (`Investigate work tick errors: ...`) so the error surfaces in `/next`.

### Project lifecycle

Active projects with no open changelog items get a synthetic `Review project: <title>` entry injected into the queue, ensuring every active project stays visible. When all changelog items in a project are checked off, `completeProjects` (called by `wrap`) flips the project status from `active` to `completed`.

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
  tick                         Hourly maintenance: gather + sync + conditional wrap
  wrap                         End-of-day: sync + Claude summary + complete projects
  mark <substr> <status>       Toggle a queue item's checkbox
  queue                        List open/in-progress queue items (TSV)
  summary                      Generate end-of-day summary (deterministic, stdout)
  check-off <file> <desc>      Check off or append a changelog entry
  append-log <desc>            Append entry to daily note log section
  create-project <slug> <title> Create a new project file
  resolve-project <plan-file>  Find project file from plan frontmatter
  paths [vault|plans|projects]  Print configured paths
  parse-changelog <file> <pat> Extract matching changelog lines (TSV)
  help                         Show this help

Options:
  --date=YYYY-MM-DD            Override date (defaults to today)
  --source-type=plan|project   Source type for append-log
  --source-slug=<slug>         Source slug for append-log wikilink
  --source-title=<title>       Source title for append-log wikilink
```

## Vim workflows

Task picking and project creation happen through Neovim keybinds (defined in `~/.dotfiles/neovim/lua/sodium/plugins/agentic.lua`):

| Keybind | Description |
|---------|-------------|
| `<leader>ap` | Pick a task from the work queue, start an agentic session with project context |
| `<leader>aP` | Create a new project (prompts for title), open project file, start agentic session |

Both workflows destroy the existing agentic session, set `CLAUDE_PROJECT` and `CLAUDE_TASK` env vars, and start a fresh session. The `session-project` hook injects the project file contents as context.

## Slash commands

| Command | Description |
|---------|-------------|
| `/note` | Append a note, link, or discovery to today's daily note |
| `/name` | Set a descriptive label on the current tmux window |
| `/archive-plans` | Archive completed plans and write a monthly summary |

## Data model

### TSV convention

Commands that output structured data use tab-separated values: `filename\ttitle\titem_text\tsource_type`

- `filename`: file basename (e.g. `2026-02-27-my-plan.md` or `my-project.md`)
- `title`: first `# ` heading from the file
- `item_text`: changelog entry text with checkbox prefix stripped
- `source_type`: `plan` or `project` — determines wikilink prefix and file path resolution

### Daily note format

Path: `$WORK_VAULT/YYYY-MM-DD.md` (default: `~/work/YYYY-MM-DD.md`)

```markdown
## Queue
- [ ] Open task — [[projects/project-slug|Project Title]]
- [/] In-progress task — [[projects/project-slug|Project Title]]
- [ ] Standalone task — [[plans/plan-file|Plan Title]]

## Log
- [x] Completed item ✅ YYYY-MM-DD — [[projects/project-slug|Project Title]]
- HH:MM — Freeform note

## Summary
(LLM-written comprehensive summary of the day's work)
```

### Project file format

Path: `$WORK_VAULT/projects/<slug>.md`

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

## Configuration

Config file: `$XDG_CONFIG_HOME/work/config.json` (default `~/.config/work/config.json`)

```json
{
  "vault": "/path/to/obsidian/vault",
  "plans": "/path/to/plans"
}
```

All fields are optional. The `WORK_VAULT` environment variable takes precedence over the config file `vault` field. Default vault: `~/work`. Default plans: `~/.claude/plans`.

## File layout

| Path | Purpose |
|------|---------|
| `$WORK_VAULT/` | Obsidian vault root |
| `$WORK_VAULT/YYYY-MM-DD.md` | Daily notes |
| `$WORK_VAULT/projects/` | Project files |
| `~/.claude/plans/` | Active plan files (symlinked into vault at `$WORK_VAULT/plans/`) |
| `$WORK_VAULT/archive/` | Archived plans |
| `$WORK_VAULT/monthly/YYYY-MM.md` | Monthly work summaries |
| `~/.dotfiles/launchd/com.moon.work-tick.plist` | Hourly launchd timer |
| `~/Library/Logs/work-tick.log` | Tick stdout/stderr (rotated by `tick`) |

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

## Updating the plugin

After making changes to the plugin source:

1. Bump `version` in `work/.claude-plugin/plugin.json`
2. Commit
3. `claude plugin update work@personal`
4. Restart Claude Code sessions

## Dependencies

- Node.js >= 18
- Claude Code CLI (`claude`) for LLM summary in `wrap`
- fzf (dev function only)
- nvim-remote (`scripts/nvim-remote/`) for editor integration (silently skipped if unavailable)