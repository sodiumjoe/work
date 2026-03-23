const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");
const SKILLS_DIR = path.join(__dirname, "..", "skills");

function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0] !== "---") return { frontmatter: {}, body: content };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      const fmLines = lines.slice(1, i);
      const fm = {};
      for (const line of fmLines) {
        const match = line.match(/^(\S+):\s*(.+)$/);
        if (match) fm[match[1]] = match[2];
      }
      const body = lines
        .slice(i + 1)
        .join("\n")
        .trim();
      return { frontmatter: fm, body };
    }
  }
  return { frontmatter: {}, body: content };
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
});
