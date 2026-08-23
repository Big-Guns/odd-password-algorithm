/*
 * validate(): accepts what the generator emits, and gives a specific reason for
 * everything it turns down.
 */
'use strict';

var { describe, it } = require('node:test');
var assert = require('node:assert');

var oddPassword = require('../oddPassword.js');

function reasonFor(password, options) {
  var result = oddPassword.validate(password, options);
  assert.strictEqual(result.valid, false, 'expected rejection: ' + String(password));
  assert.strictEqual(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0, 'reason is non-empty');
  return result.reason;
}

describe('accepting valid passwords', function () {
  it('accepts the documented example', function () {
    assert.deepStrictEqual(oddPassword.validate('[AAA1-BBB2-333C-4d-5F5F]'), {
      valid: true,
      brackets: '[]',
      blocks: 4,
      blockLength: 4,
      oddBlockIndex: 3
    });
  });

  it('accepts every bracket set', function () {
    ['[AAA1-BBB2-333C-4d-5F5F]', '{AAA1-BBB2-333C-4d-5F5F}',
     '<AAA1-BBB2-333C-4d-5F5F>', '(AAA1-BBB2-333C-4d-5F5F)'].forEach(function (pw) {
      assert.ok(oddPassword.validate(pw).valid, pw);
    });
  });

  it('accepts both odd-block orders', function () {
    assert.ok(oddPassword.validate('[AAA1-BBB2-333C-4d-5F5F]').valid);
    assert.ok(oddPassword.validate('[AAA1-BBB2-333C-d4-5F5F]').valid);
  });

  it('accepts the odd block in any slot', function () {
    ['[4d-AAA1-BBB2-333C-5F5F]', '[AAA1-4d-BBB2-333C-5F5F]',
     '[AAA1-BBB2-333C-5F5F-4d]'].forEach(function (pw) {
      assert.ok(oddPassword.validate(pw).valid, pw);
    });
  });

  it('accepts all-letter and all-digit uppercase blocks', function () {
    assert.ok(oddPassword.validate('[DDDD-5555-ABCD-4d-1234]').valid);
  });

  it('reports where the odd block landed', function () {
    assert.strictEqual(oddPassword.validate('[4d-AAA1-BBB2-333C-5F5F]').oddBlockIndex, 0);
    assert.strictEqual(oddPassword.validate('[AAA1-BBB2-333C-5F5F-4d]').oddBlockIndex, 4);
  });

  it('reports the bracket set, block count and block length', function () {
    var result = oddPassword.validate('{AAAA5-BBBBB-CCCCC-DDDDD-EEEEE-4d}');
    assert.strictEqual(result.brackets, '{}');
    assert.strictEqual(result.blocks, 5);
    assert.strictEqual(result.blockLength, 5);
  });
});

describe('rejecting malformed passwords', function () {
  it('rejects non-strings', function () {
    [42, null, undefined, {}, [], true].forEach(function (bad) {
      assert.strictEqual(oddPassword.validate(bad).valid, false, String(bad));
    });
  });

  it('rejects empty and near-empty input', function () {
    ['', '[', '[]'].forEach(function (bad) {
      assert.strictEqual(oddPassword.validate(bad).valid, false, JSON.stringify(bad));
    });
  });

  it('rejects missing brackets', function () {
    assert.match(reasonFor('AAA1-BBB2-333C-4d-5F5F'), /start/i);
  });

  it('rejects an unterminated password', function () {
    assert.match(reasonFor('[AAA1-BBB2-333C-4d-5F5F'), /bracket/i);
  });

  it('rejects mismatched bracket pairs', function () {
    ['[AAA1-BBB2-333C-4d-5F5F}', '{AAA1-BBB2-333C-4d-5F5F>',
     '<AAA1-BBB2-333C-4d-5F5F)', '(AAA1-BBB2-333C-4d-5F5F]'].forEach(function (pw) {
      assert.match(reasonFor(pw), /mismatched/i, pw);
    });
  });

  it('rejects a missing odd block', function () {
    assert.match(reasonFor('[AAA1-BBB2-333C-5F5F]'), /missing/i);
  });

  it('rejects more than one odd block', function () {
    assert.match(reasonFor('[AAA1-BBB2-4d-5F5F-3g]'), /more than one/i);
  });

  it('rejects an odd block that is not one letter and one digit', function () {
    ['[AAA1-BBB2-333C-ab-5F5F]', '[AAA1-BBB2-333C-12-5F5F]',
     '[AAA1-BBB2-333C-a-5F5F]', '[AAA1-BBB2-333C-a1b-5F5F]'].forEach(function (pw) {
      assert.strictEqual(oddPassword.validate(pw).valid, false, pw);
    });
  });

  it('rejects illegal characters', function () {
    ['[AAA1-BB!2-333C-4d-5F5F]', '[AAA1-BB 2-333C-4d-5F5F]',
     '[AAA1-BB_2-333C-4d-5F5F]', '[AAA1-BBé2-333C-4d-5F5F]'].forEach(function (pw) {
      assert.strictEqual(oddPassword.validate(pw).valid, false, pw);
    });
  });

  it('rejects too few uppercase blocks', function () {
    assert.match(reasonFor('[AAA1-BBB2-4d]'), /minimum is 3/);
  });

  it('rejects ragged block lengths', function () {
    assert.match(reasonFor('[AAA1-BBB22-333C-4d]'), /inconsistent/i);
  });

  it('rejects an empty block from a doubled separator', function () {
    assert.strictEqual(oddPassword.validate('[AAA1--BBB2-333C-4d]').valid, false);
  });

  it('rejects lowercase letters inside an uppercase block', function () {
    assert.strictEqual(oddPassword.validate('[aAA1-BBB2-333C-4d-5F5F]').valid, false);
  });

  it('rejects nested or doubled brackets', function () {
    assert.strictEqual(oddPassword.validate('[[AAA1-BBB2-333C-4d-5F5F]]').valid, false);
  });

  it('rejects uppercase blocks with no digit between them', function () {
    assert.match(
      reasonFor('[AAAA-BBBB-CCCC-4d-DDDD]'),
      /at least one letter and one digit/
    );
  });

  it('rejects uppercase blocks with no capital between them', function () {
    assert.match(
      reasonFor('[1111-2222-3333-4d-4444]'),
      /at least one letter and one digit/
    );
  });

  it('accepts a single all-letter block when another block carries a digit', function () {
    assert.ok(oddPassword.validate('[AAAA-BBBB-CCCC-4d-DDD1]').valid);
  });
});

describe('validating against specific options', function () {
  it('enforces a required bracket set', function () {
    assert.ok(oddPassword.validate('{AAA1-BBB2-333C-4d-5F5F}', { brackets: '{}' }).valid);
    assert.match(
      reasonFor('[AAA1-BBB2-333C-4d-5F5F]', { brackets: '{}' }),
      /Expected \{\} brackets/
    );
  });

  it('accepts any bracket set when brackets are random', function () {
    ['[', '{', '<', '('].forEach(function (open) {
      var close = { '[': ']', '{': '}', '<': '>', '(': ')' }[open];
      assert.ok(
        oddPassword.validate(open + 'AAA1-BBB2-333C-4d-5F5F' + close, { brackets: 'random' }).valid
      );
    });
  });

  it('honours a custom separator', function () {
    assert.ok(oddPassword.validate('[AAA1_BBB2_333C_4d_5F5F]', { separator: '_' }).valid);
    assert.strictEqual(oddPassword.validate('[AAA1_BBB2_333C_4d_5F5F]').valid, false);
  });

  it('reports invalid options rather than throwing', function () {
    var result = oddPassword.validate('[AAA1-BBB2-333C-4d-5F5F]', { blocks: 1 });
    assert.strictEqual(result.valid, false);
    assert.match(result.reason, /at least 3/);
  });
});

describe('round-tripping', function () {
  it('accepts everything the generator produces, across option combinations', function () {
    var combos = [
      {},
      { blocks: 3 },
      { blocks: 7 },
      { blockLength: 2 },
      { blockLength: 6 },
      { brackets: '()' },
      { brackets: 'curly' },
      { oddBlockPosition: 'first' },
      { oddBlockPosition: 'last' },
      { separator: '_' },
      { blocks: 5, blockLength: 3, brackets: '<>', oddBlockPosition: 2 }
    ];
    combos.forEach(function (opts) {
      oddPassword.generateMany(100, opts).forEach(function (pw) {
        var result = oddPassword.validate(pw, opts);
        assert.ok(result.valid, JSON.stringify(opts) + ' -> ' + pw + ' -> ' + result.reason);
      });
    });
  });

  it('rejects a password mutated anywhere in its body', function () {
    var pw = '[AAA1-BBB2-333C-4d-5F5F]';
    for (var i = 1; i < pw.length - 1; i++) {
      var mutated = pw.slice(0, i) + '*' + pw.slice(i + 1);
      assert.strictEqual(oddPassword.validate(mutated).valid, false, mutated);
    }
  });
});
