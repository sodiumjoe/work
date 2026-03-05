---
description: Wrap up the workday — summarize progress and open items
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(date:*), Bash(work:*), Bash(obsidian:*)
---

# End Day

Summarize the day's work and review what remains open.

## Steps

### 1. Gather and sync

Run `work gather`.

Log any unlogged completions automatically:
```bash
work sync --apply
```
If entries were logged, inform the user.

### 2. Compile and append summary

Run `work summary --scan` to generate the end-of-day summary. Append the output under `## Summary` at the end of the daily note.

### 3. Present to user

Show the summary. Call out any items in the Stale section.