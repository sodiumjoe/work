const fs = require('node:fs');
const path = require('node:path');
const { extractSection, findSectionLineRange, insertAtEndOfSection, insertBeforeNextSection, getTitle } = require('./markdown.js');
const { parseCheckboxItem, parseCheckboxItems, setState, stripWikilinkSuffix } = require('./checkbox.js');
const { atomicRewrite } = require('./atomic.js');

function notePath(dateStr) {
  return path.join(process.env.HOME, 'stripe', 'work', `${dateStr}.md`);
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function ensure(dateStr) {
  const p = notePath(dateStr);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '## Queue\n\n## Log\n');
    console.log(`created ${p}`);
  } else {
    console.log(`exists ${p}`);
  }
}

function carry(dateStr) {
  const todayNote = notePath(dateStr);
  if (!fs.existsSync(todayNote)) return;
  const todayContent = fs.readFileSync(todayNote, 'utf-8');
  const queueLines = extractSection(todayContent, 'Queue');
  const hasItems = queueLines.some(l => /^- \[[ /]\]/.test(l));
  if (hasItems) {
    console.log('queue already has items');
    return;
  }
  const prevNote = findPreviousNote(dateStr);
  if (!prevNote) {
    console.log('no previous daily note');
    return;
  }
  const prevContent = fs.readFileSync(prevNote, 'utf-8');
  const prevQueue = extractSection(prevContent, 'Queue');
  const items = parseCheckboxItems(prevQueue);
  const toCarry = items.filter(it => it.state === ' ' || it.state === '/');
  if (toCarry.length === 0) {
    console.log('no items to carry forward');
    return;
  }
  const linesToInsert = [];
  for (const item of toCarry) {
    linesToInsert.push(item.rawLine);
    for (const c of item.continuation) {
      linesToInsert.push(c);
    }
  }
  atomicRewrite(todayNote, content => insertBeforeNextSection(content, 'Queue', linesToInsert));
  console.log(`carried forward ${toCarry.length} item(s) from ${path.basename(prevNote)}`);
}

function findPreviousNote(dateStr) {
  const dir = path.join(process.env.HOME, 'stripe', 'work');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  for (const f of files) {
    const name = f.replace('.md', '');
    if (name < dateStr) return path.join(dir, f);
  }
  return null;
}

function mark(dateStr, substring, status) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) {
    console.error('no daily note found');
    process.exit(1);
  }
  const content = fs.readFileSync(dailyNote, 'utf-8');
  const allLines = content.split('\n');
  const matches = [];
  let inQueue = false;
  for (let i = 0; i < allLines.length; i++) {
    if (/^##\s+Queue/.test(allLines[i])) { inQueue = true; continue; }
    if (inQueue && /^## /.test(allLines[i])) break;
    if (inQueue && /^- \[.\]/.test(allLines[i])) {
      let desc = allLines[i].replace(/^- \[.\] /, '');
      desc = stripWikilinkSuffix(desc);
      if (desc.includes(substring)) {
        matches.push({ line: allLines[i], lineNum: i });
      }
    }
  }
  if (matches.length === 0) {
    console.error(`no queue item matching "${substring}"`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`multiple matches for "${substring}":`);
    for (const m of matches) console.error(`  ${m.line}`);
    process.exit(1);
  }
  const target = matches[0];
  const char = status[1];
  const newLine = setState(target.line, char);
  atomicRewrite(dailyNote, c => {
    const lines = c.split('\n');
    lines[target.lineNum] = newLine;
    return lines.join('\n');
  });
  console.log(newLine);
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
    console.error('no daily note found');
    process.exit(1);
  }
  atomicRewrite(dailyNote, content => insertAtEndOfSection(content, 'Log', formatted));
  console.log(`logged ${formatted.length} sync entry/entries`);
}

function inject(dateStr, scanOutput) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) return;
  if (!scanOutput || scanOutput.trim() === '') return;
  const content = fs.readFileSync(dailyNote, 'utf-8');
  const queueLines = extractSection(content, 'Queue');
  const openQueue = [];
  for (const line of queueLines) {
    if (/^- \[.\]/.test(line)) {
      openQueue.push(stripWikilinkSuffix(line.replace(/^- \[.\] /, '')));
    }
  }
  const carried = [];
  for (const row of scanOutput.trim().split('\n')) {
    const [base, title, item, sourceType] = row.split('\t');
    if (!item) continue;
    if (openQueue.includes(item)) continue;
    const wikiPath = sourceType === 'project'
      ? `projects/${base.replace('.md', '')}`
      : `plans/${base.replace('.md', '')}`;
    carried.push(`- [ ] ${item} — [[${wikiPath}|${title}]]`);
  }
  if (carried.length === 0) {
    console.log('no new plan items to inject');
    return;
  }
  atomicRewrite(dailyNote, c => {
    const lines = c.split('\n');
    const logIdx = lines.findIndex(l => /^## Log/.test(l));
    if (logIdx !== -1) {
      const before = lines.slice(0, logIdx);
      const after = lines.slice(logIdx);
      return [...before, ...carried, '', ...after].join('\n');
    }
    const range = findSectionLineRange(lines, 'Queue');
    if (!range) return c;
    const before = lines.slice(0, range.end);
    const after = lines.slice(range.end);
    return [...before, ...carried, '', ...after].join('\n');
  });
  console.log(`injected ${carried.length} plan item(s) into queue`);
}

module.exports = {
  notePath,
  todayStr,
  ensure,
  carry,
  mark,
  logSyncEntries,
  inject,
};