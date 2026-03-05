const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractSection, findSectionLineRange, insertBeforeNextSection, insertAtEndOfSection, parseFrontmatter, getTitle } = require('../lib/markdown.js');

describe('extractSection', () => {
  it('extracts lines between headings', () => {
    const content = '## Queue\n- [ ] task1\n- [x] task2\n## Log\n- done';
    const result = extractSection(content, 'Queue');
    assert.deepEqual(result, ['- [ ] task1', '- [x] task2']);
  });

  it('returns empty for missing section', () => {
    const result = extractSection('## Other\nstuff', 'Queue');
    assert.deepEqual(result, []);
  });

  it('handles last section with no trailing heading', () => {
    const result = extractSection('## Queue\n- item1\n- item2', 'Queue');
    assert.deepEqual(result, ['- item1', '- item2']);
  });

  it('handles empty section', () => {
    const result = extractSection('## Queue\n## Log\n- done', 'Queue');
    assert.deepEqual(result, []);
  });

  it('preserves blank lines', () => {
    const result = extractSection('## Queue\n- a\n\n- b\n## Log', 'Queue');
    assert.deepEqual(result, ['- a', '', '- b']);
  });

  it('handles adjacent sections', () => {
    const content = '## A\na1\n## B\nb1\n## C\nc1';
    assert.deepEqual(extractSection(content, 'A'), ['a1']);
    assert.deepEqual(extractSection(content, 'B'), ['b1']);
    assert.deepEqual(extractSection(content, 'C'), ['c1']);
  });
});

describe('findSectionLineRange', () => {
  it('returns correct range', () => {
    const lines = ['## Queue', '- item', '## Log', '- done'];
    const range = findSectionLineRange(lines, 'Queue');
    assert.deepEqual(range, { start: 0, end: 2 });
  });

  it('returns null for missing section', () => {
    const range = findSectionLineRange(['## Other'], 'Queue');
    assert.equal(range, null);
  });
});

describe('insertBeforeNextSection', () => {
  it('inserts lines before next section', () => {
    const content = '## Queue\n\n## Log\n- done';
    const result = insertBeforeNextSection(content, 'Queue', ['- new item']);
    assert.equal(result, '## Queue\n\n- new item\n\n## Log\n- done');
  });
});

describe('insertAtEndOfSection', () => {
  it('inserts at end of section', () => {
    const content = '## Log\n- a\n## Queue\n- b';
    const result = insertAtEndOfSection(content, 'Log', ['- c']);
    assert.equal(result, '## Log\n- a\n- c\n## Queue\n- b');
  });
});

describe('parseFrontmatter', () => {
  it('parses key-value pairs', () => {
    const content = '---\nstatus: active\nproject: "[[projects/foo|Foo]]"\n---\n# Title';
    const fm = parseFrontmatter(content);
    assert.equal(fm.status, 'active');
    assert.equal(fm.project, '[[projects/foo|Foo]]');
  });

  it('returns empty for no frontmatter', () => {
    const fm = parseFrontmatter('# Title\nstuff');
    assert.deepEqual(fm, {});
  });

  it('returns empty for empty frontmatter', () => {
    const fm = parseFrontmatter('---\n---\n# Title');
    assert.deepEqual(fm, {});
  });
});

describe('getTitle', () => {
  it('extracts h1', () => {
    assert.equal(getTitle('---\nstatus: active\n---\n\n# My Title\n\nstuff'), 'My Title');
  });

  it('returns empty for no h1', () => {
    assert.equal(getTitle('no heading'), '');
  });
});