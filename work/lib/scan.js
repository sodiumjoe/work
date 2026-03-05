const fs = require('node:fs');
const path = require('node:path');
const { extractSection, getTitle } = require('./markdown.js');
const { notePath, todayStr } = require('./daily.js');

function scanOpenItems() {
  const results = [];
  const planDir = path.join(process.env.HOME, '.claude', 'plans');
  if (fs.existsSync(planDir)) {
    const files = fs.readdirSync(planDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const filePath = path.join(planDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const changelog = extractSection(content, 'Changelog');
      const title = getTitle(content);
      for (const line of changelog) {
        if (/^- \[ \] /.test(line)) {
          const item = line.replace(/^- \[ \] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'plan' });
        }
      }
    }
  }
  const projDir = path.join(process.env.HOME, 'stripe', 'work', 'projects');
  if (fs.existsSync(projDir)) {
    const files = fs.readdirSync(projDir).filter(f => f.endsWith('.md') && f !== '_template.md');
    for (const f of files) {
      const filePath = path.join(projDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const changelog = extractSection(content, 'Changelog');
      const title = getTitle(content);
      for (const line of changelog) {
        if (/^- \[ \] /.test(line)) {
          const item = line.replace(/^- \[ \] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'project' });
        }
      }
    }
  }
  return results;
}

function formatScanTSV(results) {
  return results.map(r =>
    `${r.filename}\t${r.title}\t${r.itemText}\t${r.sourceType}`
  ).join('\n');
}

function syncCheck(dateStr) {
  const results = [];
  const planDir = path.join(process.env.HOME, '.claude', 'plans');
  if (fs.existsSync(planDir)) {
    const files = fs.readdirSync(planDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const filePath = path.join(planDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(`✅ ${dateStr}`)) continue;
      const changelog = extractSection(content, 'Changelog');
      const title = getTitle(content);
      for (const line of changelog) {
        if (line.includes(`✅ ${dateStr}`)) {
          const item = line.replace(/^- \[x\] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'plan' });
        }
      }
    }
  }
  const projDir = path.join(process.env.HOME, 'stripe', 'work', 'projects');
  if (fs.existsSync(projDir)) {
    const files = fs.readdirSync(projDir).filter(f => f.endsWith('.md') && f !== '_template.md');
    for (const f of files) {
      const filePath = path.join(projDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(`✅ ${dateStr}`)) continue;
      const changelog = extractSection(content, 'Changelog');
      const title = getTitle(content);
      for (const line of changelog) {
        if (line.includes(`✅ ${dateStr}`)) {
          const item = line.replace(/^- \[x\] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'project' });
        }
      }
    }
  }
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote) || results.length === 0) return results;
  const dailyContent = fs.readFileSync(dailyNote, 'utf-8');
  return results.filter(r => {
    const textWithoutDate = r.itemText.replace(/ ✅ \d{4}-\d{2}-\d{2}$/, '');
    return !dailyContent.includes(textWithoutDate);
  });
}

module.exports = {
  scanOpenItems,
  formatScanTSV,
  syncCheck,
};