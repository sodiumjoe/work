const path = require('node:path');

const VAULT_ROOT = path.join(process.env.HOME, 'stripe', 'work');
const PLAN_DIR = path.join(process.env.HOME, '.claude', 'plans');
const PROJECT_DIR = path.join(VAULT_ROOT, 'projects');

function notePath(dateStr) {
  return path.join(VAULT_ROOT, `${dateStr}.md`);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { VAULT_ROOT, PLAN_DIR, PROJECT_DIR, notePath, todayStr };