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

function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0] !== "---") return { frontmatter: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { frontmatter: {}, body: content };
  const fm = {};
  let currentKey = null;
  for (let i = 1; i < end; i++) {
    const topLevel = lines[i].match(/^(\S+):\s*(.*)$/);
    const nested = lines[i].match(/^  (\S+):\s*(.+)$/);
    if (topLevel) {
      currentKey = topLevel[1];
      const val = topLevel[2].trim();
      fm[currentKey] = val || {};
    } else if (nested && currentKey && typeof fm[currentKey] === "object") {
      fm[currentKey][nested[1]] = nested[2].trim();
    }
  }
  const body = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  return { frontmatter: fm, body };
}

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
      const { body } = parseFrontmatter(content);
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
      const commandContent = fs.readFileSync(
        path.join(COMMANDS_DIR, file),
        "utf-8",
      );
      const skillContent = fs.readFileSync(skillPath, "utf-8");
      const commandBody = stripFrontmatter(commandContent);
      const skillBody = stripFrontmatter(skillContent);
      assert.equal(
        commandBody,
        skillBody,
        `${file} body differs from skills/${slug}/SKILL.md — these should be kept in sync`,
      );
    }
  });

  it("forked skills match upstream content_hash", () => {
    if (!fs.existsSync(PLUGIN_CACHE)) return;
    const skillDirs = fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const dir of skillDirs) {
      const skillPath = path.join(SKILLS_DIR, dir.name, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, "utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const fork = frontmatter.forked_from;
      if (!fork || !fork.content_hash || !fork.plugin || !fork.skill) continue;
      const [plugin] = fork.plugin.split("@");
      const pluginDir = path.join(PLUGIN_CACHE, plugin);
      if (!fs.existsSync(pluginDir)) continue;
      const versions = fs.readdirSync(pluginDir).sort();
      const latestVersion = versions[versions.length - 1];
      const upstreamPath = path.join(
        pluginDir,
        latestVersion,
        "skills",
        fork.skill,
        "SKILL.md",
      );
      if (!fs.existsSync(upstreamPath)) continue;
      const upstreamContent = fs.readFileSync(upstreamPath, "utf-8");
      const hash = crypto
        .createHash("sha256")
        .update(upstreamContent)
        .digest("hex");
      assert.equal(
        hash,
        fork.content_hash,
        `skills/${dir.name} was forked from ${fork.plugin}:${fork.skill} ` +
          `(version ${fork.version}) but upstream has changed ` +
          `(stored: ${fork.content_hash.slice(0, 12)}…, current: ${hash.slice(0, 12)}…) — ` +
          `review upstream changes and update the fork`,
      );
    }
  });
});
