---
description: Archive completed plans and write a monthly work summary
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(date:*), Bash(mkdir:*), Bash(mv:*), Bash(ls:*), Bash(rm:*), Bash(cp:*), Bash(work:*)
---

# Archive Plans

Archive completed plan files and generate a monthly work summary.

## Steps

### 1. Get the current month

Run `date +%Y-%m` to get `YYYY-MM`.

### 2. Scan all active plan files

Read every `*.md` file in `~/.claude/plans/`.

For each file:
- Extract the title from the first `# ` heading
- Check for a `project` field in frontmatter:
  ```bash
  work resolve-project '<plan-file-path>'
  ```
- Extract the `## Changelog` section (if present)
- Collect all completed entries matching `- [x] ... ✅ YYYY-MM-DD` where the date starts with the current `YYYY-MM`
- Check for any unchecked entries (`- [ ]`) in the changelog

### 3. Classify plans

- **Has project**: Plans with a `project` frontmatter field are archivable — their task state lives in the project file, not the plan. The plan is an implementation artifact.
- **Archivable (no project)**: Has a changelog with completed entries and NO unchecked (`- [ ]`) entries anywhere in the changelog section
- **Active (no project)**: Has unchecked entries (keep in place)
- **No changelog (no project)**: Plans without a `## Changelog` section — treat as archivable (they have no tracked work)

### 4. Detect and merge duplicates / suggest projects

Among the archivable plans **without** a project, identify groups that are about the same task. Use these heuristics:
- Titles contain the same key noun phrases
- Context sections reference the same files or components
- Changelog entries overlap (same description text appears in both)
- When uncertain, ask the user rather than guessing

For each group of related plans:
1. Present the group to the user: list plan titles and filenames
2. Ask: "Create a project for these related plans?" If yes:
   - Create a project file via `create-project`
   - Merge changelogs from all plans into the project's `## Changelog`
   - Add `project` field to each plan's frontmatter
   - Add plan wikilinks to the project's `## Plans` section
3. If user declines project creation, fall back to the existing merge behavior:
   - Ask which plan is the "primary" (most complete/recent)
   - Merge changelogs into the primary plan
   - The merged primary file goes to archive. The other duplicate files are deleted.

If no duplicates are found, skip this step silently.

### 5. Audit active plans

For each plan classified as "active" (has unchecked `- [ ]` entries and no project), present:
- The plan title and filename
- The unchecked items

Ask the user for each active plan:
- **Keep** — leave in `~/.claude/plans/` (default)
- **Archive anyway** — move to archive despite incomplete items
- **Delete** — remove entirely with `rm` (abandoned work)

### 6. Confirm with user

Present the user with:
- Projects created (from step 4)
- Duplicate groups and proposed merges (from step 4)
- Plans to archive (completed + project-linked + user-confirmed former-active plans)
- Plans to keep (confirmed still in progress)
- Plans to delete (abandoned)

Ask the user to confirm before proceeding. The user may exclude specific plans from archiving.

### 7. Write monthly summary

**File:** `/Users/moon/stripe/work/monthly/YYYY-MM.md`

Create the `monthly/` directory if it does not exist: `mkdir -p /Users/moon/stripe/work/monthly`

Format — group by project, then standalone plans:
```markdown
# YYYY-MM Work Summary

## Project Title 1

- [x] Completed entry 1 ✅ YYYY-MM-DD
- [x] Completed entry 2 ✅ YYYY-MM-DD

## Project Title 2

- [x] Completed entry 1 ✅ YYYY-MM-DD

## (no project) Plan Title

- [x] Completed entry 1 ✅ YYYY-MM-DD
```

Include changelog entries from ALL sources for the month:
- Project changelogs (for plans with projects)
- Plan changelogs (for standalone plans)
Both archived and active, so the summary is complete even when work spans months. Only include entries whose date falls within the current month.

If the summary file already exists, replace its content entirely.

### 8. Backup and delete plans

Before deleting, back up plans marked for deletion (abandoned active plans and non-primary duplicates):

```
mkdir -p /Users/moon/stripe/work/archive/.backup-YYYY-MM-DD
cp ~/.claude/plans/<filename>.md /Users/moon/stripe/work/archive/.backup-YYYY-MM-DD/
rm ~/.claude/plans/<filename>.md
```

Use today's date for the backup directory name. Backups can be cleaned up manually after 30 days.

### 9. Move archived plans

Move confirmed plan files from `~/.claude/plans/` to `/Users/moon/stripe/work/archive/`:

```
mkdir -p /Users/moon/stripe/work/archive
mv ~/.claude/plans/<filename>.md /Users/moon/stripe/work/archive/
```

The archive directory lives in the Obsidian vault but is NOT under the `~/.claude/plans/` symlink, so archived plans will not sync to devboxes.

### 10. Report

Tell the user:
- How many projects were created
- How many plans were archived
- How many plans were deleted
- How many duplicate groups were merged
- How many plans remain active
- Path to the monthly summary file