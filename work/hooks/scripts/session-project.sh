#!/usr/bin/env bash
# SessionStart hook: injects project context into Claude sessions.
# Reads CLAUDE_PROJECT and CLAUDE_TASK env vars set by the Neovim task picker.

if [ -z "$CLAUDE_PROJECT" ]; then
  exit 0
fi

PROJECT_FILE="$HOME/stripe/work/projects/$CLAUDE_PROJECT.md"

if [ ! -f "$PROJECT_FILE" ]; then
  exit 0
fi

CONTENT=$(cat "$PROJECT_FILE")

TASK_LINE=""
if [ -n "$CLAUDE_TASK" ]; then
  TASK_LINE="Task: $CLAUDE_TASK"$'\n'
fi

CONTEXT="## Session Context

${TASK_LINE}Project: $CLAUDE_PROJECT
Project file: $PROJECT_FILE

### Project

$CONTENT

### Instructions

- This session is scoped to the project above. Prioritize work items from this project.
- Use \`work check-off\` and \`work append-log\` to record completions against this project."

if [ -n "$CLAUDE_TASK" ]; then
  tmux set -w @window_label "$CLAUDE_TASK" 2>/dev/null || true
fi

jq -n \
  --arg ctx "$CONTEXT" \
  --arg msg "Project context loaded for $CLAUDE_PROJECT" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": $ctx
    },
    "systemMessage": $msg
  }'