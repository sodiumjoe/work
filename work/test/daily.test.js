const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let origVault;
let origXdg;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-test-'));
  fs.mkdirSync(path.join(tmpDir, 'projects'));
  fs.mkdirSync(path.join(tmpDir, 'plans'));
  fs.mkdirSync(path.join(tmpDir, 'config', 'work'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'config', 'work', 'config.json'),
    JSON.stringify({ plans: path.join(tmpDir, 'plans') })
  );
  origVault = process.env.WORK_VAULT;
  origXdg = process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (origVault === undefined) {
    delete process.env.WORK_VAULT;
  } else {
    process.env.WORK_VAULT = origVault;
  }
  if (origXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = origXdg;
  }
});

function requireFresh(mod = 'daily.js') {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
  return require(path.join(libDir, mod));
}

function writeDailyNote(dateStr, content) {
  fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
}

function readDailyNote(dateStr) {
  return fs.readFileSync(path.join(tmpDir, `${dateStr}.md`), 'utf-8');
}

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

describe('ensure', () => {
  it('creates daily note if missing', () => {
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('id: 2026-03-10'));
    assert.ok(note.includes('## Tasks'));
    assert.ok(note.includes('## Log'));
  });

  it('does not overwrite existing note', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\nExisting content\n');
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('Existing content'));
  });

  it('migrates Queue to Tasks', () => {
    writeDailyNote('2026-03-10', '## Queue\n- [ ] Item\n\n## Log\n');
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('## Tasks'));
    assert.ok(!note.includes('## Queue'));
  });

  it('adds missing Tasks section to existing note', () => {
    writeDailyNote('2026-03-10', '## Log\nSome log\n');
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('## Tasks'));
    assert.ok(note.includes('## Log'));
  });

  it('adds missing Log section to existing note', () => {
    writeDailyNote('2026-03-10', '## Tasks\n- [ ] Item\n');
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('## Log'));
  });
});

describe('logSyncEntries', () => {
  it('appends entries to Log section', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { logSyncEntries } = requireFresh();

    logSyncEntries('2026-03-10', [
      { filename: 'my-proj.md', title: 'My Proj', itemText: 'Did a thing', sourceType: 'project' },
    ], false, { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('- [x] Did a thing — [[projects/my-proj|My Proj]]'));
  });

  it('formats plan entries with plans/ prefix', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { logSyncEntries } = requireFresh();

    logSyncEntries('2026-03-10', [
      { filename: 'my-plan.md', title: 'My Plan', itemText: 'Plan work', sourceType: 'plan' },
    ], false, { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('[[plans/my-plan|My Plan]]'));
  });

  it('does nothing on empty entries', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { logSyncEntries } = requireFresh();
    logSyncEntries('2026-03-10', [], false, { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.equal(note, '## Tasks\n\n## Log\n');
  });

  it('throws if daily note missing', () => {
    const { logSyncEntries } = requireFresh();
    assert.throws(
      () => logSyncEntries('2026-03-10', [{ filename: 'x.md', title: 'X', itemText: 'y', sourceType: 'project' }], false, { quiet: true }),
      /no daily note/
    );
  });
});

describe('inject', () => {
  it('rebuilds Tasks section from scan results', () => {
    writeProject('proj-a.md', `---
status: active
---

# Project A

## Tasks
- [ ] Open task

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\nold content\n\n## Log\n');
    const { inject } = requireFresh();

    inject('2026-03-10', [
      { projectSlug: 'proj-a', itemText: 'Open task', state: ' ', sourceType: 'project', title: 'Project A', evergreen: false },
    ], { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('Open task'));
    assert.ok(note.includes('proj-a'));
    assert.ok(!note.includes('old content'));
  });

  it('shows in-progress state', () => {
    writeProject('proj-b.md', `---
status: active
---

# Project B

## Tasks

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { inject } = requireFresh();

    inject('2026-03-10', [
      { projectSlug: 'proj-b', itemText: 'Working on it', state: '/', sourceType: 'project', title: 'Project B', evergreen: false },
    ], { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('Working on it (in progress)'));
  });

  it('clears Tasks when no results', () => {
    writeDailyNote('2026-03-10', '## Tasks\nold stuff\n\n## Log\n');
    const { inject } = requireFresh();

    inject('2026-03-10', [], { quiet: true });

    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('old stuff'));
    assert.ok(note.includes('## Tasks'));
    assert.ok(note.includes('## Log'));
  });

  it('sorts evergreen projects first', () => {
    writeProject('z-regular.md', `---
status: active
---

# Z Regular

## Tasks

## Changelog

## Notes`);

    writeProject('a-evergreen.md', `---
status: completed
evergreen: true
---

# A Evergreen

## Tasks

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { inject } = requireFresh();

    inject('2026-03-10', [
      { projectSlug: 'z-regular', itemText: 'Regular task', state: ' ', sourceType: 'project', title: 'Z Regular', evergreen: false },
      { projectSlug: 'a-evergreen', itemText: 'Evergreen task', state: ' ', sourceType: 'project', title: 'A Evergreen', evergreen: true },
    ], { quiet: true });

    const note = readDailyNote('2026-03-10');
    const evergreenPos = note.indexOf('a-evergreen');
    const regularPos = note.indexOf('z-regular');
    assert.ok(evergreenPos < regularPos, 'evergreen should appear before regular');
  });
});

function assertSingleBlankBetweenSections(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i]) && i > 0) {
      const prev = lines[i - 1];
      const prevPrev = i >= 2 ? lines[i - 2] : null;
      if (prev === '---') continue;
      assert.equal(prev, '', `line ${i}: expected blank line before "${lines[i]}", got "${prev}"`);
      if (prevPrev !== null && prevPrev !== '---') {
        assert.notEqual(prevPrev, '', `line ${i}: double blank line before "${lines[i]}"`);
      }
    }
  }
}

describe('section whitespace', () => {
  it('ensure creates note with single blank between sections', () => {
    const { ensure } = requireFresh();
    ensure('2026-03-10', { quiet: true });
    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('inject with content preserves single blank before Log', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { inject } = requireFresh();
    inject('2026-03-10', [
      { projectSlug: 'proj', itemText: 'Task', state: ' ', sourceType: 'project', title: 'Proj', evergreen: false },
    ], { quiet: true });

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('inject with empty results preserves single blank before Log', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { inject } = requireFresh();
    inject('2026-03-10', [], { quiet: true });

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('logSyncEntries maintains single blank between sections', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n\n## Summary\n');
    const { logSyncEntries } = requireFresh();
    logSyncEntries('2026-03-10', [
      { filename: 'proj.md', title: 'Proj', itemText: 'Did work', sourceType: 'project' },
    ], false, { quiet: true });

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('appendLog maintains single blank between sections', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n\n## Summary\n');
    const { appendLog } = requireFresh('changelog.js');
    appendLog('2026-03-10', 'Did something', 'project', 'proj', 'Proj');

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('appendLog to empty Log section maintains whitespace', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { appendLog } = requireFresh('changelog.js');
    appendLog('2026-03-10', 'First entry', 'project', 'proj', 'Proj');

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('First entry'));
  });

  it('multiple appendLog calls do not accumulate blanks', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n\n## Summary\n');
    const { appendLog } = requireFresh('changelog.js');
    appendLog('2026-03-10', 'First', 'project', 'proj', 'Proj');
    appendLog('2026-03-10', 'Second', 'project', 'proj', 'Proj');
    appendLog('2026-03-10', 'Third', 'project', 'proj', 'Proj');

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });

  it('inject then appendLog maintains consistent whitespace', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const daily = requireFresh();
    daily.inject('2026-03-10', [
      { projectSlug: 'proj', itemText: 'Task', state: ' ', sourceType: 'project', title: 'Proj', evergreen: false },
    ], { quiet: true });

    const { appendLog } = requireFresh('changelog.js');
    appendLog('2026-03-10', 'Done', 'project', 'proj', 'Proj');

    assertSingleBlankBetweenSections(readDailyNote('2026-03-10'));
  });
});