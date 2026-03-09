const fs = require('node:fs');
const path = require('node:path');
const { VAULT_ROOT, notePath, todayStr } = require('./paths.js');
const { extractSection, findSectionLineRange, insertAtEndOfSection, getTitle } = require('./markdown.js');
const { atomicRewrite } = require('./atomic.js');

function ensure(dateStr, { quiet } = {}) {
  const log = quiet ? () => {} : console.log.bind(console);
  const p = notePath(dateStr);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '## Tasks\n\n## Log\n');
    log(`created ${p}`);
    return;
  }
  const content = fs.readFileSync(p, 'utf-8');
  if (/^## Queue/m.test(content) && !/^## Tasks/m.test(content)) {
    atomicRewrite(p, c => c.replace(/^## Queue/m, '## Tasks'));
    log(`migrated Queue → Tasks in ${p}`);
  }
  const current = fs.readFileSync(p, 'utf-8');
  const missing = [];
  if (!/^## Tasks/m.test(current)) missing.push('## Tasks\n');
  if (!/^## Log/m.test(current)) missing.push('## Log\n');
  if (missing.length > 0) {
    fs.appendFileSync(p, '\n' + missing.join('\n'));
    log(`added missing sections to ${p}: ${missing.map(s => s.trim()).join(', ')}`);
  } else {
    log(`exists ${p}`);
  }
}

function logSyncEntries(dateStr, entries, dryRun, { quiet } = {}) {
  const log = quiet ? () => {} : console.log.bind(console);
  if (entries.length === 0) return;
  const formatted = entries.map(e => {
    const wikiPath = e.sourceType === 'project'
      ? `projects/${e.filename.replace('.md', '')}`
      : `plans/${e.filename.replace('.md', '')}`;
    return `- [x] ${e.itemText} — [[${wikiPath}|${e.title}]]`;
  });
  if (dryRun) {
    for (const line of formatted) console.log(line);
    return;
  }
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) {
    throw new Error('no daily note found');
  }
  atomicRewrite(dailyNote, content => insertAtEndOfSection(content, 'Log', formatted));
  log(`logged ${formatted.length} sync entry/entries`);
}

function inject(dateStr, scanResults, { quiet } = {}) {
  const log = quiet ? () => {} : console.log.bind(console);
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) return;
  if (!scanResults || scanResults.length === 0) {
    log('no tasks to inject');
    atomicRewrite(dailyNote, c => replaceTasksSection(c, []));
    return;
  }
  const grouped = groupByProject(scanResults);
  const lines = ['<!-- auto-generated from project files, do not edit -->'];
  for (const [projectSlug, items] of grouped) {
    const title = items[0].projectTitle || projectSlug;
    if (projectSlug === '_unassigned') {
      lines.push(`- **Unassigned**`);
    } else {
      lines.push(`- **[[projects/${projectSlug}#Tasks|${title}]]**`);
    }
    for (const item of items) {
      // Skip empty placeholder items (used for evergreen projects with no tasks)
      if (item.itemText === '') continue;
      const suffix = item.state === '/' ? ' (in progress)' : '';
      lines.push(`  - ${item.itemText}${suffix}`);
    }
  }
  lines.push('');
  atomicRewrite(dailyNote, c => replaceTasksSection(c, lines));
  const count = scanResults.length;
  log(`injected ${count} task(s) into daily note`);
}

function groupByProject(results) {
  const groups = new Map();
  for (const r of results) {
    const key = r.projectSlug || '_unassigned';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({
      itemText: r.itemText,
      state: r.state,
      projectTitle: r.title,
      sourceType: r.sourceType,
    });
  }
  const sorted = new Map();
  for (const [k, v] of [...groups.entries()].sort((a, b) => {
    if (a[0] === '_unassigned') return 1;
    if (b[0] === '_unassigned') return -1;
    return a[0].localeCompare(b[0]);
  })) {
    sorted.set(k, v);
  }
  return sorted;
}

function replaceTasksSection(content, newLines) {
  const lines = content.split('\n');
  const range = findSectionLineRange(lines, 'Tasks');
  if (!range) return content;
  const before = lines.slice(0, range.start + 1);
  const after = lines.slice(range.end);
  const result = [...before, ...newLines, ...after];
  return result.join('\n');
}

module.exports = {
  ensure,
  logSyncEntries,
  inject,
};