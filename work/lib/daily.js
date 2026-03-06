const fs = require('node:fs');
const path = require('node:path');
const { VAULT_ROOT, notePath, todayStr } = require('./paths.js');
const { extractSection, findSectionLineRange, insertAtEndOfSection, insertBeforeNextSection, getTitle } = require('./markdown.js');
const { parseCheckboxItem, parseCheckboxItems, setState, stripWikilinkSuffix } = require('./checkbox.js');
const { atomicRewrite } = require('./atomic.js');

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
  if (!fs.existsSync(VAULT_ROOT)) return null;
  const files = fs.readdirSync(VAULT_ROOT)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  for (const f of files) {
    const name = f.replace('.md', '');
    if (name < dateStr) return path.join(VAULT_ROOT, f);
  }
  return null;
}

function parseStatusArg(status) {
  const bracketed = status.match(/^\[(.)\]$/);
  if (bracketed) return bracketed[1];
  if (status.length === 1 && ' /x'.includes(status)) return status;
  throw new Error(`invalid status: ${status} (expected [ ], [/], [x], or single char)`);
}

function mark(dateStr, substring, status) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) {
    throw new Error('no daily note found');
  }
  const char = parseStatusArg(status);
  let resultLine;
  atomicRewrite(dailyNote, content => {
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
      throw new Error(`no queue item matching "${substring}"`);
    }
    if (matches.length > 1) {
      const detail = matches.map(m => `  ${m.line}`).join('\n');
      throw new Error(`multiple matches for "${substring}":\n${detail}`);
    }
    const target = matches[0];
    const newLine = setState(target.line, char);
    allLines[target.lineNum] = newLine;
    resultLine = newLine;
    return allLines.join('\n');
  });
  console.log(resultLine);
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
      const needsBlank = before.length === 0 || before[before.length - 1] !== '';
      return [...before, ...carried, ...(needsBlank ? [''] : []), ...after].join('\n');
    }
    const range = findSectionLineRange(lines, 'Queue');
    if (!range) return c;
    const before = lines.slice(0, range.end);
    const after = lines.slice(range.end);
    const needsBlank = before.length === 0 || before[before.length - 1] !== '';
    return [...before, ...carried, ...(needsBlank ? [''] : []), ...after].join('\n');
  });
  console.log(`injected ${carried.length} plan item(s) into queue`);
}

module.exports = {
  ensure,
  carry,
  mark,
  logSyncEntries,
  inject,
  parseStatusArg,
};