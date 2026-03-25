const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

function requireFresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

describe("checkUpstream", () => {
  let tmpDir, savedHome;
  const LIB = path.join(__dirname, "..", "lib");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-test-"));
    savedHome = process.env.HOME;
  });

  afterEach(() => {
    process.env.HOME = savedHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupFakeEnv(skills, upstreamSkills) {
    const homeDir = path.join(tmpDir, "home");
    process.env.HOME = homeDir;
    const skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const [name, content] of Object.entries(skills)) {
      const dir = path.join(skillsDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), content);
    }
    if (upstreamSkills) {
      const cacheDir = path.join(
        homeDir,
        ".claude",
        "plugins",
        "cache",
        "stripe-internal-marketplace",
        "superpowers",
        "1.0.1",
        "skills",
      );
      for (const [name, content] of Object.entries(upstreamSkills)) {
        const dir = path.join(cacheDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "SKILL.md"), content);
      }
    }
    return skillsDir;
  }

  function hash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  function makeFrontmatter(name, upstreamContent) {
    return `---\nname: ${name}\ndescription: test skill\nplugin: superpowers@stripe-internal-marketplace\nversion: 1.0.1\nskill: ${name}\ncontent_hash: ${hash(upstreamContent)}\n---\n\n# ${name}`;
  }

  it("detects up-to-date skills", () => {
    const upstream = "---\nname: foo\n---\n# foo";
    const skillsDir = setupFakeEnv(
      { foo: makeFrontmatter("foo", upstream) },
      { foo: upstream },
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, "foo");
    assert.equal(results[0].status, "up-to-date");
  });

  it("detects drifted skills", () => {
    const originalUpstream = "---\nname: bar\n---\n# bar v1";
    const newUpstream = "---\nname: bar\n---\n# bar v2 changed";
    const skillsDir = setupFakeEnv(
      { bar: makeFrontmatter("bar", originalUpstream) },
      { bar: newUpstream },
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, "bar");
    assert.equal(results[0].status, "drifted");
    assert.equal(results[0].storedHash, hash(originalUpstream));
    assert.equal(results[0].currentHash, hash(newUpstream));
    assert.equal(results[0].forkedVersion, "1.0.1");
    assert.ok(results[0].upstreamFile.endsWith("SKILL.md"));
    assert.ok(results[0].localFile.endsWith("SKILL.md"));
  });

  it("handles missing cache gracefully", () => {
    const upstream = "---\nname: baz\n---\n# baz";
    const skillsDir = setupFakeEnv(
      { baz: makeFrontmatter("baz", upstream) },
      null,
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, "baz");
    assert.equal(results[0].status, "no-cache");
    assert.ok(results[0].message.includes("upstream cache not found"));
  });

  it("skips skills without tracking frontmatter", () => {
    const skillsDir = setupFakeEnv(
      { qux: "---\nname: qux\ndescription: no tracking\n---\n# qux" },
      { qux: "---\nname: qux\n---\n# qux" },
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    assert.equal(results.length, 0);
  });

  it("returns empty for nonexistent skills directory", () => {
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(path.join(tmpDir, "nonexistent"));
    assert.equal(results.length, 0);
  });

  it("reports no-upstream when skill missing from cache", () => {
    const upstream = "---\nname: missing\n---\n# missing";
    const skillsDir = setupFakeEnv(
      { missing: makeFrontmatter("missing", upstream) },
      { "other-skill": upstream },
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, "missing");
    assert.equal(results[0].status, "no-upstream");
  });

  it("handles multiple skills with mixed statuses", () => {
    const upA = "---\nname: a\n---\n# a";
    const upB = "---\nname: b\n---\n# b v1";
    const upBNew = "---\nname: b\n---\n# b v2";
    const skillsDir = setupFakeEnv(
      {
        a: makeFrontmatter("a", upA),
        b: makeFrontmatter("b", upB),
        c: "---\nname: c\n---\n# no tracking",
      },
      { a: upA, b: upBNew, c: "---\nname: c\n---\n# c" },
    );
    const { checkUpstream } = requireFresh(path.join(LIB, "upstream.js"));
    const results = checkUpstream(skillsDir);
    const bySkill = Object.fromEntries(results.map((r) => [r.skill, r]));
    assert.equal(bySkill.a.status, "up-to-date");
    assert.equal(bySkill.b.status, "drifted");
    assert.equal(bySkill.c, undefined);
  });
});
