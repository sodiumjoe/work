const fs = require('node:fs');

function extractSection(content, sectionName) {
  const lines = content.split('\n');
  const result = [];
  let inSection = false;
  for (const line of lines) {
    if (line.match(new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`))) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) {
      break;
    }
    if (inSection) {
      result.push(line);
    }
  }
  return result;
}

function extractSectionFromFile(filePath, sectionName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return extractSection(content, sectionName);
}

function findSectionLineRange(lines, sectionName) {
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].match(new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`))) {
      start = i;
      continue;
    }
    if (start !== -1 && /^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return start === -1 ? null : { start, end };
}

function insertBeforeNextSection(content, afterSection, newLines) {
  const lines = content.split('\n');
  const range = findSectionLineRange(lines, afterSection);
  if (!range) return content;
  const insertAt = range.end;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  return [...before, ...newLines, '', ...after].join('\n');
}

function insertAtEndOfSection(content, sectionName, newLines) {
  const lines = content.split('\n');
  const range = findSectionLineRange(lines, sectionName);
  if (!range) return content;
  let insertAt = range.end;
  while (insertAt > range.start + 1 && lines[insertAt - 1].trim() === '') {
    insertAt--;
  }
  const before = lines.slice(0, insertAt);
  let after = lines.slice(insertAt);
  while (after.length > 0 && after[0].trim() === '') {
    after.shift();
  }
  const separator = after.length > 0 ? [''] : [];
  return [...before, ...newLines, ...separator, ...after].join('\n');
}

function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return {};
  const result = {};
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { closed = true; break; }
    const match = lines[i].match(/^(\w+):\s*(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[match[1]] = val;
    }
  }
  return closed ? result : {};
}

function getTitle(content) {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1] : '';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractSection,
  extractSectionFromFile,
  findSectionLineRange,
  insertBeforeNextSection,
  insertAtEndOfSection,
  parseFrontmatter,
  getTitle,
};