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
  var samples = oddPassword.generateMany(3000);

  it('permits an all-letter block', function () {
    var found = samples.filter(function (pw) {
      return h.upperBlocksOf(pw).some(function (b) { return /^[A-Z]+$/.test(b); });
    });
    assert.ok(found.length > 0, 'never produced an all-letter block in 3000 draws');
  });

  it('permits an all-digit block', function () {
    var found = samples.filter(function (pw) {
      return h.upperBlocksOf(pw).some(function (b) { return /^[0-9]+$/.test(b); });
    });
    assert.ok(found.length > 0, 'never produced an all-digit block in 3000 draws');
  });

  it('is fully determined by the rng', function () {
    assert.strictEqual(
      oddPassword.generate({ rng: h.cyclingRng([0, 26]) }),
      '[A0A0-a6-A0A0-A0A0-A0A0]'
    );
  });
});

describe('letter-and-digit guarantee', function () {
  // The odd block always supplies a lowercase letter and a digit, but the
  // uppercase run can come out all letters — (26/36)^16 at the defaults, and
  // far likelier for short blocks. Consumers requiring a capital and a digit
  // would break on those, so the generator must never emit one.
  function assertBothClasses(pw, label) {
    var joined = h.upperBlocksOf(pw).join('');
    assert.match(joined, /[A-Z]/, label + ' has no capital in its blocks: ' + pw);
    assert.match(joined, /[0-9]/, label + ' has no digit in its blocks: ' + pw);
  }

  it('holds at the defaults', function () {
    oddPassword.generateMany(3000).forEach(function (pw) {
      assertBothClasses(pw, 'default');
    });
  });

  it('holds for the configurations where a miss is likeliest', function () {
    // 3 blocks of 1 character misses roughly 40% of the time unguarded.
    [{ blocks: 3, blockLength: 1 },
     { blocks: 3, blockLength: 2 },
     { blocks: 4, blockLength: 1 },
     { blocks: 3, blockLength: 4 }].forEach(function (opts) {
      oddPassword.generateMany(2000, opts).forEach(function (pw) {
        assertBothClasses(pw, JSON.stringify(opts));
      });
    });
  });

  it('still allows a single block to be all letters or all digits', function () {
    var pw = oddPassword.generate({ rng: h.cyclingRng([0, 26]) });
    assert.ok(/A0A0/.test(pw), 'blocks stay unconstrained individually: ' + pw);
  });

  it('is enforced by the validator too', function () {
    assert.strictEqual(oddPassword.validate('[AAAA-BBBB-CCCC-4d-DDDD]').valid, false);
    assert.strictEqual(oddPassword.validate('[1111-2222-3333-4d-4444]').valid, false);
    assert.ok(oddPassword.validate('[AAAA-BBBB-CCCC-4d-DDD1]').valid);
  });

  it('gives up loudly on an rng with no spread', function () {
    assert.throws(
      function () { oddPassword.generate({ rng: function () { return 0; } }); },
      /gave up after 1000 attempts/
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
