# Agents

Agentic workflow system for Claude Code. Three primitives: agents, commands, hooks.

## Overview

**Agents** are specialized subprocesses invoked via the `Task` tool. They have specific capabilities, model configurations, and tool access restrictions. Defined as markdown files in `work/agents/`.

**Commands** are LLM-powered workflows invoked via the `Skill` tool (e.g., `/log`, `/note`). They handle user interaction and judgment calls. Defined as markdown files in `work/commands/`.

**Session Hooks** are scripts triggered on session lifecycle events. The `SessionStart` hook injects project context into new Claude sessions. Defined in `work/hooks/`.

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

### /log

Check off a completed task and log it to the daily note.

**Definition:** `work/commands/log.md`

**YAML frontmatter:**
```yaml
---
description: Check off a completed task and log it to the daily note
allowed-tools: Bash(work:*), Read
---
```

**Steps:**
1. Identify source file (project or plan) from session context
2. Complete task: `work complete <file> "<description>"`
3. Regenerate tasks view: `work gather`

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

Injects project context when starting a Claude session scoped to a task.

**Hook script:** `work/hooks/scripts/session-project.sh`

**Configuration:** `work/hooks/hooks.json`

**Mechanism:**
1. Neovim keybinds (`<leader>ap`, `<leader>aP`) set environment variables:
   - `CLAUDE_PROJECT`: path to project file
   - `CLAUDE_TASK`: task description
2. SessionStart hook reads these env vars on session initialization
3. Project file contents are injected as context

**Neovim integration:**

| Keybind | Description |
|---------|-------------|
| `<leader>ap` | Pick task from queue, start scoped session |
| `<leader>aP` | Create new project, start scoped session |

Both workflows destroy the existing session and start fresh with project context.

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

Reference `work/commands/log.md` as template.

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

## Maintenance

When adding or modifying agents or commands, update this file with:
- New agent/command entry in the corresponding section
- YAML frontmatter example
- Invocation pattern
- Brief description of purpose and constraints

Keep the Overview section synchronized with the set of available primitives.
