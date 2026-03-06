---
description: Start the workday — initialize daily note and review open work
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(date:*), Bash(work:*), Bash(nvim-edit:*), Bash(obsidian:*)
---

# Start Day

Initialize today's daily note and review open work items.

## Steps

### 1. Gather and initialize

Run `work gather`. This runs ensure, carry, sync-check, scan, and inject in one call.

Check for unlogged sync entries:
```bash
work sync
```
If there is output, show it to the user and ask if they want to log these entries. If confirmed:
```bash
work sync --apply
```
If the user declines, no data is lost — entries will reappear on the next gather call.

Open today's daily note in the neovim editor window. Skip silently if the command fails.

```bash
nvim-edit "$(work paths vault)/$(date +%Y-%m-%d).md"
```

### 2. Present the queue

Show the user:
- Items already in the daily note's `## Queue` section
- Synced completions just added (from step 2)
- Open work items from plans and projects (from step 3), grouped by project when available
- Ask what they want to work on today

### 3. Update the queue

Write the user's chosen items to the `## Queue` section. Format each with a wikilink:

```
- [ ] Item description — [[projects/project-slug|Project Title]]
- [ ] Item description — [[plans/plan-filename|Plan Title]]
```

Use project wikilinks for items that came from project changelogs. Use plan wikilinks for items from standalone plans.