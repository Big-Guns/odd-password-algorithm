/*
 * Module contract: the public API surface, the UMD wrapper's three load paths,
 * and the entropy accounting.
 */
'use strict';

var { describe, it } = require('node:test');
var assert = require('node:assert');
var crypto = require('node:crypto');

var oddPassword = require('../oddPassword.js');
var h = require('./helpers.js');

describe('public API surface', function () {
  it('exports the documented functions', function () {
    ['generate', 'generateMany', 'validate', 'entropyBits'].forEach(function (name) {
      assert.strictEqual(typeof oddPassword[name], 'function', name);
    });
  });

  it('exports the documented constants', function () {
    assert.strictEqual(oddPassword.MIN_BLOCKS, 3);
    assert.deepStrictEqual(oddPassword.defaults, {
      blocks: 4,
      blockLength: 4,
      brackets: 'random',
      oddBlockPosition: 'random',
      separator: '-',
      rng: null
    });
    assert.deepStrictEqual(oddPassword.BRACKETS, {
      square: ['[', ']'],
      curly: ['{', '}'],
      angle: ['<', '>'],
      round: ['(', ')']
    });
  });

  it('exposes nothing else', function () {
    assert.deepStrictEqual(Object.keys(oddPassword).sort(), [
      'BRACKETS', 'MIN_BLOCKS', 'defaults', 'entropyBits',
      'generate', 'generateMany', 'validate'
    ]);
  });

  it('has no dependencies', function () {
    assert.strictEqual(/require\s*\(\s*['"](?!crypto['"])/.test(h.SOURCE), false);
    var pkg = require('../package.json');
    assert.strictEqual(pkg.dependencies, undefined);
  });

  it('runs in strict mode', function () {
    assert.match(h.SOURCE, /'use strict'/);
  });
});

describe('UMD load paths', function () {
  it('works as a CommonJS require', function () {
    assert.strictEqual(typeof require('../oddPassword.js').generate, 'function');
  });

  it('attaches to the global when loaded as a plain script', function () {
    var sandbox = h.loadInContext({ crypto: crypto.webcrypto });
    assert.strictEqual(typeof sandbox.oddPassword, 'object');
    assert.strictEqual(typeof sandbox.oddPassword.generate, 'function');
    assert.ok(sandbox.oddPassword.validate(sandbox.oddPassword.generate()).valid);
  });

  it('registers with an AMD loader when one is present', function () {
    var registered = null;
    var define = function (deps, factory) { registered = factory(); };
    define.amd = {};
    var sandbox = h.loadInContext({ crypto: crypto.webcrypto, define: define });

    assert.ok(registered, 'define() was called');
    assert.strictEqual(typeof registered.generate, 'function');
    assert.strictEqual(sandbox.oddPassword, undefined, 'did not also leak a global');
  });

  it('prefers CommonJS over the global when both are available', function () {
    var moduleStub = { exports: {} };
    var sandbox = h.loadInContext({ crypto: crypto.webcrypto, module: moduleStub });
    assert.strictEqual(typeof moduleStub.exports.generate, 'function');
    assert.strictEqual(sandbox.oddPassword, undefined, 'did not also leak a global');
  });

  it('declares the browser entry point in package.json', function () {
    var pkg = require('../package.json');
    assert.strictEqual(pkg.main, 'oddPassword.js');
    assert.strictEqual(pkg.browser, 'oddPassword.js');
    assert.ok(pkg.files.indexOf('oddPassword.js') !== -1);
  });

  it('ships the module without the test harness', function () {
    var pkg = require('../package.json');
    ['test.html', 'test.js', 'test'].forEach(function (name) {
      assert.strictEqual(pkg.files.indexOf(name), -1, name + ' should not be published');
    });
  });
});

describe('entropyBits', function () {
  var log2 = Math.log2;

  it('accounts for every random choice at the defaults', function () {
    var n = 16;                     // 4 blocks x 4 characters
    var expected = log2(4)          // bracket set
      + log2(5)                     // odd-block slot
      + 1                           // odd-block order
      + log2(26) + log2(10)         // odd-block letter and digit
      + n * log2(36)                // the uppercase run
      + log2(1 - Math.pow(26 / 36, n) - Math.pow(10 / 36, n)); // minus excluded runs
    assert.ok(Math.abs(oddPassword.entropyBits() - expected) < 1e-9);
    assert.ok(Math.abs(oddPassword.entropyBits() - 96.06) < 0.01, oddPassword.entropyBits());
  });

  it('discounts the uppercase runs the letter-and-digit rule excludes', function () {
    var n = 16;
    var unconstrained = log2(4) + log2(5) + 1 + log2(26) + log2(10) + n * log2(36);
    assert.ok(oddPassword.entropyBits() < unconstrained, 'constraint costs entropy');
    assert.ok(unconstrained - oddPassword.entropyBits() < 0.02, 'but only a fraction of a bit');
  });

  it('stays finite for block counts that would overflow 36^n', function () {
    var bits = oddPassword.entropyBits({ blocks: 32, blockLength: 16 });
    assert.ok(Number.isFinite(bits) && bits > 2000, String(bits));
  });

  it('drops the bracket term when the pair is pinned', function () {
    assert.ok(
      Math.abs(oddPassword.entropyBits() - oddPassword.entropyBits({ brackets: '[]' }) - 2) < 1e-9
    );
  });

  it('drops the slot term when the position is pinned', function () {
    var delta = oddPassword.entropyBits() - oddPassword.entropyBits({ oddBlockPosition: 'last' });
    assert.ok(Math.abs(delta - log2(5)) < 1e-9, String(delta));
  });

  it('grows with blocks and with block length', function () {
    assert.ok(oddPassword.entropyBits({ blocks: 6 }) > oddPassword.entropyBits({ blocks: 4 }));
    assert.ok(
      oddPassword.entropyBits({ blockLength: 6 }) > oddPassword.entropyBits({ blockLength: 4 })
    );
  });

  it('adds about log2(36) per extra character', function () {
    // Not exact: a longer run also shrinks the share excluded by the
    // letter-and-digit rule, which claws back a few thousandths of a bit.
    var delta = oddPassword.entropyBits({ blockLength: 5 }) - oddPassword.entropyBits();
    assert.ok(Math.abs(delta - 4 * log2(36)) < 0.05, String(delta));
  });

  it('rejects the same invalid options as generate', function () {
    assert.throws(function () { oddPassword.entropyBits({ blocks: 2 }); }, RangeError);
  });

  it('stays above 60 bits at the documented minimum', function () {
    assert.ok(oddPassword.entropyBits({ blocks: 3 }) > 60, oddPassword.entropyBits({ blocks: 3 }));
  });
});
