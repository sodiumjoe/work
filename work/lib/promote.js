const fs = require('node:fs');
const path = require('node:path');
const { extractSection, findSectionLineRange, parseFrontmatter } = require('./markdown.js');
const { atomicRewrite } = require('./atomic.js');
const { PROJECT_DIR } = require('./paths.js');

function promote(dateStr, { quiet } = {}) {
  const log = quiet ? () => {} : console.log.bind(console);
  if (!fs.existsSync(PROJECT_DIR)) return [];
  const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md') && f !== '_template.md');
  const promoted = [];
  for (const f of files) {
    const filePath = path.join(PROJECT_DIR, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (fm.status !== 'active') continue;
    const tasks = extractSection(content, 'Tasks');
    const completed = tasks.filter(l => /^- \[x\] /.test(l));
    if (completed.length === 0) continue;
    atomicRewrite(filePath, c => {
      const lines = c.split('\n');
      const tasksRange = findSectionLineRange(lines, 'Tasks');
      const changelogRange = findSectionLineRange(lines, 'Changelog');
      if (!tasksRange || !changelogRange) return c;
      const toRemove = [];
      const toInsert = [];
      for (let i = tasksRange.start + 1; i < tasksRange.end; i++) {
        if (/^- \[x\] /.test(lines[i])) {
          let text = lines[i].replace(/^- \[x\] /, '');
          const hasDate = / ✅ \d{4}-\d{2}-\d{2}$/.test(text);
          if (!hasDate) {
            text = `${text} ✅ ${dateStr}`;
          }
          toInsert.push(`- [x] ${text}`);
          toRemove.push(i);
          promoted.push({ file: f, text });
        }
      }
      for (let i = toRemove.length - 1; i >= 0; i--) {
        lines.splice(toRemove[i], 1);
      }
      const newChangelogRange = findSectionLineRange(lines, 'Changelog');
      if (!newChangelogRange) return lines.join('\n');
      const insertAt = newChangelogRange.end;
      lines.splice(insertAt, 0, ...toInsert);
      return lines.join('\n');
    });
  }
  if (promoted.length > 0) {
    log(`promoted ${promoted.length} task(s) to changelog`);
    for (const p of promoted) {
      log(`  ${p.file}: ${p.text}`);
    }
  }
  return promoted;
}

module.exports = { promote };