const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, extractSection, getTitle } = require('./markdown.js');
const { PROJECT_DIR, VAULT_ROOT } = require('./paths.js');

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

module.exports = {
  createProject,
  resolveProject,
  parseChangelog,
};