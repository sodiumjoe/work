const fs = require('node:fs');
const path = require('node:path');
const { extractSection, parseFrontmatter, getTitle } = require('./markdown.js');
const { PLAN_DIR, PROJECT_DIR, notePath } = require('./paths.js');

function scanOpenItems() {
  const results = [];
  if (fs.existsSync(PLAN_DIR)) {
    const files = fs.readdirSync(PLAN_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const filePath = path.join(PLAN_DIR, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);
      const changelog = extractSection(content, 'Changelog');
      const title = getTitle(content);
      let projectSlug = null;
      if (fm.project) {
        projectSlug = fm.project.replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/^projects\//, '');
      }
      for (const line of changelog) {
        if (/^- \[[ /]\] /.test(line)) {
          const state = line.match(/^- \[(.)\]/)[1];
          const item = line.replace(/^- \[.\] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'plan', state, projectSlug });
        }
      }
    }
  }
  if (fs.existsSync(PROJECT_DIR)) {
    const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md') && f !== '_template.md');
    for (const f of files) {
      const filePath = path.join(PROJECT_DIR, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);
      const evergreen = fm.status === 'evergreen';
      if (fm.status !== 'active' && !evergreen) continue;
      const tasks = extractSection(content, 'Tasks');
      const title = getTitle(content);
      const slug = f.replace('.md', '');
      let hasOpenTasks = false;
      for (const line of tasks) {
        if (/^- \[[ /]\] /.test(line)) {
          const state = line.match(/^- \[(.)\]/)[1];
          const item = line.replace(/^- \[.\] /, '');
          results.push({ filename: f, title, itemText: item, sourceType: 'project', state, projectSlug: slug, evergreen });
          hasOpenTasks = true;
        }
      }
      // For evergreen projects with no open tasks, add a placeholder item so they show up in daily note
      if (evergreen && !hasOpenTasks) {
        results.push({ filename: f, title, itemText: '', sourceType: 'project', state: ' ', projectSlug: slug, evergreen: true });
      }
    }
  }
  return results;
}

function formatScanTSV(results) {
  return results.map(r =>
    `${r.filename}\t${r.title}\t${r.itemText}\t${r.sourceType}\t${r.state}\t${r.projectSlug || ''}`
  ).join('\n');
}

function syncCheck(dateStr) {
  const results = [];
  if (fs.existsSync(PLAN_DIR)) {
    const files = fs.readdirSync(PLAN_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const filePath = path.join(PLAN_DIR, f);
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
  if (fs.existsSync(PROJECT_DIR)) {
    const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md') && f !== '_template.md');
    for (const f of files) {
      const filePath = path.join(PROJECT_DIR, f);
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
  const logLines = extractSection(dailyContent, 'Log');
  const logText = logLines.join('\n');
  return results.filter(r => {
    const textWithoutDate = r.itemText.replace(/ ✅ \d{4}-\d{2}-\d{2}$/, '');
    return !logText.includes(textWithoutDate);
  });
}

module.exports = {
  scanOpenItems,
  formatScanTSV,
  syncCheck,
};