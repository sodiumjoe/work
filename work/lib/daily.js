const fs = require('node:fs');
const path = require('node:path');
const { VAULT_ROOT, notePath, todayStr } = require('./paths.js');
const { extractSection, findSectionLineRange, insertAtEndOfSection, getTitle } = require('./markdown.js');
const { atomicRewrite } = require('./atomic.js');

function ensure(dateStr) {
  const p = notePath(dateStr);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '## Tasks\n\n## Log\n');
    console.log(`created ${p}`);
  } else {
    const content = fs.readFileSync(p, 'utf-8');
    if (/^## Queue/m.test(content) && !/^## Tasks/m.test(content)) {
      atomicRewrite(p, c => c.replace(/^## Queue/m, '## Tasks'));
      console.log(`migrated Queue → Tasks in ${p}`);
    } else {
      console.log(`exists ${p}`);
    }
  }
}

function logSyncEntries(dateStr, entries, dryRun) {
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
  console.log(`logged ${formatted.length} sync entry/entries`);
}

function inject(dateStr, scanResults) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) return;
  if (!scanResults || scanResults.length === 0) {
    console.log('no tasks to inject');
    atomicRewrite(dailyNote, c => replaceTasksSection(c, []));
    return;
  }
  const grouped = groupByProject(scanResults);
  const lines = ['<!-- auto-generated from project files, do not edit -->'];
  for (const [projectSlug, items] of grouped) {
    const title = items[0].projectTitle || projectSlug;
    if (projectSlug === '_unassigned') {
      lines.push(`### Unassigned`);
    } else {
      lines.push(`### [[projects/${projectSlug}|${title}]]`);
    }
    for (const item of items) {
      const suffix = item.state === '/' ? ' (in progress)' : '';
      lines.push(`- ${item.itemText}${suffix}`);
    }
    lines.push('');
  }
  atomicRewrite(dailyNote, c => replaceTasksSection(c, lines));
  const count = scanResults.length;
  console.log(`injected ${count} task(s) into daily note`);
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