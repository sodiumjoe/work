const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");
const SKILLS_DIR = path.join(__dirname, "..", "skills");
const PLUGIN_CACHE = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "cache",
  "stripe-internal-marketplace",
);

function stripFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0] !== "---") return content.trim();
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      return lines
        .slice(i + 1)
        .join("\n")
        .trim();
    }
  }
  return content.trim();
}

function extractSections(text) {
  const body = stripFrontmatter(text);
  const sections = new Map();
  let current = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^## (.+)/);
    if (m) {
      current = m[1];
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return [...sections.keys()];
}

function resolveUpstreamPath(fork) {
  const [plugin] = fork.plugin.split("@");
  const pluginDir = path.join(PLUGIN_CACHE, plugin);
  if (!fs.existsSync(pluginDir)) return null;
  const versions = fs.readdirSync(pluginDir).sort();
  return path.join(
    pluginDir,
    versions[versions.length - 1],
    "skills",
    fork.skill,
    "SKILL.md",
  );
}

describe("commands", () => {
  const commandFiles = fs
    .readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".md"));

  it("all command files exist and are non-empty", () => {
    assert.ok(commandFiles.length > 0, "no command files found");
    for (const file of commandFiles) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf-8");
      assert.ok(content.trim().length > 0, `${file} is empty`);
    }
  });

  it("no command has disable-model-invocation", () => {
    for (const file of commandFiles) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf-8");
      assert.ok(
        !content.includes("disable-model-invocation"),
        `${file} has disable-model-invocation — this prevents the Skill tool from loading it`,
      );
    }
  });

  it("no command is a self-referential stub", () => {
    for (const file of commandFiles) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf-8");
      const body = stripFrontmatter(content);
      const lines = body.split("\n").filter((l) => l.trim().length > 0);
      assert.ok(
        lines.length > 3,
        `${file} has only ${lines.length} non-empty lines — likely a stub`,
      );
    }
  });

  it("commands with matching skills have the same body content", () => {
    for (const file of commandFiles) {
      const slug = file.replace(/\.md$/, "");
      const skillPath = path.join(SKILLS_DIR, slug, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      const commandBody = stripFrontmatter(
        fs.readFileSync(path.join(COMMANDS_DIR, file), "utf-8"),
      );
      const skillBody = stripFrontmatter(fs.readFileSync(skillPath, "utf-8"));
      assert.equal(
        commandBody,
        skillBody,
        `${file} body differs from skills/${slug}/SKILL.md — these should be kept in sync`,
      );
    }
  });
});

describe("forked skills", () => {
  const skillDirs = fs.existsSync(SKILLS_DIR)
    ? fs
        .readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
    : [];

  for (const dir of skillDirs) {
    const forkJsonPath = path.join(SKILLS_DIR, dir.name, "fork.json");
    if (!fs.existsSync(forkJsonPath)) continue;
    const fork = JSON.parse(fs.readFileSync(forkJsonPath, "utf-8"));
    const skillPath = path.join(SKILLS_DIR, dir.name, "SKILL.md");

    describe(dir.name, () => {
      it("upstream content_hash matches installed plugin", () => {
        if (!fs.existsSync(PLUGIN_CACHE)) return;
        const upstreamPath = resolveUpstreamPath(fork.upstream);
        if (!upstreamPath || !fs.existsSync(upstreamPath)) return;
        const hash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(upstreamPath, "utf-8"))
          .digest("hex");
        assert.equal(
          hash,
          fork.upstream.content_hash,
          `upstream ${fork.upstream.plugin}:${fork.upstream.skill} has changed — ` +
            `review changes and update fork.json content_hash`,
        );
      });

      it("section_map covers all upstream sections", () => {
        if (!fs.existsSync(PLUGIN_CACHE)) return;
        const upstreamPath = resolveUpstreamPath(fork.upstream);
        if (!upstreamPath || !fs.existsSync(upstreamPath)) return;
        const upstreamSections = extractSections(
          fs.readFileSync(upstreamPath, "utf-8"),
        );
        const mapped = new Set(Object.keys(fork.section_map));
        const removed = new Set(fork.removed_sections);
        const unaccounted = upstreamSections.filter(
          (s) => !mapped.has(s) && !removed.has(s),
        );
        assert.deepEqual(
          unaccounted,
          [],
          `upstream sections not in section_map or removed_sections: ${unaccounted.join(", ")} — ` +
            `add to fork.json section_map or removed_sections`,
        );
      });

      it("section_map targets exist in fork", () => {
        const forkSections = new Set(
          extractSections(fs.readFileSync(skillPath, "utf-8")),
        );
        const missing = Object.entries(fork.section_map)
          .filter(([, target]) => !forkSections.has(target))
          .map(([upstream, target]) => `${upstream} → ${target}`);
        assert.deepEqual(
          missing,
          [],
          `section_map targets missing from fork: ${missing.join(", ")}`,
        );
      });

      it("added_sections exist in fork", () => {
        const forkSections = new Set(
          extractSections(fs.readFileSync(skillPath, "utf-8")),
        );
        const missing = fork.added_sections.filter((s) => !forkSections.has(s));
        assert.deepEqual(
          missing,
          [],
          `added_sections missing from fork: ${missing.join(", ")}`,
        );
      });

      it("removed_sections are absent from fork", () => {
        const forkSections = new Set(
          extractSections(fs.readFileSync(skillPath, "utf-8")),
        );
        const present = fork.removed_sections.filter((s) =>
          forkSections.has(s),
        );
        assert.deepEqual(
          present,
          [],
          `removed_sections still present in fork: ${present.join(", ")}`,
        );
      });

      it("fork has no unclassified sections", () => {
        const forkSections = extractSections(
          fs.readFileSync(skillPath, "utf-8"),
        );
        const mapped = new Set(Object.values(fork.section_map));
        const added = new Set(fork.added_sections);
        const unclassified = forkSections.filter(
          (s) => !mapped.has(s) && !added.has(s),
        );
        assert.deepEqual(
          unclassified,
          [],
          `fork sections not in section_map or added_sections: ${unclassified.join(", ")} — ` +
            `add to fork.json section_map or added_sections`,
        );
      });
    });
  }
});
