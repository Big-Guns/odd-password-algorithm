/*
 * Randomness quality: the distribution must be flat, the source must be a
 * CSPRNG, and the rejection sampling must actually reject.
 *
 * The chi-square checks compare against p = 1e-6 critical values (helpers.js
 * explains why that threshold and not the textbook 0.001), so a correct
 * generator effectively never trips them.
 */
'use strict';

var { describe, it } = require('node:test');
var assert = require('node:assert');

var oddPassword = require('../oddPassword.js');
var h = require('./helpers.js');

var SAMPLES = 20000;

// One pass over a large sample; every distribution test reads from it.
var corpus = (function () {
  var upper = {};
  var lower = {};
  var digitsInOdd = {};
  var brackets = {};
  var positions = {};
  var orders = { letterFirst: 0, digitFirst: 0 };

  for (var i = 0; i < SAMPLES; i++) {
    var pw = oddPassword.generate();
    var parsed = h.parse(pw);
    var odd = h.oddBlockOf(parsed.blocks);

    brackets[parsed.open] = (brackets[parsed.open] || 0) + 1;
    positions[parsed.blocks.indexOf(odd)] = (positions[parsed.blocks.indexOf(odd)] || 0) + 1;

    if (/^[a-z]/.test(odd)) orders.letterFirst++; else orders.digitFirst++;
    lower[odd.replace(/[0-9]/, '')] = (lower[odd.replace(/[0-9]/, '')] || 0) + 1;
    digitsInOdd[odd.replace(/[a-z]/, '')] = (digitsInOdd[odd.replace(/[a-z]/, '')] || 0) + 1;

    parsed.blocks.forEach(function (block) {
      if (block === odd) return;
      for (var c = 0; c < block.length; c++) {
        upper[block.charAt(c)] = (upper[block.charAt(c)] || 0) + 1;
      }
    });
  }

  return {
    upper: upper, lower: lower, digitsInOdd: digitsInOdd,
    brackets: brackets, positions: positions, orders: orders
  };
}());

/**
 * Filler bytes that alternate between a letter index and a digit index, so a
 * stubbed CSPRNG satisfies the letter-and-digit rule on its first draw.
 */
function spread(length) {
  var bytes = [];
  for (var i = 0; i < length; i++) bytes.push(i % 2 ? 26 : 0);
  return bytes;
}

function countsFor(alphabet, table) {
  return alphabet.split('').map(function (c) { return table[c] || 0; });
}

describe('character distribution', function () {
  it('reaches every symbol of the uppercase alphanumeric alphabet', function () {
    var alphabet = h.UPPER + h.DIGITS;
    countsFor(alphabet, corpus.upper).forEach(function (count, i) {
      assert.ok(count > 0, 'never produced "' + alphabet.charAt(i) + '"');
    });
    assert.strictEqual(Object.keys(corpus.upper).length, 36, 'no symbols outside the alphabet');
  });

  it('is uniform across the 36 uppercase alphanumerics', function () {
    var counts = countsFor(h.UPPER + h.DIGITS, corpus.upper);
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var chi2 = h.chiSquare(counts, total / 36);
    assert.ok(chi2 < h.CHI2_CRITICAL[35], 'chi-square ' + chi2.toFixed(2) + ' >= ' + h.CHI2_CRITICAL[35]);
  });

  it('reaches every lowercase letter, uniformly', function () {
    var counts = countsFor(h.LOWER, corpus.lower);
    counts.forEach(function (count, i) {
      assert.ok(count > 0, 'never produced "' + h.LOWER.charAt(i) + '"');
    });
    var chi2 = h.chiSquare(counts, SAMPLES / 26);
    assert.ok(chi2 < h.CHI2_CRITICAL[25], 'chi-square ' + chi2.toFixed(2));
  });

  it('reaches every digit in the odd block, uniformly', function () {
    var counts = countsFor(h.DIGITS, corpus.digitsInOdd);
    counts.forEach(function (count, i) {
      assert.ok(count > 0, 'never produced "' + h.DIGITS.charAt(i) + '"');
    });
    var chi2 = h.chiSquare(counts, SAMPLES / 10);
    assert.ok(chi2 < h.CHI2_CRITICAL[9], 'chi-square ' + chi2.toFixed(2));
  });

  it('never emits an uppercase letter where a lowercase one belongs', function () {
    Object.keys(corpus.lower).forEach(function (c) {
      assert.match(c, /^[a-z]$/, 'odd block letter: ' + c);
    });
  });
});

describe('structural distribution', function () {
  it('picks the four bracket sets uniformly', function () {
    var counts = ['[', '{', '<', '('].map(function (b) { return corpus.brackets[b] || 0; });
    counts.forEach(function (count, i) {
      assert.ok(count > 0, 'never used bracket ' + ['[', '{', '<', '('][i]);
    });
    var chi2 = h.chiSquare(counts, SAMPLES / 4);
    assert.ok(chi2 < h.CHI2_CRITICAL[3], 'chi-square ' + chi2.toFixed(2));
  });

  it('places the odd block uniformly across all five slots', function () {
    var counts = [0, 1, 2, 3, 4].map(function (i) { return corpus.positions[i] || 0; });
    counts.forEach(function (count, i) {
      assert.ok(count > 0, 'never used slot ' + i);
    });
    var chi2 = h.chiSquare(counts, SAMPLES / 5);
    assert.ok(chi2 < h.CHI2_CRITICAL[4], 'chi-square ' + chi2.toFixed(2));
  });

  it('balances letter-first and digit-first odd blocks', function () {
    var counts = [corpus.orders.letterFirst, corpus.orders.digitFirst];
    var chi2 = h.chiSquare(counts, SAMPLES / 2);
    assert.ok(chi2 < h.CHI2_CRITICAL[1], 'chi-square ' + chi2.toFixed(2));
  });
});

describe('entropy source', function () {
  it('does not use Math.random anywhere in the module', function () {
    assert.strictEqual(/Math\s*\.\s*random/.test(h.SOURCE), false);
  });

  it('draws from crypto.getRandomValues', function () {
    var stub = h.scriptedCrypto(spread(200));
    var sandbox = h.loadInContext({ crypto: stub });
    sandbox.oddPassword.generate();
    assert.ok(stub.served.length > 0, 'the CSPRNG was consulted');
  });

  it('throws instead of falling back when no CSPRNG exists', function () {
    var sandbox = h.loadInContext({});
    assert.throws(function () { sandbox.oddPassword.generate(); }, /no cryptographic RNG/);
  });

  it('points at options.rng when it throws', function () {
    var sandbox = h.loadInContext({});
    assert.throws(function () { sandbox.oddPassword.generate(); }, /options\.rng/);
  });

  it('still works without a CSPRNG when an rng is injected', function () {
    var sandbox = h.loadInContext({});
    var pw = sandbox.oddPassword.generate({ rng: h.cyclingRng([0, 26]) });
    assert.strictEqual(pw, '[A0A0-a6-A0A0-A0A0-A0A0]');
  });
});

describe('rejection sampling', function () {
  // For a 36-symbol alphabet the usable range is 0..251; bytes 252-255 must be
  // discarded rather than folded in, or A-D would come up more often than E-Z.
  //
  // Each script starts with the bracket byte and the odd-block slot byte, then
  // the bytes under test, then `spread()` filler — a flat run of one byte would
  // produce an all-letter block, which the letter-and-digit rule redraws.

  // The first uppercase character, with the odd block forced into slot 0.
  function firstUpperChar(pw) {
    return h.parse(pw).blocks[1].charAt(0);
  }

  function generateFrom(bytes) {
    var stub = h.scriptedCrypto(bytes.concat(spread(400)));
    var sandbox = h.loadInContext({ crypto: stub });
    return { password: sandbox.oddPassword.generate(), stub: stub };
  }

  it('discards bytes above the largest whole multiple of the alphabet size', function () {
    var run = generateFrom([0, 0, 253, 0]);
    assert.ok(run.stub.served.indexOf(253) !== -1, 'the out-of-range byte was drawn');
    assert.strictEqual(
      firstUpperChar(run.password), 'A',
      '253 was discarded rather than folded in: ' + run.password
    );
  });

  it('accepts the largest in-range byte', function () {
    // 251 % 36 === 35 -> the last symbol of "A-Z0-9", which is '9'.
    assert.strictEqual(firstUpperChar(generateFrom([0, 0, 251]).password), '9');
  });

  it('keeps drawing until it gets an in-range byte', function () {
    var run = generateFrom([0, 0, 255, 254, 253, 252, 1]);
    assert.strictEqual(
      firstUpperChar(run.password), 'B',
      'four rejections then index 1 -> "B": ' + run.password
    );
  });
});
