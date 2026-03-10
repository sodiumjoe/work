const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let origVault;
let origXdg;
const workBin = path.join(__dirname, '..', 'bin', 'work');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  fs.mkdirSync(path.join(tmpDir, 'projects'));
  fs.mkdirSync(path.join(tmpDir, 'plans'));
  fs.mkdirSync(path.join(tmpDir, 'config', 'work'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'config', 'work', 'config.json'),
    JSON.stringify({ plans: path.join(tmpDir, 'plans') })
  );
  origVault = process.env.WORK_VAULT;
  origXdg = process.env.XDG_CONFIG_HOME;
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
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

function runWork(...args) {
  return execFileSync('node', [workBin, ...args], {
    env: {
      ...process.env,
      WORK_VAULT: tmpDir,
      XDG_CONFIG_HOME: path.join(tmpDir, 'config'),
      WORK_TEST_HOUR: '10',
    },
    encoding: 'utf-8',
    timeout: 10000,
  });
}

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

function writeDailyNote(dateStr, content) {
  fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
}

function readDailyNote(dateStr) {
  return fs.readFileSync(path.join(tmpDir, `${dateStr}.md`), 'utf-8');
}

describe('work create-project', () => {
  it('creates project file', () => {
    const output = runWork('create-project', 'test-proj', 'Test Project');
    assert.ok(output.includes('test-proj.md'));
    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'test-proj.md'), 'utf-8');
    assert.ok(result.includes('# Test Project'));
    assert.ok(result.includes('status: active'));
  });

  it('rejects missing arguments', () => {
    assert.throws(() => runWork('create-project', 'only-slug'), /usage/);
  });
});

describe('work complete', () => {
  it('checks off task and logs to daily note', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks
- [ ] Build feature

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWork('complete', path.join(tmpDir, 'projects', 'proj.md'), 'Build feature', '--date=2026-03-10');

    const proj = fs.readFileSync(path.join(tmpDir, 'projects', 'proj.md'), 'utf-8');
    assert.ok(proj.includes('- [x] Build feature'));

    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('Build feature'));
    assert.ok(note.includes('[[projects/proj|Proj]]'));
  });
});

describe('work append-task', () => {
  it('adds task to Tasks section', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks

## Changelog

## Notes`);

    runWork('append-task', path.join(tmpDir, 'projects', 'proj.md'), 'New task');

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'proj.md'), 'utf-8');
    assert.ok(result.includes('- [ ] New task'));
  });
});

describe('work paths', () => {
  it('prints configured paths', () => {
    const output = runWork('paths');
    assert.ok(output.includes('vault'));
    assert.ok(output.includes('projects'));
    assert.ok(output.includes('plans'));
  });

  it('prints specific path by key', () => {
    const output = runWork('paths', 'vault');
    assert.equal(output, tmpDir);
  });
});

describe('work summary', () => {
  it('outputs completed and open items', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks
- [ ] Open task

## Changelog

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n- [x] Done thing\n');

    const output = runWork('summary', '--date=2026-03-10');
    assert.ok(output.includes('### Completed'));
    assert.ok(output.includes('### Open'));
    assert.ok(output.includes('Done thing'));
    assert.ok(output.includes('Open task'));
  });
});

describe('work help', () => {
  it('prints help text', () => {
    const output = runWork('help');
    assert.ok(output.includes('Usage:'));
    assert.ok(output.includes('Commands:'));
  });
});