const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let origVault;
let origXdg;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
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

function requireFresh() {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
  return require(path.join(libDir, 'changelog.js'));
}

function writeDailyNote(dateStr, content) {
  fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
}

function readDailyNote(dateStr) {
  return fs.readFileSync(path.join(tmpDir, `${dateStr}.md`), 'utf-8');
}

describe('checkOff', () => {
  it('checks off an existing open item', () => {
    const { checkOff } = requireFresh();
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Fix the bug\n- [ ] Add tests\n\n## Notes');
    checkOff(f, 'Fix the bug', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] Fix the bug ✅ 2026-03-05'));
    assert.ok(result.includes('- [ ] Add tests'));
  });

  it('appends if no matching item', () => {
    const { checkOff } = requireFresh();
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Existing item\n\n## Notes');
    checkOff(f, 'New work', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] New work ✅ 2026-03-05'));
    assert.ok(result.includes('- [ ] Existing item'));
  });

  it('matches by substring', () => {
    const { checkOff } = requireFresh();
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Implement feature X with tests\n\n## Notes');
    checkOff(f, 'feature X', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] Implement feature X with tests ✅ 2026-03-05'));
  });

  it('throws on missing file', () => {
    const { checkOff } = requireFresh();
    assert.throws(() => checkOff('/nonexistent/path.md', 'desc', '2026-01-01'), /file not found/);
  });

  it('creates Changelog section if missing and appends', () => {
    const { checkOff } = requireFresh();
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Notes');
    checkOff(f, 'New item', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('## Changelog'));
    assert.ok(result.includes('- [x] New item ✅ 2026-03-05'));
  });

  it('checks off item in Tasks section', () => {
    const { checkOff } = requireFresh();
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Proj\n\n## Tasks\n- [ ] Build feature\n\n## Changelog\n\n## Notes');
    const action = checkOff(f, 'Build feature', '2026-03-05');
    assert.equal(action, 'checked');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] Build feature'));
    assert.ok(!result.includes('✅'));
  });
});

describe('appendLog', () => {
  it('appends entry to daily note Log section', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { appendLog } = requireFresh();

    appendLog('2026-03-10', 'Did something', 'project', 'my-proj', 'My Project');

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('- [x] Did something ✅ 2026-03-10 — [[projects/my-proj|My Project]]'));
  });

  it('formats plan source with plans/ prefix', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { appendLog } = requireFresh();

    appendLog('2026-03-10', 'Plan work', 'plan', 'my-plan', 'My Plan');

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('[[plans/my-plan|My Plan]]'));
  });

  it('omits wikilink when no source metadata', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { appendLog } = requireFresh();

    appendLog('2026-03-10', 'Manual entry');

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('- [x] Manual entry ✅ 2026-03-10'));
    assert.ok(!note.includes('[['));
  });

  it('throws if daily note missing', () => {
    const { appendLog } = requireFresh();
    assert.throws(() => appendLog('2026-03-10', 'desc'), /no daily note/);
  });
});