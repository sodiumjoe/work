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
      WORK_SKIP_REVIEWS: '1',
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
    assert.ok(output.includes('archived project: to-archive'));
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

describe('tick wraps previous unwrapped days', () => {
  it('wraps previous day note if it lacks summary', () => {
    writeProject('wrapable.md', `---
status: active
---

# Wrapable

## Tasks

## Changelog
- [x] Done ✅ 2026-03-09

## Notes`);

    writeDailyNote('2026-03-09', '## Tasks\n\n## Log\n');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    // pre-create weekly file so weekly summary doesn't fire and steal the fake claude call
    fs.mkdirSync(path.join(tmpDir, 'weekly'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'weekly', '2026-W11.md'), '# done');

    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    const np = path.join(tmpDir, '2026-03-09.md');
    fs.writeFileSync(fakeClaude, [
      `#!/usr/bin/env node`,
      `const fs = require('fs');`,
      `const np = ${JSON.stringify(np)};`,
      `let c = fs.readFileSync(np, 'utf-8');`,
      `c = c.replace('## Log', '## Summary\\nFake summary\\n\\n## Log');`,
      `fs.writeFileSync(np, c);`,
    ].join('\n'), { mode: 0o755 });

    const output = runWorkEnv(
      { WORK_CLAUDE_CMD: fakeClaude },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('=== wrap 2026-03-09 ==='));
    const note = readDailyNote('2026-03-09');
    assert.ok(note.includes('## Summary'));
    const proj = fs.readFileSync(path.join(tmpDir, 'projects', 'wrapable.md'), 'utf-8');
    assert.ok(proj.includes('status: completed'));
  });

  it('stops backfill at first summarized day', () => {
    writeDailyNote('2026-03-08', '## Tasks\n\n## Summary\nAlready done\n\n## Log\n');
    writeDailyNote('2026-03-09', '## Tasks\n\n## Log\n');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const wrappedDates = [];
    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    const logFile = path.join(tmpDir, 'wrap-log.txt');
    fs.writeFileSync(fakeClaude, [
      '#!/usr/bin/env node',
      `const fs = require('fs');`,
      `const existing = fs.existsSync(${JSON.stringify(logFile)}) ? fs.readFileSync(${JSON.stringify(logFile)}, 'utf-8') : '';`,
      `fs.writeFileSync(${JSON.stringify(logFile)}, existing + 'wrapped\\n');`,
    ].join('\n'), { mode: 0o755 });

    const output = runWorkEnv(
      { WORK_CLAUDE_CMD: fakeClaude },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('=== wrap 2026-03-09 ==='));
    assert.ok(!output.includes('=== wrap 2026-03-08 ==='));
    const wrapCount = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l === 'wrapped').length;
    assert.equal(wrapCount, 1);
  });

  it('does not wrap today', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(!output.includes('=== wrap'));
  });

  it('skips days with no daily note', () => {
    // day N-1 has no note, day N-2 has unsummarized note
    writeDailyNote('2026-03-08', '## Tasks\n\n## Log\n');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const logFile = path.join(tmpDir, 'wrap-log.txt');
    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    fs.writeFileSync(fakeClaude, [
      '#!/usr/bin/env node',
      `const fs = require('fs');`,
      `const existing = fs.existsSync(${JSON.stringify(logFile)}) ? fs.readFileSync(${JSON.stringify(logFile)}, 'utf-8') : '';`,
      `fs.writeFileSync(${JSON.stringify(logFile)}, existing + 'wrapped\\n');`,
    ].join('\n'), { mode: 0o755 });

    const output = runWorkEnv(
      { WORK_CLAUDE_CMD: fakeClaude },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('=== wrap 2026-03-08 ==='));
    assert.ok(!output.includes('=== wrap 2026-03-09 ==='));
  });
});

describe('weekly proposals via tick', () => {
  it('proposes completed projects when weekly file missing', () => {
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

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('propose'));
    const note = readDailyNote('2026-03-10');
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

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWork('tick', '--verbose', '--date=2026-03-10');
    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('key:projects/evergreen'));
  });

  it('skips proposals when weekly file already exists', () => {
    writeProject('done-proj.md', `---
status: completed
completed_at: 2026-03-08
---

# Done Project

## Changelog
- [x] Item ✅ 2026-03-08

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    // 2026-03-10 is in ISO week 2026-W11
    fs.mkdirSync(path.join(tmpDir, 'weekly'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'weekly', '2026-W11.md'), '# Already done');

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(!output.includes('propose'));
    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('key:projects/done-proj'));
  });
});


describe('tick error debug', () => {
  function makeFakeClaude() {
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
    return { fakeClaude, argsFile, stdinFile };
  }

  it('spawns Claude on error with correct args and prompt', () => {
    const { fakeClaude, argsFile, stdinFile } = makeFakeClaude();
    fs.rmSync(path.join(tmpDir, 'projects'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'projects'), 'not a directory');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    let output;
    try {
      output = runWorkEnv({ WORK_CLAUDE_CMD: fakeClaude }, 'tick', '--verbose', '--date=2026-03-10');
    } catch (e) {
      output = e.stdout || '';
    }

    assert.ok(output.includes('ERROR'));
    assert.ok(fs.existsSync(argsFile), 'claude should have been invoked');
    const args = JSON.parse(fs.readFileSync(argsFile, 'utf-8'));
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('--allowedTools'));
    assert.ok(args.includes('Read'));
    assert.ok(args.includes('Glob'));
    assert.ok(args.includes('Grep'));
    assert.ok(args.includes('Write'));
    assert.ok(args.includes('Edit'));
    const stdin = fs.readFileSync(stdinFile, 'utf-8');
    assert.ok(stdin.includes('tick command encountered errors'));
    assert.ok(stdin.includes('Fix tick error:'));
  });

  it('skips Claude if tick-error task already exists', () => {
    const { fakeClaude, argsFile } = makeFakeClaude();
    writeProject('work.md', '---\nstatus: evergreen\n---\n\n# work\n\n## Tasks\n\n- [ ] Fix tick error: previous error\n\n## Changelog\n');
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    try {
      runWorkEnv({ WORK_CLAUDE_CMD: fakeClaude }, 'tick', '--verbose', '--date=2026-03-10', '--simulate-error');
    } catch {}

    assert.ok(!fs.existsSync(argsFile), 'claude should NOT have been invoked');
  });

  it('logs syslog INFO on success', () => {
    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');
    const { fakeClaude, argsFile } = makeFakeClaude();

    const output = runWorkEnv({ WORK_CLAUDE_CMD: fakeClaude }, 'tick', '--date=2026-03-10');

    assert.ok(output.includes('INFO'));
    assert.ok(output.includes('tick ok'));
    assert.ok(!fs.existsSync(argsFile), 'claude should NOT have been invoked');
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

describe('orphaned plan proposals via tick', () => {
  it('proposes orphaned plans when weekly file missing', () => {
    writePlan('orphan-plan.md', `---
status: active
---

# Orphan Plan

## Changelog
- [x] Did work ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('propose'));
    const note = readDailyNote('2026-03-10');
    assert.ok(note.includes('key:plans/orphan-plan'));
    assert.ok(note.includes('orphaned plan'));
  });

  it('skips plans with project field', () => {
    writePlan('linked-plan.md', `---
status: active
project: "[[projects/foo]]"
---

# Linked Plan

## Changelog
- [x] Done ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWork('tick', '--verbose', '--date=2026-03-10');
    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('key:plans/linked-plan'));
  });

  it('skips plans with open items', () => {
    writePlan('open-plan.md', `---
status: active
---

# Open Plan

## Changelog
- [ ] Still working
- [x] Done ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    runWork('tick', '--verbose', '--date=2026-03-10');
    const note = readDailyNote('2026-03-10');
    assert.ok(!note.includes('key:plans/open-plan'));
  });
});

describe('tick dequeues plan items', () => {
  it('archives checked plan items', () => {
    writePlan('to-archive.md', `---
status: active
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
      '- [x] To Archive — orphaned plan <!-- key:plans/to-archive -->',
    ].join('\n'));

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('archived plan: to-archive'));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'plans', 'to-archive.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'to-archive.md')));
  });

  it('dequeues both project and plan items', () => {
    writeProject('proj.md', `---
status: completed
---

# Proj

## Changelog
- [x] Done ✅ 2026-03-01`);

    writePlan('plan.md', `---
status: active
---

# Plan

## Changelog
- [x] Done ✅ 2026-03-01`);

    writeDailyNote('2026-03-10', [
      '## Tasks',
      '',
      '## Log',
      '',
      '## Archive',
      '- [x] [[projects/proj|Proj]] — completed 2026-03-01 <!-- key:projects/proj -->',
      '- [x] Plan — orphaned plan <!-- key:plans/plan -->',
    ].join('\n'));

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('archived project: proj'));
    assert.ok(output.includes('archived plan: plan'));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'projects', 'proj.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'archive', 'plan.md')));
  });

  it('skips unknown key prefix without throwing', () => {
    writeDailyNote('2026-03-10', [
      '## Tasks',
      '',
      '## Log',
      '',
      '## Archive',
      '- [x] Mystery item <!-- key:unknown/thing -->',
    ].join('\n'));

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(output.includes('unknown archive key'));
  });
});

describe('tick writes weekly summary', () => {
  it('spawns claude for weekly summary when weekly file missing', () => {
    writeProject('proj.md', `---
status: active
---

# Weekly Project

## Tasks

## Changelog
- [x] Weekly work ✅ 2026-03-10

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    const weeklyDir = path.join(tmpDir, 'weekly');
    const outputPath = path.join(weeklyDir, '2026-W11.md');
    const stdinFile = path.join(tmpDir, 'claude-stdin.txt');
    const fakeClaude = path.join(tmpDir, 'fake-claude.js');
    fs.writeFileSync(fakeClaude, [
      '#!/usr/bin/env node',
      `const fs = require('fs');`,
      `let stdin = '';`,
      `process.stdin.setEncoding('utf-8');`,
      `process.stdin.on('data', d => stdin += d);`,
      `process.stdin.on('end', () => {`,
      `  fs.writeFileSync(${JSON.stringify(stdinFile)}, stdin);`,
      `  fs.mkdirSync(${JSON.stringify(weeklyDir)}, { recursive: true });`,
      `  fs.writeFileSync(${JSON.stringify(outputPath)}, '# 2026-W11 Work Summary\\n\\nNarrative.');`,
      `});`,
    ].join('\n'), { mode: 0o755 });

    const output = runWorkEnv(
      { WORK_CLAUDE_CMD: fakeClaude },
      'tick', '--verbose', '--date=2026-03-10'
    );
    assert.ok(output.includes('weekly summary'));
    assert.ok(fs.existsSync(outputPath));
    const stdin = fs.readFileSync(stdinFile, 'utf-8');
    assert.ok(stdin.includes('Weekly Project'));
    assert.ok(stdin.includes('Weekly work'));
  });

  it('skips weekly summary when weekly file already exists', () => {
    writeProject('proj.md', `---
status: active
---

# Project

## Tasks

## Changelog
- [x] Work ✅ 2026-03-10

## Notes`);

    writeDailyNote('2026-03-10', '## Tasks\n\n## Log\n');

    // 2026-03-10 is in ISO week 2026-W11
    fs.mkdirSync(path.join(tmpDir, 'weekly'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'weekly', '2026-W11.md'), '# Already done');

    const output = runWork('tick', '--verbose', '--date=2026-03-10');
    assert.ok(!output.includes('weekly summary'));
  });
});