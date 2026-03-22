const fs = require("node:fs");
const {
  parse,
  serialize,
  findSection,
  appendToSection,
  mutateSection,
} = require("./markdown.js");
const { atomicRewrite } = require("./atomic.js");
const { notePath } = require("./paths.js");

function checkOff(filePath, description, dateStr, { quiet } = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  let action;
  atomicRewrite(filePath, (content) => {
    const doc = parse(content);

    let found = false;
    mutateSection(doc, "Tasks", (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/^- \[[ /]\]/.test(lines[i])) {
          const text = lines[i].replace(/^- \[.\] /, "");
          if (text === description || text.includes(description)) {
            lines[i] = `- [x] ${text}`;
            found = true;
            action = "checked";
            break;
          }
        }
      }
      return lines;
    });
    if (found) return serialize(doc);

    if (!findSection(doc, "Changelog")) {
      doc.sections.push({ name: "Changelog", lines: [] });
    }

    mutateSection(doc, "Changelog", (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/^- \[ \]/.test(lines[i])) {
          const text = lines[i].replace(/^- \[ \] /, "");
          if (text === description || text.includes(description)) {
            lines[i] = `- [x] ${text} ✅ ${dateStr}`;
            found = true;
            action = "checked";
            break;
          }
        }
      }
      return lines;
    });
    if (found) return serialize(doc);

    const entry = `- [x] ${description} ✅ ${dateStr}`;
    action = "appended";
    appendToSection(doc, "Changelog", [entry]);
    return serialize(doc);
  });
  if (!quiet) console.log(`${action}: ${description}`);
  return action;
}

function appendLog(
  dateStr,
  description,
  sourceType,
  sourceSlug,
  sourceTitle,
  { quiet } = {},
) {
  const dailyNote = notePath(dateStr);
  if (!fs.existsSync(dailyNote)) {
    throw new Error("no daily note found");
  }
  let wikiSuffix = "";
  if (sourceSlug && sourceTitle) {
    const wikiPath = `projects/${sourceSlug}/project`;
    wikiSuffix = ` — [[${wikiPath}|${sourceTitle}]]`;
  }
  const entry = `- [x] ${description} ✅ ${dateStr}${wikiSuffix}`;
  atomicRewrite(dailyNote, (content) => {
    const doc = parse(content);
    if (!findSection(doc, "Log")) {
      throw new Error("no ## Log section found");
    }
    appendToSection(doc, "Log", [entry]);
    return serialize(doc);
  });
  if (!quiet) console.log(entry);
}

module.exports = { checkOff, appendLog };
