const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let origVault;
let origXdg;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'));
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

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

function writePlan(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'plans', name), content);
}

function requireFresh() {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
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

  it('stamps completed_at when marking completed', () => {
    writeProject('stamp.md', `---
status: active
---

# Stamp

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    completeProjects();

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'stamp.md'), 'utf-8');
    assert.ok(result.includes('status: completed'));
    assert.match(result, /completed_at: \d{4}-\d{2}-\d{2}/);
  });

  it('skips permanent projects', () => {
    writeProject('perm.md', `---
status: active
permanent: true
---

# Permanent

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'perm.md'), 'utf-8');
    assert.ok(result.includes('status: active'));
  });

  it('skips evergreen projects', () => {
    writeProject('eg.md', `---
status: evergreen
---

# Evergreen

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'eg.md'), 'utf-8');
    assert.ok(result.includes('status: evergreen'));
  });

  it('blocks completion when Tasks section has open items', () => {
    writeProject('open-tasks.md', `---
status: active
---

# Open Tasks

## Tasks
- [ ] Not done yet

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'open-tasks.md'), 'utf-8');
    assert.ok(result.includes('status: active'));
  });

  it('blocks completion when Tasks has in-progress [/] items', () => {
    writeProject('in-prog.md', `---
status: active
---

# In Progress

## Tasks
- [/] Working on it

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'in-prog.md'), 'utf-8');
    assert.ok(result.includes('status: active'));
  });

  it('does not duplicate completed_at on re-run', () => {
    writeProject('no-dup.md', `---
status: completed
completed_at: 2026-03-01
---

# No Dup

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`);

    const { completeProjects } = requireFresh();
    completeProjects();

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'no-dup.md'), 'utf-8');
    const matches = result.match(/completed_at/g);
    assert.equal(matches.length, 1);
  });
});

describe('archiveProject', () => {
  it('moves project to archive/projects/', () => {
    writeProject('done.md', `---
status: completed
---

# Done

## Changelog
- [x] Item ✅ 2026-03-01`);

    const { archiveProject } = requireFresh();
    archiveProject('done');

    assert.ok(!fs.existsSync(path.join(tmpDir, 'projects', 'done.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'done.md')));
  });

  it('moves associated plans to archive/', () => {
    writeProject('proj.md', `---
status: completed
---

# Proj

## Changelog
- [x] Item ✅ 2026-03-01`);

    writePlan('plan-a.md', `---
status: active
project: "[[projects/proj]]"
---

# Plan A`);

    writePlan('plan-b.md', `---
status: active
project: "[[projects/proj]]"
---

# Plan B`);

    writePlan('unrelated.md', `---
status: active
---

# Unrelated`);

    const { archiveProject } = requireFresh();
    archiveProject('proj');

    assert.ok(!fs.existsSync(path.join(tmpDir, 'plans', 'plan-a.md')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'plans', 'plan-b.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'plan-a.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'plan-b.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'plans', 'unrelated.md')));
  });

  it('throws for nonexistent project', () => {
    const { archiveProject } = requireFresh();
    assert.throws(() => archiveProject('nonexistent'), /not found/);
  });

  it('handles project with no associated plans', () => {
    writeProject('solo.md', `---
status: completed
---

# Solo

## Changelog
- [x] Item ✅ 2026-03-01`);

    const { archiveProject } = requireFresh();
    archiveProject('solo');

    assert.ok(!fs.existsSync(path.join(tmpDir, 'projects', 'solo.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'solo.md')));
  });

  it('archives active project (does not check status)', () => {
    writeProject('active.md', `---
status: active
---

# Active

## Tasks
- [ ] Still working

## Changelog

## Notes`);

    const { archiveProject } = requireFresh();
    archiveProject('active');

    assert.ok(!fs.existsSync(path.join(tmpDir, 'projects', 'active.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'active.md')));
  });

  it('does not move plans for other projects', () => {
    writeProject('alpha.md', `---
status: completed
---

# Alpha

## Changelog
- [x] Item ✅ 2026-03-01`);

    writePlan('for-beta.md', `---
status: active
project: "[[projects/beta]]"
---

# For Beta`);

    const { archiveProject } = requireFresh();
    archiveProject('alpha');

    assert.ok(fs.existsSync(path.join(tmpDir, 'plans', 'for-beta.md')));
  });
});

describe('createProject', () => {
  it('creates project file with standard template', () => {
    const { createProject } = requireFresh();
    createProject('my-proj', 'My Project');

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'my-proj.md'), 'utf-8');
    assert.ok(result.includes('status: active'));
    assert.ok(result.includes('# My Project'));
    assert.ok(result.includes('## Tasks'));
    assert.ok(result.includes('## Changelog'));
    assert.ok(result.includes('## Notes'));
  });

  it('rejects slug with spaces', () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject('bad slug', 'Bad'), /invalid slug/);
  });

  it('rejects slug with slash', () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject('bad/slug', 'Bad'), /invalid slug/);
  });

  it('rejects empty slug', () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject('', 'Bad'), /invalid slug/);
  });

  it('throws if project already exists', () => {
    writeProject('exists.md', '# Exists');
    const { createProject } = requireFresh();
    assert.throws(() => createProject('exists', 'Exists'), /exists/);
  });
});

describe('resolveProject', () => {
  it('resolves project from plan frontmatter', () => {
    writeProject('target.md', `---
status: active
---

# Target`);

    const planFile = path.join(tmpDir, 'plans', 'test-plan.md');
    writePlan('test-plan.md', `---
status: active
project: "[[projects/target]]"
---

# Test Plan`);

    const { resolveProject } = requireFresh();
    resolveProject(planFile);
  });

  it('returns undefined for missing plan file', () => {
    const { resolveProject } = requireFresh();
    const result = resolveProject('/nonexistent/plan.md');
    assert.equal(result, undefined);
  });

  it('returns undefined for plan with no project field', () => {
    writePlan('no-proj.md', `---
status: active
---

# No Project`);

    const { resolveProject } = requireFresh();
    const result = resolveProject(path.join(tmpDir, 'plans', 'no-proj.md'));
    assert.equal(result, undefined);
  });
});

describe('listProjects', () => {
  it('returns active projects', () => {
    writeProject('alpha.md', `---
status: active
---

# Alpha

## Tasks

## Changelog`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, 'alpha');
    assert.equal(results[0].title, 'Alpha');
    assert.equal(results[0].status, 'active');
  });

  it('returns evergreen projects', () => {
    writeProject('infra.md', `---
status: evergreen
---

# Infra

## Tasks

## Changelog`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, 'infra');
    assert.equal(results[0].status, 'evergreen');
  });

  it('excludes completed projects', () => {
    writeProject('done.md', `---
status: completed
completed_at: 2026-03-01
---

# Done

## Changelog
- [x] Item ✅ 2026-03-01`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });

  it('returns empty array for empty projects dir', () => {
    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });

  it('returns both active and evergreen projects', () => {
    writeProject('a.md', `---
status: active
---

# Active One

## Tasks`);

    writeProject('b.md', `---
status: evergreen
---

# Evergreen One

## Tasks`);

    writeProject('c.md', `---
status: completed
---

# Completed One

## Changelog
- [x] Done ✅ 2026-03-01`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 2);
    const slugs = results.map(r => r.slug).sort();
    assert.deepEqual(slugs, ['a', 'b']);
  });

  it('defaults to active when status is missing', () => {
    writeProject('no-status.md', `---
---

# No Status

## Tasks`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'active');
  });

  it('skips _template.md', () => {
    writeProject('_template.md', `---
status: active
---

# Template`);

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });
});

describe('parseChangelog', () => {
  it('filters changelog lines by regex', () => {
    writeProject('cl.md', `---
status: active
---

# CL

## Changelog
- [x] Fix bug ✅ 2026-03-01
- [x] Add feature ✅ 2026-03-02

## Notes`);

    const { parseChangelog } = requireFresh();
    parseChangelog(path.join(tmpDir, 'projects', 'cl.md'), 'bug');
  });

  it('returns undefined for missing file', () => {
    const { parseChangelog } = requireFresh();
    const result = parseChangelog('/nonexistent/file.md', 'test');
    assert.equal(result, undefined);
  });

  it('throws on invalid regex', () => {
    writeProject('re.md', `---
status: active
---

# RE

## Changelog
- [x] Item ✅ 2026-03-01`);

    const { parseChangelog } = requireFresh();
    assert.throws(() => parseChangelog(path.join(tmpDir, 'projects', 're.md'), '[invalid'), /invalid regex/);
  });
});