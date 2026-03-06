const fs = require('node:fs');
const path = require('node:path');

function loadConfig() {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config');
  const configPath = path.join(xdgConfig, 'work', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

const config = loadConfig();
const VAULT_ROOT = process.env.WORK_VAULT || config.vault || path.join(process.env.HOME, 'work');
const PLAN_DIR = config.plans || path.join(process.env.HOME, '.claude', 'plans');
const PROJECT_DIR = path.join(VAULT_ROOT, 'projects');

function notePath(dateStr) {
  return path.join(VAULT_ROOT, `${dateStr}.md`);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { VAULT_ROOT, PLAN_DIR, PROJECT_DIR, notePath, todayStr };