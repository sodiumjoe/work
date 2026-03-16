# Agents

Agentic workflow system for Claude Code. Three primitives: agents, commands, hooks.

## Overview

**Agents** are specialized subprocesses invoked via the `Task` tool. They have specific capabilities, model configurations, and tool access restrictions. Defined as markdown files in `work/agents/`.

**Commands** are LLM-powered workflows invoked via the `Skill` tool (e.g., `/log`, `/note`). They handle user interaction and judgment calls. Defined as markdown files in `work/commands/`.

**Session Hooks** are scripts triggered on session lifecycle events. The `SessionStart` hook injects project context into new Claude sessions. Defined in `work/hooks/`.

## Data Model

### Entities

| Entity | Location | Key sections |
|--------|----------|--------------|
| Project | `~/stripe/work/projects/<slug>.md` | Tasks, Changelog, Plans, Notes |
| Plan | `~/.claude/plans/<name>.md` | Context, Approach, Files to modify, Verification, Notes |
| Daily note | `~/stripe/work/YYYY-MM-DD.md` | Reviews, Tasks, Log, Archive |
| Weekly summary | `~/stripe/work/weekly/YYYY-WNN.md` | Narrative recap |

### Frontmatter

- **Project**: `status` (active / evergreen / completed), optional `completed_at`
- **Plan**: `status` (active), `project` (wikilink to project file — required, no exceptions)
- **Daily note**: `id` (date string), `tags: [daily-notes]`

### Relationships

```
Project 1──* Plan       (plan frontmatter `project` field → wikilink)
Project 1──* Task       (project ## Tasks section)
Project 1──* Changelog  (project ## Changelog section)
Daily    *──* Project   (daily ## Tasks aggregates from all active projects)
Daily    1──* Log entry (daily ## Log, each entry wikilinks back to source project/plan)
```

### Single source of truth

| State | Lives in | Aggregated to |
|-------|----------|---------------|
| Open tasks | Project `## Tasks` | Daily note `## Tasks` (via `scanOpenItems` → `inject`) |
| Completed work | Project `## Changelog` | Daily note `## Log` (via `appendLog`) |
| Plan linkage | Plan frontmatter `project` field | Project `## Plans` (manual) |
| Task state | Checkbox: `[ ]` open, `[/]` in-progress, `[x]` done | — |

### Data flows

**`work tick`:**
1. `scanOpenItems()` reads all project `## Tasks` for open/in-progress items
2. `inject()` replaces daily note `## Tasks` with grouped results (evergreen first, then active, then unassigned)
3. `syncCheck()` finds changelog entries with today's date not yet in daily `## Log`
4. `logSyncEntries()` appends missing entries to daily `## Log`

**`work complete <project-file> <description>`:**
1. `checkOff()` marks item done in project file — checks `## Tasks` first, then `## Changelog`, appends to `## Changelog` if not found
2. `appendLog()` writes `- [x] description ✅ YYYY-MM-DD — [[projects/slug|Title]]` to daily `## Log`

### Lifecycles

**Task:** `[ ]` open → `[/]` in-progress → `[x]` done `✅ YYYY-MM-DD`

**Project:** `active` → `completed` (auto, via `completeProjects()`, when no open tasks/changelog items remain and at least one done item exists). Evergreen projects skip auto-completion and always appear in the daily note.

### What breaks when state drifts

| Drift | Symptom | Prevention |
|-------|---------|------------|
| Plan missing `project` field | Orphaned, invisible to project | CLAUDE.md rule: required field |
| Changelog in plan instead of project | Duplicate entries, `syncCheck` misses them | CLAUDE.md rule: no `## Changelog` in plans |
| Task completed without `work complete` | Missing from daily `## Log` | `syncCheck` catches unsynced entries on next tick |
| Blocked task with no review date | Stale indefinitely | Manual triage during `/start-day` |

## Agents

### plan-reviewer

Reviews implementation plans before execution for completeness, risks, and codebase alignment.

**Invocation:**
```
Task tool with subagent_type: "work:plan-reviewer"
```

**Definition:** `work/agents/plan-reviewer.md`

**YAML frontmatter:**
```yaml
---
name: plan-reviewer
description: Reviews implementation plans for completeness, risks, and codebase alignment. Use after writing a plan and before executing it.
model: opus
tools: Read, Glob, Grep, mcp__acp__Read, mcp__*__sourcegraph_read_file, mcp__*__sourcegraph_keyword_search, mcp__*__sourcegraph_nls_search, mcp__*__sourcegraph_search_definitions, mcp__*__sourcegraph_search_usages, mcp__*__sourcegraph_list_files
---
```

**Constraints:**
- Read-only (never edits files)
- Cites file paths and line numbers for all findings
- Returns structured markdown tables with verdict (Approve | Needs Revision)

**Usage:**
Called automatically per CLAUDE.md instructions before executing any plan. Validates that referenced files and symbols exist, checks for gaps or risks, evaluates testing strategy.

## Commands

Commands are invoked as `/command-name` by the user or via `Skill` tool.

### /note

Append a freeform note, link, or discovery to today's daily note.

**Definition:** `work/commands/note.md`

**YAML frontmatter:**
```yaml
---
description: Append a note, link, or discovery to today's daily note
allowed-tools: Read, Edit, Bash(date:*), Bash(work:*), Bash(obsidian:*)
---
```

**Steps:**
1. Ensure daily note exists: `work ensure`
2. Append timestamped entry to `## Log` section: `- HH:MM — Note content`

### /name

Set a descriptive label on the current tmux window.

**Definition:** `work/commands/name.md`

**YAML frontmatter:**
```yaml
---
description: Set a descriptive name for the current tmux window
allowed-tools: Bash(tmux:*), AskUserQuestion
---
```

**Steps:**
1. Get label from user (prompt if not provided)
2. Set label: `tmux label '<label>'` or clear: `tmux unlabel`

### /archive-plans

Archive completed plans and generate a monthly work summary.

**Definition:** `work/commands/archive-plans.md`

**YAML frontmatter:**
```yaml
---
description: Archive completed plans and write a monthly work summary
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(date:*), Bash(mkdir:*), Bash(mv:*), Bash(ls:*), Bash(rm:*), Bash(cp:*), Bash(work:*)
---
```

**Steps:**
1. Get current month: `date +%Y-%m`
2. Scan all plan files in `~/.claude/plans/`
3. Classify plans (archivable vs active based on changelog state and project linkage)
4. Detect duplicates, propose project creation or merge
5. Audit active plans with user confirmation (keep/archive/delete)
6. Confirm archival list with user
7. Write monthly summary to `$(work paths vault)/monthly/YYYY-MM.md`
8. Backup plans marked for deletion to `.backup-YYYY-MM-DD/`
9. Move archived plans to `$(work paths vault)/archive/`
10. Report counts (projects created, plans archived, deleted, remaining active)

## Session Hooks

### SessionStart

Injects project context when starting a Claude session scoped to a project.

**Hook script:** `work/hooks/scripts/session-project.sh`

**Configuration:** `work/hooks/hooks.json`

**Mechanism:**
1. Neovim keybinds (`<leader>ap`, `<leader>aP`) set `CLAUDE_PROJECT` environment variable
2. SessionStart hook reads the env var on session initialization
3. Project file contents are injected as context

**Neovim integration:**

| Keybind | Description |
|---------|-------------|
| `<leader>ap` | Pick project, start scoped session |
| `<leader>aP` | Create new project, start scoped session |
| `<leader>at` | Add task to project (no session) |
| `<leader>sP` | Browse project files (no session) |
| `<leader>st` | Task state picker (context-aware: current project buffer, or pick project first) |
| `<leader>sT` | Task state picker (all active/evergreen projects) |

`<leader>ap` and `<leader>aP` destroy the existing session and start fresh with project context.

`<leader>st` and `<leader>sT` open a task picker where Tab cycles checkbox state (`[ ]` → `[/]` → `[x]` → `[ ]`) and Enter opens the file at the task line.

## Scripts

Shell scripts in `work/scripts/nvim-remote/` for controlling the running Neovim instance. Both exit silently when `NVIM`/`NVIM_SOCKET_PATH` is unset (safe to call unconditionally).

| Script | Purpose | Invocation |
|--------|---------|------------|
| `nvim-lua` | Execute Lua in running Neovim | `nvim-lua '<lua-code>'` |
| `nvim-open` | Open file in Neovim | `nvim-open [--window <id>] <file>` |

To open a file in the editor window:
```bash
win=$(nvim-lua "return require('sodium.utils').editor_window()")
[[ -n "$win" ]] && nvim-open --window "$win" '<absolute-path>'
```

## Creating Agents

Reference `work/agents/plan-reviewer.md` as template.

**Required YAML fields:**
- `name`: agent identifier (used in invocation, e.g., `work:plan-reviewer`)
- `description`: one-sentence summary of agent purpose
- `model`: `opus`, `sonnet`, or `haiku`
- `tools`: comma-separated list of allowed tools (supports wildcards like `mcp__*__sourcegraph_*`)

**File structure:**
1. YAML frontmatter
2. Purpose and constraints
3. Input specification
4. Procedure (numbered steps)
5. Output format (with examples)

**Invocation pattern:**
```
Task tool with subagent_type: "work:<agent-name>"
```

Place agent files in `work/agents/`. The plugin loader discovers them automatically.

## Creating Commands

Reference `work/commands/note.md` as template.

**Required YAML fields:**
- `description`: one-sentence summary of command purpose
- `allowed-tools`: comma-separated list of tools the LLM may use (supports prefixes like `Bash(work:*)`)

**File structure:**
1. YAML frontmatter
2. Purpose summary
3. Arguments section (if applicable)
4. Steps section (numbered procedures with code examples)

**Invocation pattern:**
Users type `/command-name` or Claude calls `Skill` tool with `skill: "work:command-name"`.

Place command files in `work/commands/`. The plugin loader discovers them automatically.

## Testing

Run all tests:

```bash
node --test work/test/*.test.js
```

All tests must pass before committing changes to `work/lib/` or `work/bin/`.

Test files live in `work/test/`. Each library file has a corresponding test file:

| Library | Test file |
|---------|-----------|
| `atomic.js` | `atomic.test.js` |
| `changelog.js` | `changelog.test.js` |
| `daily.js` | `daily.test.js` |
| `markdown.js` | `markdown.test.js` |
| `project.js` | `project.test.js` |
| `promote.js` | `promote.test.js` |
| `queue.js` | `queue.test.js` |
| `reviews.js` | `reviews.test.js` |
| `scan.js` | `scan.test.js` |

Integration tests for CLI commands and multi-module flows:

| Test file | Coverage |
|-----------|----------|
| `archive-flow.test.js` | archive-project, tick archive queue, wrap, Sunday proposals |
| `cli.test.js` | create-project, complete, append-task, paths, summary, help |

**Test isolation:** Tests use temporary directories and `requireFresh()` to clear the module cache between tests. Environment variables (`WORK_VAULT`, `XDG_CONFIG_HOME`) are saved and restored in `beforeEach`/`afterEach`.

**Env var overrides for testing:** `WORK_TEST_HOUR` overrides the system clock hour in tick's wrap gate. `WORK_CLAUDE_CMD` overrides the `claude` binary in `doWrap`. Set these in subprocess tests to control time-dependent behavior and avoid calling external binaries.

## Maintenance

When adding or modifying agents or commands, update this file with:
- New agent/command entry in the corresponding section
- YAML frontmatter example
- Invocation pattern
- Brief description of purpose and constraints

Keep the Overview section synchronized with the set of available primitives.

## External Files

Neovim configuration: `~/.dotfiles/neovim/`. Keybinds for `<leader>ap`, `<leader>at`, `<leader>st`, etc. are defined in `~/.dotfiles/neovim/lua/sodium/plugins/agentic.lua`.

## Committing Changes

After modifying any plugin source (`work/lib/`, `work/bin/`, `work/commands/`, `work/agents/`, `work/hooks/`):

1. Run all tests: `node --test work/test/*.test.js`
2. Bump `version` in `work/.claude-plugin/plugin.json` (patch for fixes, minor for new features)
3. Commit all changed files together
