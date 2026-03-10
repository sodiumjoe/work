const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let origVault;
let origXdg;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
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

function requireFresh() {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
  return require(path.join(libDir, 'scan.js'));
}

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

function writePlan(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'plans', name), content);
}

function writeDailyNote(dateStr, content) {
  fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
}

describe('scanOpenItems', () => {
  it('finds open tasks in active projects', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks
- [ ] Open task
- [x] Done task

## Changelog

## Notes`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 1);
    assert.equal(results[0].itemText, 'Open task');
    assert.equal(results[0].sourceType, 'project');
    assert.equal(results[0].projectSlug, 'proj');
  });

  it('finds in-progress tasks', () => {
    writeProject('wip.md', `---
status: active
---

# WIP

## Tasks
- [/] In progress

## Changelog

## Notes`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 1);
    assert.equal(results[0].state, '/');
  });

  it('skips non-active non-evergreen projects', () => {
    writeProject('done.md', `---
status: completed
---

# Done

## Tasks
- [ ] Leftover

## Changelog

## Notes`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 0);
  });

  it('includes evergreen projects', () => {
    writeProject('eg.md', `---
status: evergreen
---

# Evergreen

## Tasks
- [ ] Recurring task

## Changelog

## Notes`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 1);
    assert.equal(results[0].evergreen, true);
  });

  it('adds placeholder for evergreen projects with no open tasks', () => {
    writeProject('eg-empty.md', `---
status: evergreen
---

# Evergreen Empty

## Tasks

## Changelog

## Notes`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 1);
    assert.equal(results[0].itemText, '');
    assert.equal(results[0].evergreen, true);
  });

  it('finds open items in plan changelogs', () => {
    writePlan('plan.md', `---
status: active
project: "[[projects/my-proj]]"
---

# Plan

## Changelog
- [ ] Plan task
- [x] Done plan task ✅ 2026-03-01`);

    const { scanOpenItems } = requireFresh();
    const results = scanOpenItems();
    assert.equal(results.length, 1);
    assert.equal(results[0].itemText, 'Plan task');
    assert.equal(results[0].sourceType, 'plan');
    assert.equal(results[0].projectSlug, 'my-proj');
  });
});

describe('formatScanTSV', () => {
  it('formats results as TSV', () => {
    const { formatScanTSV } = requireFresh();
    const tsv = formatScanTSV([
      { filename: 'proj.md', title: 'Proj', itemText: 'Task', sourceType: 'project', state: ' ', projectSlug: 'proj' },
    ]);
    assert.ok(tsv.includes('proj.md\tProj\tTask\tproject\t \tproj'));
  });

  it('returns empty string for empty results', () => {
    const { formatScanTSV } = requireFresh();
    assert.equal(formatScanTSV([]), '');
  });
});

describe('syncCheck', () => {
  it('finds completed items not in daily note log', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks

## Changelog
- [x] Done today ✅ 2026-03-10

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const { syncCheck } = requireFresh();
    const results = syncCheck('2026-03-10');
    assert.equal(results.length, 1);
    assert.ok(results[0].itemText.includes('Done today'));
  });

  it('excludes items already in daily note log', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks

## Changelog
- [x] Already logged ✅ 2026-03-10

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n- [x] Already logged ✅ 2026-03-10 — [[projects/proj|Proj]]\n');

    const { syncCheck } = requireFresh();
    const results = syncCheck('2026-03-10');
    assert.equal(results.length, 0);
  });

  it('returns empty when no completions today', () => {
    writeProject('proj.md', `---
status: active
---

# Proj

## Tasks
- [ ] Not done

## Changelog

## Notes`);

    const { syncCheck } = requireFresh();
    const results = syncCheck('2026-03-10');
    assert.equal(results.length, 0);
  });

  it('finds completions in plans', () => {
    writePlan('plan.md', `---
status: active
project: "[[projects/my-proj]]"
---

# Plan

## Changelog
- [x] Plan done ✅ 2026-03-10`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const { syncCheck } = requireFresh();
    const results = syncCheck('2026-03-10');
    assert.equal(results.length, 1);
    assert.equal(results[0].sourceType, 'plan');
  });
});