const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { checkOff } = require('../lib/changelog.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkOff', () => {
  it('checks off an existing open item', () => {
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Fix the bug\n- [ ] Add tests\n\n## Notes');
    checkOff(f, 'Fix the bug', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] Fix the bug ✅ 2026-03-05'));
    assert.ok(result.includes('- [ ] Add tests'));
  });

  it('appends if no matching item', () => {
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Existing item\n\n## Notes');
    checkOff(f, 'New work', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] New work ✅ 2026-03-05'));
    assert.ok(result.includes('- [ ] Existing item'));
  });

  it('matches by substring', () => {
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Changelog\n- [ ] Implement feature X with tests\n\n## Notes');
    checkOff(f, 'feature X', '2026-03-05');
    const result = fs.readFileSync(f, 'utf-8');
    assert.ok(result.includes('- [x] Implement feature X with tests ✅ 2026-03-05'));
  });

  it('throws on missing file', () => {
    assert.throws(() => checkOff('/nonexistent/path.md', 'desc', '2026-01-01'), /file not found/);
  });

  it('throws on missing changelog section', () => {
    const f = path.join(tmpDir, 'test.md');
    fs.writeFileSync(f, '# Plan\n\n## Notes');
    assert.throws(() => checkOff(f, 'desc', '2026-01-01'), /no ## Changelog section/);
  });
});