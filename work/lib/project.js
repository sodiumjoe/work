const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, extractSection, getTitle } = require('./markdown.js');
const { PROJECT_DIR, VAULT_ROOT, PLAN_DIR, todayStr } = require('./paths.js');
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
    if (fm.status === 'evergreen') continue;
    if (fm.permanent === 'true' || fm.permanent === true) continue;
    const tasks = extractSection(content, 'Tasks');
    const openTasks = tasks.filter(l => /^- \[[ /]\]/.test(l));
    if (openTasks.length > 0) continue;
    const changelog = extractSection(content, 'Changelog');
    const openChangelog = changelog.filter(l => /^- \[ \]/.test(l));
    const done = changelog.filter(l => /^- \[x\]/.test(l));
    if (done.length === 0) continue;
    if (openChangelog.length > 0) continue;
    atomicRewrite(filePath, c => {
      c = c.replace(/^status:\s*active\s*$/m, 'status: completed');
      if (!/^completed_at:/m.test(c)) {
        c = c.replace(/^status:\s*completed\s*$/m, `status: completed\ncompleted_at: ${todayStr()}`);
      }
      return c;
    });
    const title = getTitle(content) || file;
    completed.push({ file, title });
    console.log(`completed: ${title} (${file})`);
  }
  return completed;
}

function archiveProject(slug) {
  const src = path.join(PROJECT_DIR, `${slug}.md`);
  if (!fs.existsSync(src)) throw new Error(`not found: ${src}`);
  const archiveProjectDir = path.join(VAULT_ROOT, 'archive', 'projects');
  fs.mkdirSync(archiveProjectDir, { recursive: true });
  fs.renameSync(src, path.join(archiveProjectDir, `${slug}.md`));
  console.log(`archived project: ${slug}`);
  const archiveDir = path.join(VAULT_ROOT, 'archive');
  if (fs.existsSync(PLAN_DIR)) {
    const plans = fs.readdirSync(PLAN_DIR).filter(f => f.endsWith('.md'));
    for (const f of plans) {
      const planPath = path.join(PLAN_DIR, f);
      const content = fs.readFileSync(planPath, 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm.project) continue;
      const projSlug = fm.project.replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/^projects\//, '');
      if (projSlug === slug) {
        fs.renameSync(planPath, path.join(archiveDir, f));
        console.log(`archived plan: ${f}`);
      }
    }
  }
}

function listProjects() {
  if (!fs.existsSync(PROJECT_DIR)) return [];
  const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md') && f !== '_template.md');
  const results = [];
  for (const file of files) {
    const filePath = path.join(PROJECT_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const status = fm.status || 'active';
    if (status !== 'active' && status !== 'evergreen') continue;
    const slug = file.replace('.md', '');
    const title = getTitle(content) || slug;
    results.push({ slug, title, status });
  }
  return results;
}

function archivePlan(name) {
  const src = path.join(PLAN_DIR, `${name}.md`);
  if (!fs.existsSync(src)) throw new Error(`not found: ${src}`);
  const archiveDir = path.join(VAULT_ROOT, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(src, path.join(archiveDir, `${name}.md`));
  console.log(`archived plan: ${name}`);
}

module.exports = {
  createProject,
  resolveProject,
  parseChangelog,
  completeProjects,
  archiveProject,
  archivePlan,
  listProjects,
};