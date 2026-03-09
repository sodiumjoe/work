const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let origVault;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
  fs.mkdirSync(path.join(tmpDir, 'projects'));
  origVault = process.env.WORK_VAULT;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (origVault === undefined) {
    delete process.env.WORK_VAULT;
  } else {
    process.env.WORK_VAULT = origVault;
  }
});

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

function requireFresh() {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  return require(path.join(libDir, 'project.js'));
}

describe('completeProjects', () => {
  it('marks a fully checked-off project as completed', () => {
    writeProject('done-proj.md', `---
status: active
---

# Done Project

## Changelog
- [x] Step one ✅ 2026-03-01
- [x] Step two ✅ 2026-03-02

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].file, 'done-proj.md');

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'done-proj.md'), 'utf-8');
    assert.ok(result.includes('status: completed'));
    assert.ok(!result.includes('status: active'));
  });

  it('skips projects with open items', () => {
    writeProject('mixed.md', `---
status: active
---

# Mixed

## Changelog
- [x] Done item ✅ 2026-03-01
- [ ] Open item

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'mixed.md'), 'utf-8');
    assert.ok(result.includes('status: active'));
  });

  it('skips projects with no changelog items', () => {
    writeProject('empty.md', `---
status: active
---

# Empty

## Changelog

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);
  });

  it('skips already completed projects', () => {
    writeProject('already.md', `---
status: completed
---

# Already Done

## Changelog
- [x] Item ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);
  });

  it('is idempotent', () => {
    writeProject('idem.md', `---
status: active
---

# Idempotent

## Changelog
- [x] Only item ✅ 2026-03-01

## Notes`);

    const mod = requireFresh();
    mod.completeProjects();
    mod.completeProjects();

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'idem.md'), 'utf-8');
    assert.ok(result.includes('status: completed'));
    const matches = result.match(/status:/g);
    assert.equal(matches.length, 1);
  });
});