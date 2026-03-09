---
description: Check off a completed task and log it to the daily note
allowed-tools: Bash(work:*), Read
---

# Log

Record a task completion: check it off in the source file and log it to the daily note.

## Arguments

`$ARGUMENTS` is the task description. If the user provides a project or plan reference, use it. Otherwise, infer the source file from the session context.

## Steps

### 1. Identify the source file

Determine which project or plan file contains the task. Use the session context (project file) if available.

### 2. Check off the task

```
work check-off <file> "<description>"
```

Where `<file>` is the relative path from the vault root (e.g. `projects/work.md`).

### 3. Log to daily note

```
work append-log "<description>" --source-type=<project|plan> --source-slug=<slug> --source-title="<title>"
```

- `--source-type`: `project` or `plan`
- `--source-slug`: the file slug (e.g. `work`, `dotfiles`)
- `--source-title`: display title for the wikilink

### 4. Regenerate tasks view

Run `work gather` to update the daily note tasks section.