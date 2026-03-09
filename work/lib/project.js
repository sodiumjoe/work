const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, extractSection, getTitle } = require('./markdown.js');
const { PROJECT_DIR, VAULT_ROOT } = require('./paths.js');
const { atomicRewrite } = require('./atomic.js');

function createProject(slug, title) {
  if (!slug || /[\s/]/.test(slug)) {
    throw new Error('invalid slug: must be non-empty, no spaces, no /');
  }
  const target = path.join(PROJECT_DIR, `${slug}.md`);
  if (fs.existsSync(target)) {
    throw new Error(`exists: ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---
status: active
---

# ${title}

## Links

## Plans

## Tasks

## Changelog

## Notes`);
  console.log(target);
}

function resolveProject(planFile) {
  if (!planFile || !fs.existsSync(planFile)) return;
  const content = fs.readFileSync(planFile, 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm.project) return;
  let project = fm.project;
  project = project.replace(/^\[\[/, '').replace(/\]\]$/, '');
  const projFile = path.join(VAULT_ROOT, `${project}.md`);
  if (fs.existsSync(projFile)) {
    console.log(projFile);
    return;
  }
  const fallback = path.join(process.env.HOME, '.claude', `${project}.md`);
  if (fs.existsSync(fallback)) {
    console.log(fallback);
  }
}

function parseChangelog(filePath, pattern) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const title = getTitle(content);
  const base = path.basename(filePath);
  const changelog = extractSection(content, 'Changelog');
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
  const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md'));
  const completed = [];
  for (const file of files) {
    const filePath = path.join(PROJECT_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (fm.status === 'completed') continue;
    if (fm.permanent === 'true' || fm.permanent === true) continue;
    const tasks = extractSection(content, 'Tasks');
    const openTasks = tasks.filter(l => /^- \[[ /]\]/.test(l));
    if (openTasks.length > 0) continue;
    const changelog = extractSection(content, 'Changelog');
    const openChangelog = changelog.filter(l => /^- \[ \]/.test(l));
    const done = changelog.filter(l => /^- \[x\]/.test(l));
    if (done.length === 0) continue;
    if (openChangelog.length > 0) continue;
    atomicRewrite(filePath, c => c.replace(/^status:\s*active\s*$/m, 'status: completed'));
    const title = getTitle(content) || file;
    completed.push({ file, title });
    console.log(`completed: ${title} (${file})`);
  }
  return completed;
}

module.exports = {
  createProject,
  resolveProject,
  parseChangelog,
  completeProjects,
};