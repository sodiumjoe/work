const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, extractSection, getTitle } = require("./markdown.js");
const {
  PROJECT_DIR,
  VAULT_ROOT,
  projectDir,
  projectFile,
  todayStr,
} = require("./paths.js");
const { atomicRewrite } = require("./atomic.js");

function createProject(slug, title) {
  if (!slug || /[\s/]/.test(slug)) {
    throw new Error("invalid slug: must be non-empty, no spaces, no /");
  }
  const dir = projectDir(slug);
  const target = projectFile(slug);
  if (fs.existsSync(target)) {
    throw new Error(`exists: ${target}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    target,
    `---
status: active
id: ${slug}
---

# ${title}

## Links

## Plans

## Tasks

## Changelog

## Notes`,
  );
  console.log(target);
}

function resolveProject(planFile) {
  if (!planFile || !fs.existsSync(planFile)) return;
  const content = fs.readFileSync(planFile, "utf-8");
  const fm = parseFrontmatter(content);
  if (!fm.project) return;
  let project = fm.project;
  project = project.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const slug = project.replace(/^projects\//, "").replace(/\/project$/, "");
  const newPath = projectFile(slug);
  if (fs.existsSync(newPath)) {
    console.log(newPath);
    return;
  }
  const legacyPath = path.join(VAULT_ROOT, `${project}.md`);
  if (fs.existsSync(legacyPath)) {
    console.log(legacyPath);
    return;
  }
}

function parseChangelog(filePath, pattern) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  const title = getTitle(content);
  const base = path.basename(filePath);
  const changelog = extractSection(content, "Changelog");
  let re;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    throw new Error(`invalid regex pattern: ${pattern}`);
  }
  for (const line of changelog) {
    if (re.test(line)) {
      console.log(`${base}\t${title}\t${line}`);
    }
  }
}

function completeProjects() {
  if (!fs.existsSync(PROJECT_DIR)) return [];
  const entries = fs.readdirSync(PROJECT_DIR, { withFileTypes: true });
  const completed = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("-")) continue;
    const slug = entry.name;
    const filePath = projectFile(slug);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (fm.status === "completed") continue;
    if (fm.status === "evergreen") continue;
    if (fm.permanent === "true" || fm.permanent === true) continue;
    const tasks = extractSection(content, "Tasks");
    const openTasks = tasks.filter((l) => /^- \[[ /]\]/.test(l));
    if (openTasks.length > 0) continue;
    const changelog = extractSection(content, "Changelog");
    const openChangelog = changelog.filter((l) => /^- \[ \]/.test(l));
    const done = changelog.filter((l) => /^- \[x\]/.test(l));
    if (done.length === 0) continue;
    if (openChangelog.length > 0) continue;
    atomicRewrite(filePath, (c) => {
      c = c.replace(/^status:\s*active\s*$/m, "status: completed");
      if (!/^completed_at:/m.test(c)) {
        c = c.replace(
          /^status:\s*completed\s*$/m,
          `status: completed\ncompleted_at: ${todayStr()}`,
        );
      }
      return c;
    });
    const title = getTitle(content) || slug;
    completed.push({ file: `${slug}/project.md`, title });
    console.log(`completed: ${title} (${slug})`);
  }
  return completed;
}

function archiveProject(slug) {
  const srcDir = projectDir(slug);
  const srcFile = projectFile(slug);
  if (!fs.existsSync(srcFile)) throw new Error(`not found: ${srcFile}`);
  const archiveProjectDir = path.join(VAULT_ROOT, "archive", "projects");
  fs.mkdirSync(archiveProjectDir, { recursive: true });
  const destDir = path.join(archiveProjectDir, slug);
  fs.renameSync(srcDir, destDir);
  console.log(`archived project: ${slug}`);
}

function listProjects() {
  if (!fs.existsSync(PROJECT_DIR)) return [];
  const entries = fs.readdirSync(PROJECT_DIR, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("-")) continue;
    const slug = entry.name;
    const filePath = projectFile(slug);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    const status = fm.status || "active";
    if (status !== "active" && status !== "evergreen") continue;
    const title = getTitle(content) || slug;
    results.push({ slug, title, status });
  }
  return results;
}

module.exports = {
  createProject,
  resolveProject,
  parseChangelog,
  completeProjects,
  archiveProject,
  listProjects,
};
