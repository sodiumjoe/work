---
description: Log completed work to daily note and plan/project changelog
allowed-tools: Read, Write, Edit, Glob, Bash(date:*), Bash(work:*), Bash(obsidian:*)
---

# Log

Log a completed work item. Updates both the daily note and the relevant project or plan file.

## Steps

### 1. Initialize and sync

Run `work ensure`.

Log any unlogged completions automatically:
```bash
work sync --apply
```
If entries were logged, inform the user.

### 2. Determine what was completed

The user may provide a description as an argument, or describe it conversationally. Extract:
- **Description**: concise, one line
- **Plan file**: which plan this belongs to. Infer from context or ask.

### 3. Get today's date

Run `date +%Y-%m-%d`.

### 4. Update the changelog

If a plan file is identified, verify it exists before reading. If the file does not exist, inform the user and ask whether to create it or log without a plan reference.

If the plan file exists, check if it has a parent project:
```bash
work resolve-project '<plan-file-path>'
```

**If a project file is found:** update the **project** changelog (not the plan):
- Read the project file, find `## Changelog`
- If an item exists as `- [ ]` with matching description text, check it off: `- [x] Description ✅ YYYY-MM-DD`. Match by exact description text. If multiple items contain the description as a substring, ask the user to disambiguate.
- If no matching item exists, append: `- [x] Description ✅ YYYY-MM-DD`

**If no project exists:** update the **plan** changelog:
- Read the plan file, find `## Changelog`
- Same matching/appending logic as above.

### 5. Update the daily note

Read the daily note.
- In `## Queue`: check off matching item if present:
  ```bash
  work mark '<description>' '[x]'
  ```
  If the script reports no match, skip silently (item may not be in queue).
- In `## Log`: append the entry with the appropriate wikilink:
  - If project exists: `- [x] Description ✅ YYYY-MM-DD — [[projects/project-slug|Project Title]]`
  - If no project: `- [x] Description ✅ YYYY-MM-DD — [[plans/plan-name|Plan Title]]`

### 6. Confirm

Tell the user what was logged and where.