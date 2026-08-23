/*
 * Spec conformance: the shape the generator is contractually required to emit.
 *   [AAA1-BBB2-333C-4d-5F5F]
 */
'use strict';

var { describe, it } = require('node:test');
var assert = require('node:assert');

var oddPassword = require('../oddPassword.js');
var h = require('./helpers.js');

describe('default output shape', function () {
  var samples = oddPassword.generateMany(500);

  it('is wrapped in a matched bracket pair', function () {
    samples.forEach(function (pw) {
      var p = h.parse(pw);
      assert.ok(
        Object.prototype.hasOwnProperty.call(h.PAIRS, p.open),
        'opens with a known bracket: ' + pw
      );
      assert.strictEqual(p.close, h.PAIRS[p.open], 'closing bracket matches: ' + pw);
    });
  });

  it('never emits a mismatched pair', function () {
    var allowed = ['[]', '{}', '<>', '()'];
    samples.forEach(function (pw) {
      var pair = pw.charAt(0) + pw.charAt(pw.length - 1);
      assert.ok(allowed.indexOf(pair) !== -1, 'unexpected pair ' + pair + ' in ' + pw);
    });
  });

  it('has 4 uppercase blocks plus 1 odd block, hyphen separated', function () {
    samples.forEach(function (pw) {
      assert.strictEqual(h.parse(pw).blocks.length, 5, pw);
    });
  });

  it('uppercase blocks are 4 chars of A-Z and 0-9 only', function () {
    samples.forEach(function (pw) {
      var blocks = h.parse(pw).blocks;
      var odd = h.oddBlockOf(blocks);
      blocks.forEach(function (b) {
        if (b === odd) return;
        assert.match(b, /^[A-Z0-9]{4}$/, pw + ' -> block "' + b + '"');
      });
    });
  });

  it('contains exactly one odd block', function () {
    samples.forEach(function (pw) {
      var lower = h.parse(pw).blocks.filter(function (b) { return /[a-z]/.test(b); });
      assert.strictEqual(lower.length, 1, pw);
    });
  });

  it('the odd block is exactly one lowercase letter and one digit', function () {
    samples.forEach(function (pw) {
      var odd = h.oddBlockOf(h.parse(pw).blocks);
      assert.match(odd, /^(?:[a-z][0-9]|[0-9][a-z])$/, pw + ' -> odd block "' + odd + '"');
    });
  });

  it('has no whitespace, punctuation or symbols beyond the brackets', function () {
    samples.forEach(function (pw) {
      assert.match(pw, /^[[{<(][A-Za-z0-9-]+[\]}>)]$/, pw);
    });
  });

  it('matches the shape of the documented example', function () {
    var example = '[AAA1-BBB2-333C-4d-5F5F]';
    var shape = function (s) {
      return h.parse(s).blocks.map(function (b) { return b.length; }).join(',');
    };
    samples.forEach(function (pw) {
      assert.strictEqual(
        shape(pw).split(',').sort().join(','),
        shape(example).split(',').sort().join(','),
        pw
      );
    });
  });
});

describe('odd block placement and ordering', function () {
  it('produces both letter-first and digit-first odd blocks', function () {
    var orders = h.countBy(oddPassword.generateMany(400).map(function (pw) {
      return /^[a-z]/.test(h.oddBlockOf(h.parse(pw).blocks)) ? 'letter-first' : 'digit-first';
    }));
    assert.ok(orders['letter-first'] > 0, 'produced a letter-first odd block');
    assert.ok(orders['digit-first'] > 0, 'produced a digit-first odd block');
  });

  it('reaches every slot, including first and last', function () {
    var slots = {};
    for (var i = 0; i < 500; i++) {
      slots[oddPassword.validate(oddPassword.generate()).oddBlockIndex] = true;
    }
    assert.deepStrictEqual(Object.keys(slots).sort(), ['0', '1', '2', '3', '4']);
  });
});

describe('uppercase block contents', function () {
  it('permits an all-letter block', function () {
    // Every pick lands on index 0 of its alphabet: 'A' / 'a' / '0'.
    var pw = oddPassword.generate({ rng: h.scriptedRng([0]) });
    assert.ok(/AAAA/.test(pw), pw);
  });

  it('permits an all-digit block', function () {
    // Index 26 of "A-Z0-9" is '0'.
    var pw = oddPassword.generate({ rng: h.scriptedRng([26]) });
    assert.ok(/0000/.test(pw), pw);
  });

  it('is fully determined by the rng', function () {
    assert.strictEqual(
      oddPassword.generate({ rng: h.scriptedRng([0]) }),
      '[a0-AAAA-AAAA-AAAA-AAAA]'
    );
  });
});

describe('bulk properties', function () {
  it('does not collide across 5000 draws', function () {
    var many = oddPassword.generateMany(5000);
    assert.strictEqual(Object.keys(h.countBy(many)).length, many.length);
  });

  it('satisfies its own validator every time', function () {
    for (var i = 0; i < 2000; i++) {
      var pw = oddPassword.generate();
      var result = oddPassword.validate(pw);
      assert.ok(result.valid, pw + ' -> ' + result.reason);
    }
  });
});
