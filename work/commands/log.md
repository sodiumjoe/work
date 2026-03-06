---
description: Log completed work to daily note and plan/project changelog
allowed-tools: Read, Glob, Bash(date:*), Bash(work:*), Bash(obsidian:*)
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

**If a project file is found:** update the **project** changelog:
```bash
work check-off '<project-file-path>' '<description>'
```

**If no project exists:** update the **plan** changelog:
```bash
work check-off '<plan-file-path>' '<description>'
```

The `check-off` command matches an existing `- [ ]` item by description substring and checks it off with today's date. If no match exists, it appends a new checked entry.

### 5. Update the daily note

Mark the queue item as complete (skip silently if not in queue):
```bash
work mark '<description>' '[x]'
```

Append to the daily note log with the appropriate wikilink:
```bash
work append-log '<description>' --source-type=project --source-slug='<slug>' --source-title='<title>'
```

For plan-only items:
```bash
work append-log '<description>' --source-type=plan --source-slug='<plan-name>' --source-title='<title>'
```

### 6. Confirm

Tell the user what was logged and where.