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

### 2. Complete the task

```
work complete <file> "<description>"
```

Where `<file>` is the absolute path to the project or plan file. This checks off the task in the source file and logs it to the daily note in one step.

### 3. Regenerate tasks view

Run `work gather` to update the daily note tasks section.