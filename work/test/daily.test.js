const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseStatusArg } = require('../lib/daily.js');

describe('parseStatusArg', () => {
  it('accepts bracketed [x]', () => {
    assert.equal(parseStatusArg('[x]'), 'x');
  });

  it('accepts bracketed [/]', () => {
    assert.equal(parseStatusArg('[/]'), '/');
  });

  it('accepts bracketed [ ]', () => {
    assert.equal(parseStatusArg('[ ]'), ' ');
  });

  it('accepts bare x', () => {
    assert.equal(parseStatusArg('x'), 'x');
  });

  it('accepts bare /', () => {
    assert.equal(parseStatusArg('/'), '/');
  });

  it('accepts bare space', () => {
    assert.equal(parseStatusArg(' '), ' ');
  });

  it('rejects invalid input', () => {
    assert.throws(() => parseStatusArg('done'), /invalid status/);
  });

  it('rejects multi-char input', () => {
    assert.throws(() => parseStatusArg('xx'), /invalid status/);
  });
});