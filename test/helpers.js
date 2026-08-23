'use strict';

var path = require('node:path');

var MODULE_PATH = path.join(__dirname, '..', 'oddPassword.js');
var PAGE_PATH = path.join(__dirname, '..', 'test.html');

var PAIRS = { '[': ']', '{': '}', '<': '>', '(': ')' };
var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var DIGITS = '0123456789';
var LOWER = 'abcdefghijklmnopqrstuvwxyz';

/** Split a password into its bracket pair and blocks. */
function parse(password, separator) {
  return {
    open: password.charAt(0),
    close: password.charAt(password.length - 1),
    blocks: password.slice(1, -1).split(separator || '-')
  };
}

/** The single lowercase-bearing block, or null if there isn't exactly one. */
function oddBlockOf(blocks) {
  var found = blocks.filter(function (b) { return /[a-z]/.test(b); });
  return found.length === 1 ? found[0] : null;
}

/**
 * A deterministic stand-in for the CSPRNG: replays `values` (mod max) and then
 * repeats the last one. Lets a test pin down exactly which choice maps to what.
 */
function scriptedRng(values) {
  var i = 0;
  return function (max) {
    var v = values[Math.min(i, values.length - 1)];
    i++;
    return v % max;
  };
}

/**
 * Chi-square goodness-of-fit against a uniform expectation.
 * Returns the statistic; compare it to CHI2_001[df].
 */
function chiSquare(counts, expected) {
  return counts.reduce(function (sum, observed) {
    var d = observed - expected;
    return sum + (d * d) / expected;
  }, 0);
}

/**
 * Upper-tail chi-square critical values at p = 0.001, keyed by degrees of
 * freedom. A correct generator exceeds these once in a thousand runs, which
 * keeps these statistical tests effectively non-flaky.
 */
var CHI2_001 = {
  1: 10.828,
  3: 16.266,
  4: 18.467,
  9: 27.877,
  25: 52.620,
  35: 66.619,
  61: 99.607
};

function countBy(items) {
  var counts = {};
  items.forEach(function (item) {
    counts[item] = (counts[item] || 0) + 1;
  });
  return counts;
}

module.exports = {
  MODULE_PATH: MODULE_PATH,
  PAGE_PATH: PAGE_PATH,
  PAIRS: PAIRS,
  UPPER: UPPER,
  DIGITS: DIGITS,
  LOWER: LOWER,
  parse: parse,
  oddBlockOf: oddBlockOf,
  scriptedRng: scriptedRng,
  chiSquare: chiSquare,
  CHI2_001: CHI2_001,
  countBy: countBy
};

/* --- loading the module the way a browser or AMD loader would --- */

var fs = require('node:fs');
var vm = require('node:vm');

var SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

/**
 * Evaluate oddPassword.js inside a fresh V8 context containing only the globals
 * given. A bare context has no `module`, `define`, `require` or `crypto`, so
 * this exercises the plain <script>-tag path — and, without a `crypto` global,
 * the no-CSPRNG failure path.
 */
function loadInContext(globals) {
  var sandbox = Object.assign({}, globals || {});
  vm.createContext(sandbox);
  sandbox.self = sandbox;
  vm.runInContext(SOURCE, sandbox, { filename: 'oddPassword.js' });
  return sandbox;
}

/** A WebCrypto stand-in that hands out bytes from a fixed queue. */
function scriptedCrypto(bytes) {
  var queue = bytes.slice();
  var served = [];
  return {
    served: served,
    remaining: function () { return queue.length; },
    getRandomValues: function (buf) {
      for (var i = 0; i < buf.length; i++) {
        if (!queue.length) throw new Error('scriptedCrypto: ran out of bytes');
        var byte = queue.shift();
        served.push(byte);
        buf[i] = byte;
      }
      return buf;
    }
  };
}

module.exports.SOURCE = SOURCE;
module.exports.loadInContext = loadInContext;
module.exports.scriptedCrypto = scriptedCrypto;

/**
 * Like scriptedRng, but cycles through `values` forever instead of sticking on
 * the last one — a stand-in rng that keeps a usable spread, which the
 * letter-and-digit rule requires.
 */
function cyclingRng(values) {
  var i = 0;
  return function (max) {
    return values[i++ % values.length] % max;
  };
}

/** The uppercase blocks of a password, i.e. everything but the odd block. */
function upperBlocksOf(password, separator) {
  var blocks = parse(password, separator).blocks;
  var odd = oddBlockOf(blocks);
  return blocks.filter(function (b) { return b !== odd; });
}

module.exports.cyclingRng = cyclingRng;
module.exports.upperBlocksOf = upperBlocksOf;
