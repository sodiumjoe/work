const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let tmpDir;
let origVault;
let origXdg;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-test-"));
  fs.mkdirSync(path.join(tmpDir, "projects"));
  fs.mkdirSync(path.join(tmpDir, "config", "work"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config", "work", "config.json"),
    JSON.stringify({}),
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

function writeProject(slug, content) {
  const dir = path.join(tmpDir, "projects", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "project.md"), content);
}

function projectPath(slug) {
  return path.join(tmpDir, "projects", slug, "project.md");
}

function writePlanInProject(slug, planName, content) {
  const dir = path.join(tmpDir, "projects", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, planName), content);
}

function requireFresh() {
  const libDir = path.join(__dirname, "..", "lib");
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(libDir)) delete require.cache[key];
  }
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, "config");
  return require(path.join(libDir, "project.js"));
}

describe("completeProjects", () => {
  it("marks a fully checked-off project as completed", () => {
    writeProject(
      "done-proj",
      `---
status: active
---

# Done Project

## Changelog
- [x] Step one ✅ 2026-03-01
- [x] Step two ✅ 2026-03-02

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].file, "done-proj/project.md");

    const result = fs.readFileSync(projectPath("done-proj"), "utf-8");
    assert.ok(result.includes("status: completed"));
    assert.ok(!result.includes("status: active"));
  });

  it("skips projects with open items", () => {
    writeProject(
      "mixed",
      `---
status: active
---

# Mixed

## Changelog
- [x] Done item ✅ 2026-03-01
- [ ] Open item

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(projectPath("mixed"), "utf-8");
    assert.ok(result.includes("status: active"));
  });

  it("skips projects with no changelog items", () => {
    writeProject(
      "empty",
      `---
status: active
---

# Empty

## Changelog

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);
  });

  it("skips already completed projects", () => {
    writeProject(
      "already",
      `---
status: completed
---

# Already Done

## Changelog
- [x] Item ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);
  });

  it("is idempotent", () => {
    writeProject(
      "idem",
      `---
status: active
---

# Idempotent

## Changelog
- [x] Only item ✅ 2026-03-01

## Notes`,
    );

    const mod = requireFresh();
    mod.completeProjects();
    mod.completeProjects();

    const result = fs.readFileSync(projectPath("idem"), "utf-8");
    assert.ok(result.includes("status: completed"));
    const matches = result.match(/status:/g);
    assert.equal(matches.length, 1);
  });

  it("stamps completed_at when marking completed", () => {
    writeProject(
      "stamp",
      `---
status: active
---

# Stamp

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    completeProjects();

    const result = fs.readFileSync(projectPath("stamp"), "utf-8");
    assert.ok(result.includes("status: completed"));
    assert.match(result, /completed_at: \d{4}-\d{2}-\d{2}/);
  });

  it("skips permanent projects", () => {
    writeProject(
      "perm",
      `---
status: active
permanent: true
---

# Permanent

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(projectPath("perm"), "utf-8");
    assert.ok(result.includes("status: active"));
  });

  it("skips evergreen projects", () => {
    writeProject(
      "eg",
      `---
status: evergreen
---

# Evergreen

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(projectPath("eg"), "utf-8");
    assert.ok(result.includes("status: evergreen"));
  });

  it("blocks completion when Tasks section has open items", () => {
    writeProject(
      "open-tasks",
      `---
status: active
---

# Open Tasks

## Tasks
- [ ] Not done yet

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(projectPath("open-tasks"), "utf-8");
    assert.ok(result.includes("status: active"));
  });

  it("blocks completion when Tasks has in-progress [/] items", () => {
    writeProject(
      "in-prog",
      `---
status: active
---

# In Progress

## Tasks
- [/] Working on it

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    const completed = completeProjects();
    assert.equal(completed.length, 0);

    const result = fs.readFileSync(projectPath("in-prog"), "utf-8");
    assert.ok(result.includes("status: active"));
  });

  it("does not duplicate completed_at on re-run", () => {
    writeProject(
      "no-dup",
      `---
status: completed
completed_at: 2026-03-01
---

# No Dup

## Changelog
- [x] Done ✅ 2026-03-01

## Notes`,
    );

    const { completeProjects } = requireFresh();
    completeProjects();

    const result = fs.readFileSync(projectPath("no-dup"), "utf-8");
    const matches = result.match(/completed_at/g);
    assert.equal(matches.length, 1);
  });
});

describe("archiveProject", () => {
  it("moves project directory to archive/projects/", () => {
    writeProject(
      "done",
      `---
status: completed
---

# Done

## Changelog
- [x] Item ✅ 2026-03-01`,
    );

    const { archiveProject } = requireFresh();
    archiveProject("done");

    assert.ok(!fs.existsSync(path.join(tmpDir, "projects", "done")));
    assert.ok(
      fs.existsSync(
        path.join(tmpDir, "archive", "projects", "done", "project.md"),
      ),
    );
  });

  it("throws for nonexistent project", () => {
    const { archiveProject } = requireFresh();
    assert.throws(() => archiveProject("nonexistent"), /not found/);
  });

  it("handles project with no associated plans", () => {
    writeProject(
      "solo",
      `---
status: completed
---

# Solo

## Changelog
- [x] Item ✅ 2026-03-01`,
    );

    const { archiveProject } = requireFresh();
    archiveProject("solo");

    assert.ok(!fs.existsSync(path.join(tmpDir, "projects", "solo")));
    assert.ok(
      fs.existsSync(
        path.join(tmpDir, "archive", "projects", "solo", "project.md"),
      ),
    );
  });

  it("archives active project (does not check status)", () => {
    writeProject(
      "active",
      `---
status: active
---

# Active

## Tasks
- [ ] Still working

## Changelog

## Notes`,
    );

    const { archiveProject } = requireFresh();
    archiveProject("active");

    assert.ok(!fs.existsSync(path.join(tmpDir, "projects", "active")));
    assert.ok(
      fs.existsSync(
        path.join(tmpDir, "archive", "projects", "active", "project.md"),
      ),
    );
  });
});

describe("createProject", () => {
  it("creates project file with standard template", () => {
    const { createProject } = requireFresh();
    createProject("my-proj", "My Project");

    const result = fs.readFileSync(projectPath("my-proj"), "utf-8");
    assert.ok(result.includes("status: active"));
    assert.ok(result.includes("# My Project"));
    assert.ok(result.includes("## Tasks"));
    assert.ok(result.includes("## Changelog"));
    assert.ok(result.includes("## Notes"));
  });

  it("rejects slug with spaces", () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject("bad slug", "Bad"), /invalid slug/);
  });

  it("rejects slug with slash", () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject("bad/slug", "Bad"), /invalid slug/);
  });

  it("rejects empty slug", () => {
    const { createProject } = requireFresh();
    assert.throws(() => createProject("", "Bad"), /invalid slug/);
  });

  it("throws if project already exists", () => {
    writeProject("exists", "# Exists");
    const { createProject } = requireFresh();
    assert.throws(() => createProject("exists", "Exists"), /exists/);
  });
});

describe("resolveProject", () => {
  it("resolves project from plan frontmatter", () => {
    writeProject(
      "target",
      `---
status: active
---

# Target`,
    );

    const planFile = path.join(tmpDir, "projects", "target", "test-plan.md");
    writePlanInProject(
      "target",
      "test-plan.md",
      `---
status: active
project: "[[projects/target/project]]"
---

# Test Plan`,
    );

    const { resolveProject } = requireFresh();
    resolveProject(planFile);
  });

  it("returns undefined for missing plan file", () => {
    const { resolveProject } = requireFresh();
    const result = resolveProject("/nonexistent/plan.md");
    assert.equal(result, undefined);
  });

  it("returns undefined for plan with no project field", () => {
    writePlanInProject(
      "some-proj",
      "no-proj.md",
      `---
status: active
---

# No Project`,
    );

    const { resolveProject } = requireFresh();
    const result = resolveProject(
      path.join(tmpDir, "projects", "some-proj", "no-proj.md"),
    );
    assert.equal(result, undefined);
  });
});

describe("listProjects", () => {
  it("returns active projects", () => {
    writeProject(
      "alpha",
      `---
status: active
---

# Alpha

## Tasks

## Changelog`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, "alpha");
    assert.equal(results[0].title, "Alpha");
    assert.equal(results[0].status, "active");
  });

  it("returns evergreen projects", () => {
    writeProject(
      "infra",
      `---
status: evergreen
---

# Infra

## Tasks

## Changelog`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, "infra");
    assert.equal(results[0].status, "evergreen");
  });

  it("excludes completed projects", () => {
    writeProject(
      "done",
      `---
status: completed
completed_at: 2026-03-01
---

# Done

## Changelog
- [x] Item ✅ 2026-03-01`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });

  it("returns empty array for empty projects dir", () => {
    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });

  it("returns both active and evergreen projects", () => {
    writeProject(
      "a",
      `---
status: active
---

# Active One

## Tasks`,
    );

    writeProject(
      "b",
      `---
status: evergreen
---

# Evergreen One

## Tasks`,
    );

    writeProject(
      "c",
      `---
status: completed
---

# Completed One

## Changelog
- [x] Done ✅ 2026-03-01`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 2);
    const slugs = results.map((r) => r.slug).sort();
    assert.deepEqual(slugs, ["a", "b"]);
  });

  it("defaults to active when status is missing", () => {
    writeProject(
      "no-status",
      `---
---

# No Status

## Tasks`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "active");
  });

  it("skips _template directory", () => {
    writeProject(
      "_template",
      `---
status: active
---

# Template`,
    );

    const { listProjects } = requireFresh();
    const results = listProjects();
    assert.equal(results.length, 0);
  });
});

describe("parseChangelog", () => {
  it("filters changelog lines by regex", () => {
    writeProject(
      "cl",
      `---
status: active
---

# CL

## Changelog
- [x] Fix bug ✅ 2026-03-01
- [x] Add feature ✅ 2026-03-02

## Notes`,
    );

    const { parseChangelog } = requireFresh();
    parseChangelog(projectPath("cl"), "bug");
  });

  it("returns undefined for missing file", () => {
    const { parseChangelog } = requireFresh();
    const result = parseChangelog("/nonexistent/file.md", "test");
    assert.equal(result, undefined);
  });

  it("throws on invalid regex", () => {
    writeProject(
      "re",
      `---
status: active
---

# RE

## Changelog
- [x] Item ✅ 2026-03-01`,
    );

    const { parseChangelog } = requireFresh();
    assert.throws(
      () => parseChangelog(projectPath("re"), "[invalid"),
      /invalid regex/,
    );
  });
});
