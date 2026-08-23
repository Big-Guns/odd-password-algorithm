/*
 * Every configurable option, including the values that must be rejected.
 */
'use strict';

var { describe, it } = require('node:test');
var assert = require('node:assert');

var oddPassword = require('../oddPassword.js');
var h = require('./helpers.js');

describe('blocks', function () {
  it('defaults to 4', function () {
    assert.strictEqual(oddPassword.defaults.blocks, 4);
    assert.strictEqual(oddPassword.validate(oddPassword.generate()).blocks, 4);
  });

  it('accepts the documented minimum of 3', function () {
    assert.strictEqual(oddPassword.MIN_BLOCKS, 3);
    var result = oddPassword.validate(oddPassword.generate({ blocks: 3 }), { blocks: 3 });
    assert.ok(result.valid, result.reason);
    assert.strictEqual(result.blocks, 3);
  });

  it('honours larger counts', function () {
    [5, 6, 8, 12, 32].forEach(function (n) {
      var pw = oddPassword.generate({ blocks: n });
      var result = oddPassword.validate(pw, { blocks: n });
      assert.ok(result.valid, pw + ' -> ' + result.reason);
      assert.strictEqual(result.blocks, n, pw);
      assert.strictEqual(h.parse(pw).blocks.length, n + 1, pw);
    });
  });

  it('rejects fewer than 3 blocks', function () {
    [2, 1, 0, -1].forEach(function (n) {
      assert.throws(
        function () { oddPassword.generate({ blocks: n }); },
        RangeError,
        'blocks: ' + n
      );
    });
  });

  it('names the offending option when rejecting', function () {
    assert.throws(function () { oddPassword.generate({ blocks: 2 }); }, /blocks must be at least 3/);
  });

  it('rejects non-integers rather than rounding them', function () {
    [4.5, NaN, Infinity, '4', null, {}, []].forEach(function (bad) {
      assert.throws(
        function () { oddPassword.generate({ blocks: bad }); },
        'accepted blocks: ' + String(bad)
      );
    });
  });
});

describe('blockLength', function () {
  it('defaults to 4', function () {
    assert.strictEqual(oddPassword.defaults.blockLength, 4);
    assert.strictEqual(oddPassword.validate(oddPassword.generate()).blockLength, 4);
  });

  it('honours other lengths', function () {
    [1, 2, 3, 5, 8, 16].forEach(function (len) {
      var pw = oddPassword.generate({ blockLength: len });
      var result = oddPassword.validate(pw, { blockLength: len });
      assert.ok(result.valid, pw + ' -> ' + result.reason);
      assert.strictEqual(result.blockLength, len, pw);
    });
  });

  it('rejects lengths below 1', function () {
    [0, -3].forEach(function (len) {
      assert.throws(function () { oddPassword.generate({ blockLength: len }); }, RangeError);
    });
  });

  it('rejects non-integers', function () {
    [2.5, '4', null, NaN].forEach(function (bad) {
      assert.throws(function () { oddPassword.generate({ blockLength: bad }); });
    });
  });
});

describe('brackets', function () {
  it('defaults to a random set', function () {
    assert.strictEqual(oddPassword.defaults.brackets, 'random');
    var seen = {};
    for (var i = 0; i < 400; i++) seen[oddPassword.generate().charAt(0)] = true;
    assert.deepStrictEqual(Object.keys(seen).sort(), ['(', '<', '[', '{']);
  });

  it('accepts the pair itself', function () {
    var cases = { '[]': ['[', ']'], '{}': ['{', '}'], '<>': ['<', '>'], '()': ['(', ')'] };
    Object.keys(cases).forEach(function (pair) {
      var pw = oddPassword.generate({ brackets: pair });
      assert.strictEqual(pw.charAt(0), cases[pair][0], pw);
      assert.strictEqual(pw.charAt(pw.length - 1), cases[pair][1], pw);
    });
  });

  it('accepts the named form', function () {
    var cases = { square: '[', curly: '{', angle: '<', round: '(' };
    Object.keys(cases).forEach(function (name) {
      assert.strictEqual(oddPassword.generate({ brackets: name }).charAt(0), cases[name], name);
    });
  });

  it('accepts names case-insensitively', function () {
    assert.strictEqual(oddPassword.generate({ brackets: 'CURLY' }).charAt(0), '{');
    assert.strictEqual(oddPassword.generate({ brackets: 'Angle' }).charAt(0), '<');
  });

  it('pins the pair across many draws', function () {
    oddPassword.generateMany(200, { brackets: '<>' }).forEach(function (pw) {
      assert.strictEqual(pw.charAt(0) + pw.charAt(pw.length - 1), '<>', pw);
    });
  });

  it('rejects unknown or mismatched pairs', function () {
    ['||', '[}', '<]', 'squiggly', '', '[', 5, null].forEach(function (bad) {
      assert.throws(
        function () { oddPassword.generate({ brackets: bad }); },
        'accepted brackets: ' + String(bad)
      );
    });
  });

  it('lists the valid choices in the error message', function () {
    assert.throws(
      function () { oddPassword.generate({ brackets: '||' }); },
      /square, curly, angle, round/
    );
  });
});

describe('oddBlockPosition', function () {
  it('defaults to a random slot', function () {
    assert.strictEqual(oddPassword.defaults.oddBlockPosition, 'random');
  });

  it('supports "first" and "last"', function () {
    for (var i = 0; i < 50; i++) {
      assert.strictEqual(
        oddPassword.validate(oddPassword.generate({ oddBlockPosition: 'first' })).oddBlockIndex,
        0
      );
      assert.strictEqual(
        oddPassword.validate(oddPassword.generate({ oddBlockPosition: 'last' })).oddBlockIndex,
        4
      );
    }
  });

  it('supports an explicit index', function () {
    [0, 1, 2, 3, 4].forEach(function (index) {
      var pw = oddPassword.generate({ oddBlockPosition: index });
      assert.strictEqual(oddPassword.validate(pw).oddBlockIndex, index, pw);
    });
  });

  it('scales the valid index range with the block count', function () {
    var pw = oddPassword.generate({ blocks: 8, oddBlockPosition: 8 });
    assert.strictEqual(oddPassword.validate(pw).oddBlockIndex, 8, pw);
    assert.throws(function () {
      oddPassword.generate({ blocks: 8, oddBlockPosition: 9 });
    }, RangeError);
  });

  it('rejects out-of-range and non-integer positions', function () {
    [5, 99, -1, 1.5, '2', null].forEach(function (bad) {
      assert.throws(
        function () { oddPassword.generate({ oddBlockPosition: bad }); },
        'accepted position: ' + String(bad)
      );
    });
  });

  it('reports the permitted range when rejecting', function () {
    assert.throws(function () { oddPassword.generate({ oddBlockPosition: 9 }); }, /range 0\.\.4/);
  });
});

describe('separator', function () {
  it('defaults to a hyphen', function () {
    assert.strictEqual(oddPassword.defaults.separator, '-');
  });

  it('honours a custom separator', function () {
    var pw = oddPassword.generate({ brackets: '[]', separator: '_', oddBlockPosition: 'last' });
    assert.match(pw, /^\[[A-Z0-9]{4}(?:_[A-Z0-9a-z]+){4}\]$/, pw);
    assert.strictEqual(pw.indexOf('-'), -1, pw);
  });

  it('validates against the same separator', function () {
    var opts = { separator: '::' };
    var result = oddPassword.validate(oddPassword.generate(opts), opts);
    assert.ok(result.valid, result.reason);
  });

  it('rejects an empty or non-string separator', function () {
    ['', 5, null].forEach(function (bad) {
      assert.throws(function () { oddPassword.generate({ separator: bad }); });
    });
  });
});

describe('rng injection', function () {
  it('uses the supplied function instead of the CSPRNG', function () {
    var calls = [];
    oddPassword.generate({
      rng: function (max) { calls.push(max); return 0; }
    });
    assert.ok(calls.length > 0, 'rng was called');
    assert.ok(calls.indexOf(4) !== -1, 'asked for a bracket set (max 4)');
    assert.ok(calls.indexOf(36) !== -1, 'asked for an uppercase alphanumeric (max 36)');
    assert.ok(calls.indexOf(26) !== -1, 'asked for a lowercase letter (max 26)');
    assert.ok(calls.indexOf(10) !== -1, 'asked for a digit (max 10)');
    assert.ok(calls.indexOf(2) !== -1, 'asked for the odd-block order (max 2)');
  });

  it('never asks for a value outside [0, max)', function () {
    oddPassword.generate({
      rng: function (max) {
        assert.ok(Number.isInteger(max) && max > 0 && max <= 256, 'max: ' + max);
        return max - 1;
      }
    });
  });

  it('is deterministic for a deterministic rng', function () {
    var a = oddPassword.generate({ rng: h.scriptedRng([1, 2, 3, 4, 5]) });
    var b = oddPassword.generate({ rng: h.scriptedRng([1, 2, 3, 4, 5]) });
    assert.strictEqual(a, b);
  });

  it('rejects a non-function rng', function () {
    ['nope', 5, {}].forEach(function (bad) {
      assert.throws(function () { oddPassword.generate({ rng: bad }); }, TypeError);
    });
  });
});

describe('option handling in general', function () {
  it('treats undefined values as absent', function () {
    var pw = oddPassword.generate({ blocks: undefined, brackets: undefined });
    assert.ok(oddPassword.validate(pw).valid, pw);
  });

  it('accepts no argument at all', function () {
    assert.ok(oddPassword.validate(oddPassword.generate()).valid);
    assert.ok(oddPassword.validate(oddPassword.generate(null)).valid);
  });

  it('does not mutate the caller\'s options object', function () {
    var opts = { blocks: 5 };
    var snapshot = JSON.stringify(opts);
    oddPassword.generate(opts);
    assert.strictEqual(JSON.stringify(opts), snapshot);
  });

  it('does not let callers mutate shared state through defaults', function () {
    var before = oddPassword.defaults.blocks;
    oddPassword.generate({ blocks: 7 });
    assert.strictEqual(oddPassword.defaults.blocks, before);
  });

  it('ignores unknown options', function () {
    assert.ok(oddPassword.validate(oddPassword.generate({ nonsense: true })).valid);
  });

  it('combines options without interference', function () {
    var opts = { blocks: 6, blockLength: 3, brackets: '{}', oddBlockPosition: 'last' };
    var pw = oddPassword.generate(opts);
    assert.match(pw, /^\{[A-Z0-9]{3}(?:-[A-Z0-9]{3}){5}-(?:[a-z][0-9]|[0-9][a-z])\}$/, pw);
    assert.ok(oddPassword.validate(pw, opts).valid);
  });
});

describe('generateMany', function () {
  it('returns the requested count', function () {
    [0, 1, 25, 100].forEach(function (n) {
      assert.strictEqual(oddPassword.generateMany(n).length, n);
    });
  });

  it('passes options through to each password', function () {
    oddPassword.generateMany(50, { blocks: 3, brackets: '()' }).forEach(function (pw) {
      var result = oddPassword.validate(pw, { blocks: 3, brackets: '()' });
      assert.ok(result.valid, pw + ' -> ' + result.reason);
    });
  });

  it('rejects a negative or non-integer count', function () {
    [-1, 1.5, '5', null, undefined].forEach(function (bad) {
      assert.throws(function () { oddPassword.generateMany(bad); }, TypeError);
    });
  });

  it('propagates invalid options', function () {
    assert.throws(function () { oddPassword.generateMany(3, { blocks: 1 }); }, RangeError);
  });
});
