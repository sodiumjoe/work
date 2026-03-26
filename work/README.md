# work

Daily work tracking with Obsidian integration for Claude Code. Manages daily notes, project files, plan files, and work logging through slash commands backed by a Node.js CLI.

## Usage

### Starting work

`<leader>ap` opens a picker showing active and evergreen projects. Select one to open its file and start a scoped Claude Code session with the project file injected as context. The tmux window label updates to the project slug.

`<leader>aP` creates a new project from scratch — prompts for a title, generates the project file, opens it in a buffer, and starts a session scoped to it.

### During a session

The session knows which project it belongs to. Use `EnterPlanMode` to plan implementation, then execute. When work is done:

- Claude uses `work complete <project-file> <description>` to check off the item and log it to the daily note in one step
- `/note` to record freeform observations, links, or discoveries
- `/name` to relabel the tmux window if the focus shifts

### Adding tasks to a project

Add `- [ ] Description` lines to the project's `## Tasks` section. They surface in the daily note queue on the next `work tick`.

### Lifecycle

Open tasks and changelog items keep a project visible in the queue. When all items are checked off, `work tick` marks the project `status: completed` automatically. Completed projects get proposed for archival in the weekly archive queue; approving the archive moves the entire project directory to `$WORK_VAULT/archive/projects/`. Evergreen projects are never completed, but their individual done plans are archived automatically by `tick`, with findings extracted into the project's Notes section.

### Devbox workflow

The `dev` shell function connects the same task-picking flow to remote devboxes — pick a task, pick or create a devbox, and the plans/projects sync both ways over SSH.

## Architecture

```
work tick (manual) ──> gather + sync + archive + wrap + upstream
                            │
User ──> /command ──> command prompt
              │       (commands/*.md)
              │           │
              └───────────┘
                          │
                          ├── calls `work` CLI (bin/work)
                          ├── reads/writes daily note
                          ├── reads/writes project files
                          └── reads/writes plan files
```

The `work` CLI handles deterministic operations (file parsing, section insertion, deduplication). The LLM handles judgment calls (user interaction, plan context summarization, end-of-day summary). Run `work tick` manually to keep the daily note queue current and trigger wrap for previous unwrapped days.

### Module layout

```
bin/work          CLI entrypoint
lib/paths.js      Path constants (VAULT_ROOT, PROJECT_DIR, projectFile, notePath)
lib/daily.js      Daily note operations (ensure, inject, logSyncEntries, injectReviews)
lib/scan.js       Plan/project scanning (scanOpenItems, syncCheck, listTasks, setTaskState)
lib/project.js    Project file operations (createProject, resolveProject, completeProjects,
                    archiveProject, archivePlans, extractFindings, syncPlans)
lib/changelog.js  Changelog mutations (closeTask, appendLog)
lib/markdown.js   Markdown parsing (parse, serialize, extractSection, parseFrontmatter)
lib/checkbox.js   Checkbox parsing and state management
lib/atomic.js     Atomic file rewrite (read-transform-rename)
lib/promote.js    Move checked-off tasks to changelog
lib/queue.js      Approval queue (enqueue, dequeue) for archive proposals
lib/reviews.js    GitHub PR review fetching
lib/summary.js    Weekly summary generation (writeWeeklySummary, isoWeek)
lib/upstream.js   Skill drift detection (checkUpstream)
```

### Data flow

```
work tick
├── gather ──> ensure + promote + sync-plans + scan + inject
├── sync --apply (flush unlogged completions)
├── archive queue (dequeue approved proposals, archiveProject for each)
├── archive evergreen plans (find done/completed plans in evergreen projects,
│     move to archive, extractFindings via Claude)
├── if weekly summary file missing:
│   ├── propose completed projects for archive queue
│   └── write weekly summary
├── for each previous day without ## Summary:
│   └── wrap
│       ├── sync --apply
│       ├── claude -p (LLM writes comprehensive summary)
│       └── completeProjects (mark fully done projects as completed)
└── upstream drift (check forked skills for changes, file task if drifted)
```

### Automation: work tick

Run `work tick` manually (or via neovim keybinds like `<leader>at`). `tick` does:

1. **gather** — ensure daily note exists, promote completed tasks, sync plan-project linkage, scan all plans/projects for open items, inject them into the queue
2. **sync --apply** — find changelog entries completed today that aren't in the daily note's Log section, and add them
3. **archive queue** — dequeue any user-approved archive proposals, run `archiveProject` for each (moves the entire project directory to `archive/projects/`)
4. **archive evergreen plans** — scan evergreen projects for plan files with `status: done` or `status: completed`, move them to `archive/projects/<slug>/`, remove stale wikilinks from the project's `## Plans` section, then spawn Claude via `extractFindings` to distill notable patterns or decisions into the project's `## Notes`
5. **weekly proposals + summary** (once per week, gated on weekly summary file existence) — propose completed projects for archival via the approval queue, write a weekly narrative summary
6. **wrap** (previous days only) — scan backward up to 7 days for daily notes missing a `## Summary`, wrap each by syncing, spawning `claude -p` for a summary, and marking fully completed projects as `status: completed`
7. **upstream drift** — check forked skills against their upstream sources, file a task in the work project if drift is detected

If any step fails, `tick` spawns Claude to file a diagnostic task in the work project.

### Project lifecycle

Active projects with no open tasks get a synthetic `Review project: <title>` entry injected into the queue, ensuring every active project stays visible. When all changelog items in a project are checked off, `completeProjects` (called by `wrap`) flips the project status from `active` to `completed`. The `/complete-project` command provides an explicit alternative: it triages remaining open tasks (done or skipped), generates a changelog summary, extracts findings, and stamps the project completed. Completed projects are proposed for archival in the next weekly tick; once approved, `archiveProject` moves the entire project directory to `$WORK_VAULT/archive/projects/`.

Evergreen projects are never completed, but their individual plans accumulate over time. `/complete-project` on an evergreen project closes a specific plan: it generates a summary for the project changelog, extracts findings, and marks the plan `status: done` with `findings_extracted: true`. `archivePlans` (called by `tick`) then moves done plans to `archive/projects/<slug>/` and spawns Claude to extract findings for plans not already processed (i.e., those without `findings_extracted: true`).

## CLI

```
work <command> [options]

Commands:
  ensure                       Create today's daily note if missing
  promote                      Move checked-off tasks to changelog
  sync [--apply]               Find unlogged changelog completions
  list-projects                List active/evergreen projects (TSV)
  inject                       Rebuild daily note tasks view from scan
  sync-plans                   Link orphaned plans to projects
  gather                       Run ensure + promote + sync + scan + inject
  tick                         Maintenance: gather + sync + conditional wrap
  wrap                         End-of-day: sync + Claude summary + complete projects
  summary                      Show completed and open items
  list-tasks [file]            List open/in-progress tasks (TSV)
  set-task-state <f> <ln> <s>  Set task checkbox state (open|in-progress|done)
  complete <file> <desc>       Check off task and log to daily note
  append-task <file> <desc>    Add a new task to a project's Tasks section
  create-project <slug> <title> Create a new project file
  close-tasks <file> [--skip=L] Bulk-close open tasks (done or cancelled)
  close-project <slug> <summary> Complete project with summary
  close-plan <plan-file>         Mark plan as done with findings flag
  archive-project <slug>       Archive project and associated plans
  resolve-project <plan-file>  Find project file from plan frontmatter
  paths [vault|projects]       Print configured paths
  parse-changelog <file> <pat> Extract matching changelog lines (TSV)
  check-upstream               Check forked skills for upstream changes
  help                         Show this help

Options:
  --date=YYYY-MM-DD            Override date (defaults to today)
```

## Vim workflows

Task picking and project creation happen through Neovim keybinds (defined in `~/.dotfiles/neovim/lua/sodium/plugins/agentic.lua`):

| Keybind | Description |
|---------|-------------|
| `<leader>ap` | Pick a project, open project file, start an agentic session with project context |
| `<leader>aP` | Create a new project (prompts for title), open project file, start agentic session |
| `<leader>at` | Add a task to a project (prompts for description, then project picker) |
| `<leader>st` | Task state picker (context-aware: current project buffer, or pick project first) |
| `<leader>sT` | Task state picker (all active/evergreen projects) |

Both `<leader>ap` and `<leader>aP` destroy the existing agentic session, set `CLAUDE_PROJECT` env var, and start a fresh session. The `session-project` hook injects the project file contents as context.

`<leader>st` and `<leader>sT` open a task picker where Tab cycles checkbox state (`[ ]` → `[/]` → `[x]` → `[ ]`) and Enter opens the file at the task line.

## Slash commands

| Command | Description |
|---------|-------------|
| `/note` | Append a note, link, or discovery to today's daily note |
| `/name` | Set a descriptive label on the current tmux window |
| `/complete-project` | Close out a project (active) or plan (evergreen) with task triage, findings, and summary |
| `/archive-plans` | Archive completed plans and write a monthly summary |
| `/write-plan` | Create an implementation plan for a project |
| `/create-project` | Brainstorm scope and create a new project |
| `/execute-plan` | Execute an implementation plan task-by-task with review checkpoints |

## Agents

Agents are specialized subprocesses invoked via the `Task` tool with `subagent_type: "work:<agent-name>"`. Defined in `work/agents/`.

| Agent | Description |
|-------|-------------|
| `plan-reviewer` | Reviews implementation plans for completeness, risks, and codebase alignment (read-only) |
| `code-reviewer` | Reviews code changes against plan and coding standards |

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
## Tasks
- [ ] Open task — [[projects/project-slug|Project Title]]
- [/] In-progress task — [[projects/project-slug|Project Title]]
- [ ] Standalone task — [[projects/slug/plan-file|Plan Title]]

## Log
- [x] Completed item ✅ YYYY-MM-DD — [[projects/project-slug|Project Title]]
- HH:MM — Freeform note

## Summary
(LLM-written comprehensive summary of the day's work)
```

### Project file format

Path: `$WORK_VAULT/projects/<slug>/project.md`

```markdown
---
status: active
id: slug
---

# Project Title

## Links
## Plans
## Tasks
- [ ] Pending task

## Changelog
- [x] Completed step ✅ YYYY-MM-DD

## Notes
```

Tasks live in `## Tasks`; when checked off, `promote` moves them to `## Changelog` with a done-date suffix.

### Plan file format

Path: `$WORK_VAULT/projects/<slug>/YYYY-MM-DD-plan-name.md` (colocated with the project)

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

Plans always belong to a project (the `project` frontmatter field is required). The project owns the canonical task list and changelog — plans do not have their own `## Changelog`.

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
  "vault": "/path/to/obsidian/vault"
}
```

All fields are optional. The `WORK_VAULT` environment variable takes precedence over the config file `vault` field. Default vault: `~/work`.

## File layout

| Path | Purpose |
|------|---------|
| `$WORK_VAULT/` | Obsidian vault root |
| `$WORK_VAULT/YYYY-MM-DD.md` | Daily notes |
| `$WORK_VAULT/projects/<slug>/project.md` | Project files |
| `$WORK_VAULT/projects/<slug>/*.md` | Plan files (colocated with project) |
| `$WORK_VAULT/archive/` | Archived projects and plans |
| `$WORK_VAULT/weekly/YYYY-WNN.md` | Weekly work summaries |

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