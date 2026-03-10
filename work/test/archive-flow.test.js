const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let origVault;
let origXdg;
const workBin = path.join(__dirname, '..', 'bin', 'work');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-flow-'));
  fs.mkdirSync(path.join(tmpDir, 'projects'));
  fs.mkdirSync(path.join(tmpDir, 'plans'));
  fs.mkdirSync(path.join(tmpDir, 'config', 'work'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'config', 'work', 'config.json'),
    JSON.stringify({ plans: path.join(tmpDir, 'plans') })
  );
  origVault = process.env.WORK_VAULT;
  origXdg = process.env.XDG_CONFIG_HOME;
  process.env.WORK_VAULT = tmpDir;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (origVault === undefined) {
    delete process.env.WORK_VAULT;
  } else {
    process.env.WORK_VAULT = origVault;
  }
  if (origXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = origXdg;
  }
});

function writeProject(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'projects', name), content);
}

function writePlan(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'plans', name), content);
}

function writeDailyNote(dateStr, content) {
  fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
}

function readDailyNote(dateStr) {
  return fs.readFileSync(path.join(tmpDir, `${dateStr}.md`), 'utf-8');
}

function runWork(...args) {
  return runWorkEnv({}, ...args);
}

function runWorkEnv(extraEnv, ...args) {
  return execFileSync('node', [workBin, ...args], {
    env: {
      ...process.env,
      WORK_VAULT: tmpDir,
      XDG_CONFIG_HOME: path.join(tmpDir, 'config'),
      WORK_TEST_HOUR: '10',
      ...extraEnv,
    },
    encoding: 'utf-8',
    timeout: 10000,
  });
}

describe('work archive-project CLI', () => {
  it('archives project and plans via CLI', () => {
    writeProject('test-proj.md', `---
status: completed
---

# Test Project

## Changelog
- [x] Item ✅ 2026-03-01`);

    writePlan('test-plan.md', `---
status: active
project: "[[projects/test-proj]]"
---

# Test Plan`);

    const output = runWork('archive-project', 'test-proj');
    assert.ok(output.includes('archived project: test-proj'));
    assert.ok(output.includes('archived plan: test-plan.md'));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'projects', 'test-proj.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'test-proj.md')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'plans', 'test-plan.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'test-plan.md')));
  });

  it('errors on nonexistent project', () => {
    assert.throws(() => runWork('archive-project', 'nope'), /not found/);
  });
});

describe('tick archive queue integration', () => {
  it('tick dequeues checked archive items', () => {
    writeProject('to-archive.md', `---
status: completed
---

# To Archive

## Changelog
- [x] Done ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', [
      '## Tasks',
      '',
      '## Log',
      '',
      '## Archive',
      '- [x] [[projects/to-archive|To Archive]] — completed 2026-03-01 <!-- key:projects/to-archive -->',
    ].join('\n'));

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('archived: to-archive'));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'projects', 'to-archive.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'to-archive.md')));
    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('key:projects/to-archive'));
  });

  it('tick ignores unchecked archive items', () => {
    writeProject('keep-me.md', `---
status: completed
---

# Keep Me

## Changelog
- [x] Done ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', [
      '## Tasks',
      '',
      '## Log',
      '',
      '## Archive',
      '- [ ] [[projects/keep-me|Keep Me]] — completed 2026-03-01 <!-- key:projects/keep-me -->',
    ].join('\n'));

    runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(fs.existsSync(path.join(tmpDir, 'projects', 'keep-me.md')));
    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('key:projects/keep-me'));
  });

  it('tick with no archive section runs clean', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('nothing to archive'));
  });
});

describe('completeProjects stamps completed_at via CLI', () => {
  it('wrap stamps completed_at on newly completed projects', () => {
    writeProject('completable.md', `---
status: active
---

# Completable

## Tasks

## Changelog
- [x] All done ✅ 2026-03-01

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const fakeClaude = path.join(tmpDir, 'fake-claude.sh');
    fs.writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    runWorkEnv({ WORK_CLAUDE_CMD: fakeClaude }, 'wrap', '--date=2026-03-10');

    const result = fs.readFileSync(path.join(tmpDir, 'projects', 'completable.md'), 'utf-8');
    assert.ok(result.includes('status: completed'));
    assert.match(result, /completed_at: \d{4}-\d{2}-\d{2}/);
  });
});

describe('tick triggers wrap after 6 PM', () => {
  it('runs wrap when hour >= 18 and no summary', () => {
    writeProject('wrapable.md', `---
status: active
---

# Wrapable

## Tasks

## Changelog
- [x] Done ✅ 2026-03-10

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    const np = path.join(tmpDir, '2026-03-10.md');
    fs.writeFileSync(fakeClaude, [
      `#!/usr/bin/env node`,
      `const fs = require('fs');`,
      `const np = ${JSON.stringify(np)};`,
      `let c = fs.readFileSync(np, 'utf-8');`,
      `c = c.replace('## Log', '## Summary\\nFake summary\\n\\n## Log');`,
      `fs.writeFileSync(np, c);`,
    ].join('\n'), { mode: 0o755 });

    const output = runWorkEnv(
      { WORK_TEST_HOUR: '20', WORK_CLAUDE_CMD: fakeClaude },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('=== wrap ==='));
    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('## Summary'));
    const proj = fs.readFileSync(path.join(tmpDir, 'projects', 'wrapable.md'), 'utf-8');
    assert.ok(proj.includes('status: completed'));
  });

  it('skips wrap when summary already exists', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Summary\nAlready done\n\n## Log\n');

    const output = runWorkEnv(
      { WORK_TEST_HOUR: '20' },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('skip wrap'));
    assert.ok(output.includes('hasSummary=true'));
  });

  it('skips wrap before 6 PM', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const output = runWorkEnv(
      { WORK_TEST_HOUR: '10' },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('skip wrap'));
  });
});

describe('queue enqueue via tick on Sunday', () => {
  it('proposes completed projects on Sunday', () => {
    writeProject('done-proj.md', `---
status: completed
completed_at: 2026-03-08
---

# Done Project

## Changelog
- [x] Item ✅ 2026-03-08

## Notes`);

    writeProject('active-proj.md', `---
status: active
---

# Active Project

## Tasks
- [ ] Still working

## Changelog

## Notes`);

    writeDailyNote('2026-03-08', '## Tasks\n\n## Log\n');

    // 2026-03-08 is a Sunday
    const output = runWork('tick', '--verbose', '--date=2026-03-08');
    assert.ok(output.includes('propose'));
    const note = readDailyNote('2026-03-08');
    assert.ok(note.includes('key:projects/done-proj'));
    assert.ok(!note.includes('key:projects/active-proj'));
  });

  it('skips evergreen projects when proposing', () => {
    writeProject('evergreen.md', `---
status: evergreen
---

# Evergreen

## Changelog
- [x] Item ✅ 2026-03-01

## Notes`);

    writeDailyNote('2026-03-08', '## Tasks\n\n## Log\n');

    runWork('tick', '--verbose', '--date=2026-03-08');
    const note = readDailyNote('2026-03-08');
    assert.ok(!note.includes('key:projects/evergreen'));
  });
});

describe('tick log rotation', () => {
  it('does not rotate when log is small', () => {
    const logPath = path.join(tmpDir, 'test-tick.log');
    fs.writeFileSync(logPath, 'line1\nline2\nline3\n');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWorkEnv({ WORK_LOG_PATH: logPath }, 'tick', '--verbose', '--date=2026-03-10');

    assert.ok(fs.existsSync(logPath));
    assert.equal(fs.readFileSync(logPath, 'utf-8'), 'line1\nline2\nline3\n');
    const rotated = path.join(tmpDir, 'work-tick-2026-03-10.log');
    assert.ok(!fs.existsSync(rotated));
  });

  it('rotates when log exceeds threshold', () => {
    const logPath = path.join(tmpDir, 'test-tick.log');
    const bigLog = Array.from({ length: 1001 }, (_, i) => `line ${i}`).join('\n') + '\n';
    fs.writeFileSync(logPath, bigLog);
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWorkEnv({ WORK_LOG_PATH: logPath }, 'tick', '--verbose', '--date=2026-03-10');

    assert.equal(fs.readFileSync(logPath, 'utf-8'), '');
    const rotated = path.join(tmpDir, 'work-tick-2026-03-10.log');
    assert.ok(fs.existsSync(rotated));
    const rotatedContent = fs.readFileSync(rotated, 'utf-8');
    assert.ok(rotatedContent.includes('line 0'));
    assert.ok(rotatedContent.includes('line 1000'));
  });

  it('appends when rotated file already exists', () => {
    const logPath = path.join(tmpDir, 'test-tick.log');
    const rotated = path.join(tmpDir, 'work-tick-2026-03-10.log');
    fs.writeFileSync(rotated, 'previous\n');
    const bigLog = Array.from({ length: 1001 }, (_, i) => `line ${i}`).join('\n') + '\n';
    fs.writeFileSync(logPath, bigLog);
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWorkEnv({ WORK_LOG_PATH: logPath }, 'tick', '--verbose', '--date=2026-03-10');

    assert.equal(fs.readFileSync(logPath, 'utf-8'), '');
    const rotatedContent = fs.readFileSync(rotated, 'utf-8');
    assert.ok(rotatedContent.startsWith('previous\n'));
    assert.ok(rotatedContent.includes('line 0'));
  });
});

describe('tick error injection', () => {
  it('injects errors into Tasks section, not Log', () => {
    fs.rmSync(path.join(tmpDir, 'projects'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'projects'), 'not a directory');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    try {
      runWork('tick', '--verbose', '--date=2026-03-10');
    } catch {}

    const note = readDailyNote('2026-03-10');
    const tasksMatch = note.match(/## Tasks\n([\s\S]*?)(?=\n## |$)/);
    const logMatch = note.match(/## Log\n([\s\S]*?)(?=\n## |$)/);
    assert.ok(tasksMatch && tasksMatch[1].includes('Investigate work tick errors'));
    assert.ok(!logMatch || !logMatch[1].includes('Investigate work tick errors'));
  });
});

describe('wrap passes --allowedTools', () => {
  it('passes --allowedTools and prompt via stdin to claude', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const argsFile = path.join(tmpDir, 'claude-args.txt');
    const stdinFile = path.join(tmpDir, 'claude-stdin.txt');
    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    fs.writeFileSync(fakeClaude, [
      '#!/usr/bin/env node',
      `const fs = require('fs');`,
      `fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));`,
      `let stdin = '';`,
      `process.stdin.setEncoding('utf-8');`,
      `process.stdin.on('data', d => stdin += d);`,
      `process.stdin.on('end', () => {`,
      `  fs.writeFileSync(${JSON.stringify(stdinFile)}, stdin);`,
      `});`,
    ].join('\n'), { mode: 0o755 });

    runWorkEnv({ WORK_CLAUDE_CMD: fakeClaude }, 'wrap', '--date=2026-03-10');

    const args = JSON.parse(fs.readFileSync(argsFile, 'utf-8'));
    assert.ok(args.includes('--allowedTools'));
    assert.ok(args.includes('Read'));
    assert.ok(args.includes('Edit'));
    assert.ok(args.includes('-p'));
    const stdin = fs.readFileSync(stdinFile, 'utf-8');
    assert.ok(stdin.includes('Read the daily note'));
  });
});