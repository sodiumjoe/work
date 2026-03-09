const fs = require('node:fs');
const { extractSection, findSectionLineRange } = require('./markdown.js');
const { atomicRewrite } = require('./atomic.js');
const { notePath } = require('./paths.js');

function checkOff(filePath, description, dateStr) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  let action;
  atomicRewrite(filePath, content => {
    const lines = content.split('\n');
    const tasksRange = findSectionLineRange(lines, 'Tasks');
    if (tasksRange) {
      for (let i = tasksRange.start + 1; i < tasksRange.end; i++) {
        if (/^- \[[ /]\]/.test(lines[i])) {
          const text = lines[i].replace(/^- \[.\] /, '');
          if (text === description || text.includes(description)) {
            lines[i] = `- [x] ${text}`;
            action = 'checked';
            return lines.join('\n');
          }
        }
      }
    }
    const changelogRange = findSectionLineRange(lines, 'Changelog');
    if (changelogRange) {
      for (let i = changelogRange.start + 1; i < changelogRange.end; i++) {
        if (/^- \[ \]/.test(lines[i])) {
          const text = lines[i].replace(/^- \[ \] /, '');
          if (text === description || text.includes(description)) {
            lines[i] = `- [x] ${text} ✅ ${dateStr}`;
            action = 'checked';
            return lines.join('\n');
          }
        }
      }
      const insertAt = changelogRange.end;
      const entry = `- [x] ${description} ✅ ${dateStr}`;
      lines.splice(insertAt, 0, entry);
      action = 'appended';
      return lines.join('\n');
    }
    throw new Error('no ## Tasks or ## Changelog section found');
  });
  console.log(`${action}: ${description}`);
  return action;
}

function appendLog(dateStr, description, sourceType, sourceSlug, sourceTitle) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) {
    throw new Error('no daily note found');
  }
  let wikiSuffix = '';
  if (sourceSlug && sourceTitle) {
    const wikiPath = sourceType === 'project'
      ? `projects/${sourceSlug}`
      : `plans/${sourceSlug}`;
    wikiSuffix = ` — [[${wikiPath}|${sourceTitle}]]`;
  }
  const entry = `- [x] ${description} ✅ ${dateStr}${wikiSuffix}`;
  atomicRewrite(dailyNote, content => {
    const lines = content.split('\n');
    const range = findSectionLineRange(lines, 'Log');
    if (!range) {
      throw new Error('no ## Log section found');
    }
    lines.splice(range.end, 0, entry);
    return lines.join('\n');
  });
  console.log(entry);
}

module.exports = { checkOff, appendLog };