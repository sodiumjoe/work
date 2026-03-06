---
description: Review open work and suggest what to do next
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(date:*), Bash(work:*), Bash(nvim-edit:*), Bash(obsidian:*), Bash(tmux:*), EnterPlanMode, AskUserQuestion
---

# Next

Pick a task, start or resume it.

## Steps

### 1. Gather tasks

Run `work gather`. This runs ensure, carry, sync-check, scan, and inject in one call.

Log any unlogged completions automatically:
```bash
work sync --apply
```
If entries were logged, inform the user.

Read the daily note. Extract items from `## Queue` that are `- [ ]` (open) or `- [/]` (in progress).

### 2. Present numbered list

Combine queue items and plan/project items into a single numbered list. Group items by project when a project link is present. Queue items first (they are already prioritized). Then plan/project changelog items not already in the queue.

Format:
```
[Project Title]
  1. Task description [open] (project)
  2. Task description [in progress] (project)
[no project]
  3. Task description [open] (plans/plan-file)
```

### 3. User picks a task

Use `AskUserQuestion` to present the tasks as selectable options. Build the options list from the numbered items in Step 2, using each task's description and status indicator as the option text. Add a final option: "Something new".

If the user selects "Something new", ask them to describe the task in a follow-up prompt. Wait for their response.

### 4. Update queue

- If picked item was not already in the daily note queue, add it to `## Queue`.
- Mark the picked item as in progress if it was `- [ ]`:
  ```bash
  work mark '<task description>' '[/]'
  ```
- Multiple tasks can be in progress simultaneously.

### 4b. Label the window

Ask the user for a short window label for this task (1-3 words). Set it:
```bash
tmux label '<label>'
```

### 5. Branch on task state

Determine the branch:
- `- [ ]` with no plan/project file link → 5a (new task, needs planning)
- `- [ ]` with a project link → 5b (resume existing project)
- `- [ ]` with a plan file link → 5b (resume existing plan)
- `- [/]` → 5b (resume in-progress task)

#### 5a. New task (was `- [ ]`, no plan or project link)

This is a new task that needs a project and a plan.

1. Create a project file:
   ```bash
   work create-project '<slug>' '<title>'
   ```
   Use a kebab-case slug derived from the task description. Use the task description as the title.
2. Add the initial task to the project's `## Changelog` as `- [ ] <task description>`.
3. Call `EnterPlanMode` — this hands control to the planning workflow which creates the plan file at `~/.claude/plans/YYYY-MM-DD-<slug>.md`
4. After plan mode completes, add `project: "[[projects/<slug>]]"` to the new plan's YAML frontmatter.
5. Add the plan wikilink to the project's `## Plans` section: `- [[plans/plan-filename|Plan Title]]`
6. Open the plan file in the first non-Agentic neovim window (skip silently if the command fails):
   ```bash
   nvim-edit '<absolute-path-to-plan-file>'

   ```
7. Update the queue item to use the project wikilink: `— [[projects/<slug>|Project Title]]`
8. `/next` ends here — plan mode takes over.

#### 5b. In-progress task (has plan or project link)

This is a resumed task.

1. Determine the source file:
   - If linked to a project (`[[projects/...]]`): read the project file
   - If linked to a plan (`[[plans/...]]`): read the plan, then check for a `project` field via `resolve-project`. If a project exists, use the project file as the primary context source.
2. Open the source file in the first non-Agentic neovim window (skip silently if it fails).
3. Present:
   - **Project/plan title**
   - **Context** section
   - **Open changelog items** (from the project's `## Changelog` if project exists, otherwise from the plan's `## Changelog`)
   - **Next steps** from the most recent plan's `## Approach` section
   - **File paths** mentioned in the plan that are relevant
4. Ask: "Add any instructions or constraints, or say 'go' to start."
5. Do NOT enter plan mode. Do NOT begin implementation. Wait for user input.