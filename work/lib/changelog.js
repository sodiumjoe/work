const fs = require('node:fs');
const { extractSection, findSectionLineRange, insertAtEndOfSection } = require('./markdown.js');
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
    let changelogRange = findSectionLineRange(lines, 'Changelog');
    if (!changelogRange) {
      const lastNonEmptyIdx = lines.findLastIndex(l => l.trim() !== '');
      const insertAt = lastNonEmptyIdx >= 0 ? lastNonEmptyIdx + 1 : lines.length;
      lines.splice(insertAt, 0, '', '## Changelog', '');
      changelogRange = findSectionLineRange(lines, 'Changelog');
    }
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
      const entry = `- [x] ${description} ✅ ${dateStr}`;
      action = 'appended';
      return insertAtEndOfSection(lines.join('\n'), 'Changelog', [entry]);
    }
    throw new Error('unexpected: Changelog section should exist after creation');
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
    if (!findSectionLineRange(content.split('\n'), 'Log')) {
      throw new Error('no ## Log section found');
    }
    return insertAtEndOfSection(content, 'Log', [entry]);
  });
  console.log(entry);
}

module.exports = { checkOff, appendLog };