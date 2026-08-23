/*
 * Self-contained test suite. Run with: node test.js
 */
'use strict';

var oddPassword = require('./oddPassword.js');

var passed = 0;
var failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + name + (detail ? ' — ' + detail : ''));
  }
}

function throws(name, fn) {
  try {
    fn();
    check(name, false, 'expected a throw');
  } catch (e) {
    check(name, true);
  }
}

/* ---- shape ---- */

var PAIRS = { '[': ']', '{': '}', '<': '>', '(': ')' };

for (var i = 0; i < 2000; i++) {
  var pw = oddPassword.generate();
  var v = oddPassword.validate(pw);
  check('default password validates', v.valid, pw + ' — ' + v.reason);
  check('default has 4 blocks', v.blocks === 4, pw);
  check('default block length 4', v.blockLength === 4, pw);
  check('brackets match', PAIRS[pw.charAt(0)] === pw.charAt(pw.length - 1), pw);

  var body = pw.slice(1, -1).split('-');
  check('5 parts total', body.length === 5, pw);

  var lowerBlocks = body.filter(function (b) { return /[a-z]/.test(b); });
  check('exactly one lowercase block', lowerBlocks.length === 1, pw);
  check('odd block is letter+digit', /^(?:[a-z][0-9]|[0-9][a-z])$/.test(lowerBlocks[0]), pw);

  body.forEach(function (b) {
    if (b === lowerBlocks[0]) return;
    check('upper block charset', /^[A-Z0-9]{4}$/.test(b), pw + ' block ' + b);
  });
}

/* ---- configuration ---- */

[3, 4, 5, 9].forEach(function (n) {
  var p = oddPassword.generate({ blocks: n });
  var r = oddPassword.validate(p, { blocks: n });
  check('blocks=' + n, r.valid && r.blocks === n, p + ' — ' + r.reason);
});

[1, 2, 4, 7].forEach(function (len) {
  var p = oddPassword.generate({ blockLength: len });
  var r = oddPassword.validate(p, { blockLength: len });
  check('blockLength=' + len, r.valid && r.blockLength === len, p + ' — ' + r.reason);
});

['[]', '{}', '<>', '()', 'square', 'curly', 'angle', 'round'].forEach(function (b) {
  var p = oddPassword.generate({ brackets: b });
  check('brackets=' + b, oddPassword.validate(p, { brackets: b }).valid, p);
});

check('oddBlockPosition first',
  oddPassword.validate(oddPassword.generate({ oddBlockPosition: 'first' })).oddBlockIndex === 0);
check('oddBlockPosition last',
  oddPassword.validate(oddPassword.generate({ oddBlockPosition: 'last' })).oddBlockIndex === 4);
check('oddBlockPosition 2',
  oddPassword.validate(oddPassword.generate({ oddBlockPosition: 2 })).oddBlockIndex === 2);

check('custom separator',
  /^\[[A-Z0-9]{4}(?:_[A-Z0-9a-z]+){4}\]$/
    .test(oddPassword.generate({ brackets: '[]', separator: '_', oddBlockPosition: 'last' })));

check('generateMany count', oddPassword.generateMany(25).length === 25);
check('generateMany zero', oddPassword.generateMany(0).length === 0);

check('injected rng is used',
  oddPassword.generate({ rng: function () { return 0; } }) === '[a0-AAAA-AAAA-AAAA-AAAA]');

/* ---- rejected options ---- */

throws('blocks below minimum', function () { oddPassword.generate({ blocks: 2 }); });
throws('non-integer blocks', function () { oddPassword.generate({ blocks: 4.5 }); });
throws('string blocks', function () { oddPassword.generate({ blocks: '4' }); });
throws('blockLength 0', function () { oddPassword.generate({ blockLength: 0 }); });
throws('unknown brackets', function () { oddPassword.generate({ brackets: '||' }); });
throws('out-of-range position', function () { oddPassword.generate({ oddBlockPosition: 99 }); });
throws('empty separator', function () { oddPassword.generate({ separator: '' }); });
throws('bad rng', function () { oddPassword.generate({ rng: 'nope' }); });
throws('negative count', function () { oddPassword.generateMany(-1); });

/* ---- validator rejections ---- */

[
  ['unterminated', '[AAA1-BBB2-333C-4d'],
  ['mismatched pair', '[AAA1-BBB2-333C-4d-5F5F)'],
  ['no brackets', 'AAA1-BBB2-333C-4d-5F5F'],
  ['two odd blocks', '[AAA1-BBB2-4d-5F5F-3g]'],
  ['no odd block', '[AAA1-BBB2-333C-5F5F]'],
  ['illegal character', '[AAA1-BB!2-333C-4d-5F5F]'],
  ['too few blocks', '[AAA1-BBB2-4d]'],
  ['ragged block lengths', '[AAA1-BBB22-333C-4d]'],
  ['two lowercase letters', '[AAA1-BBB2-333C-ab-5F5F]'],
  ['two digits in odd block', '[AAA1-BBB2-333C-5F5F-12]'],
  ['not a string', 42]
].forEach(function (pair) {
  check('rejects ' + pair[0], oddPassword.validate(pair[1]).valid === false, String(pair[1]));
});

/* ---- distribution: no modulo bias, every symbol reachable ---- */

var seen = {};
var brackets = {};
var positions = {};
var SAMPLES = 20000;
for (var s = 0; s < SAMPLES; s++) {
  var p2 = oddPassword.generate();
  brackets[p2.charAt(0)] = (brackets[p2.charAt(0)] || 0) + 1;
  positions[oddPassword.validate(p2).oddBlockIndex] = 1;
  p2.slice(1, -1).split('-').forEach(function (b) {
    for (var c = 0; c < b.length; c++) seen[b.charAt(c)] = (seen[b.charAt(c)] || 0) + 1;
  });
}
check('all 26 uppercase + 10 digits + 26 lowercase appear',
  Object.keys(seen).length === 62, Object.keys(seen).length + ' distinct chars');
check('all four bracket sets appear', Object.keys(brackets).length === 4);
check('all five odd-block slots appear', Object.keys(positions).length === 5);

var expected = SAMPLES / 4;
Object.keys(brackets).forEach(function (b) {
  check('bracket ' + b + ' within 10% of uniform',
    Math.abs(brackets[b] - expected) < expected * 0.1, String(brackets[b]));
});

var upperCounts = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(function (c) { return seen[c] || 0; });
var expectedUpper = SAMPLES * 4 * 4 / 36;
check('uppercase letters within 10% of uniform',
  Math.min.apply(null, upperCounts) > expectedUpper * 0.9 &&
  Math.max.apply(null, upperCounts) < expectedUpper * 1.1,
  Math.min.apply(null, upperCounts) + '..' + Math.max.apply(null, upperCounts) +
  ' expected ~' + Math.round(expectedUpper));

/* ---- entropy ---- */

check('entropy of defaults ~96 bits',
  Math.abs(oddPassword.entropyBits() - 96.1) < 0.5, String(oddPassword.entropyBits()));
check('more blocks means more entropy',
  oddPassword.entropyBits({ blocks: 6 }) > oddPassword.entropyBits({ blocks: 4 }));

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
