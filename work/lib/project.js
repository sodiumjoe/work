const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, extractSection, getTitle } = require('./markdown.js');

function createProject(slug, title) {
  if (!slug || /[\s/]/.test(slug)) {
    console.error('invalid slug: must be non-empty, no spaces, no /');
    process.exit(1);
  }
  const target = path.join(process.env.HOME, 'stripe', 'work', 'projects', `${slug}.md`);
  if (fs.existsSync(target)) {
    console.error(`exists: ${target}`);
    process.exit(1);
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
  const projFile = path.join(process.env.HOME, 'stripe', 'work', `${project}.md`);
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
  const re = new RegExp(pattern);
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