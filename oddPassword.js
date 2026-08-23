/*!
 * odd-password-algorithm
 * Generates passwords shaped like:  [AAA1-BBB2-333C-4d-5F5F]
 *
 * Structure:
 *   - N blocks (default 4, minimum 3) of random UPPERCASE letters and digits,
 *     guaranteed to contain at least one letter and at least one digit between
 *     them (any single block may still be all letters or all digits)
 *   - exactly 1 "odd block" of one lowercase letter + one digit ("4d" or "d4")
 *   - all blocks joined with hyphens
 *   - the whole thing wrapped in one matched bracket pair: [] {} <> ()
 *
 * UMD: works as a <script> tag (window.oddPassword), CommonJS, or AMD.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.oddPassword = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UPPER_ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var LOWER = 'abcdefghijklmnopqrstuvwxyz';
  var DIGITS = '0123456789';

  var BRACKETS = {
    square: ['[', ']'],
    curly: ['{', '}'],
    angle: ['<', '>'],
    round: ['(', ')']
  };

  // Aliases so callers can pass the pair itself: brackets: '{}'
  var BRACKET_ALIASES = {
    '[]': 'square',
    '{}': 'curly',
    '<>': 'angle',
    '()': 'round'
  };

  var BRACKET_NAMES = ['square', 'curly', 'angle', 'round'];

  var MIN_BLOCKS = 3;

  // A run of uppercase blocks can legitimately come out all letters — at the
  // defaults that is (26/36)^16, about 1 in 180, and far likelier for short
  // blocks. Consumers that require a digit and a capital would break on those,
  // so they are rejected and redrawn. Only an rng with no usable spread can
  // exhaust this many attempts.
  var MAX_CLASS_ATTEMPTS = 1000;

  var DEFAULTS = {
    blocks: 4,          // number of UPPER+digit blocks (minimum 3)
    blockLength: 4,     // characters per UPPER+digit block
    brackets: 'random', // 'random' | 'square' | 'curly' | 'angle' | 'round' | '[]' | '{}' | '<>' | '()'
    oddBlockPosition: 'random', // 'random' | 'first' | 'last' | integer index
    separator: '-',
    rng: null           // optional (max) => int in [0, max); defaults to CSPRNG
  };

  /* ------------------------------------------------------------------ *
   * Randomness
   * ------------------------------------------------------------------ */

  function getCrypto() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto &&
        typeof globalThis.crypto.getRandomValues === 'function') {
      return globalThis.crypto;
    }
    if (typeof self !== 'undefined' && self.crypto &&
        typeof self.crypto.getRandomValues === 'function') {
      return self.crypto;
    }
    // Node without a global WebCrypto (older runtimes).
    if (typeof require === 'function') {
      try {
        var nodeCrypto = require('crypto');
        if (nodeCrypto && nodeCrypto.webcrypto &&
            typeof nodeCrypto.webcrypto.getRandomValues === 'function') {
          return nodeCrypto.webcrypto;
        }
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  /**
   * Uniform integer in [0, max) from a CSPRNG, using rejection sampling so
   * the modulo does not skew the distribution. `max` must be <= 256, which
   * covers every alphabet in this module.
   */
  function secureRandomInt(max) {
    var c = getCrypto();
    if (!c) {
      throw new Error(
        'oddPassword: no cryptographic RNG available. Run in a browser/Node ' +
        'with WebCrypto, or pass your own options.rng.'
      );
    }
    var limit = 256 - (256 % max); // largest multiple of max <= 256
    var buf = new Uint8Array(1);
    var v;
    do {
      c.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % max;
  }

  function pick(alphabet, rand) {
    return alphabet.charAt(rand(alphabet.length));
  }

  /* ------------------------------------------------------------------ *
   * Option handling
   * ------------------------------------------------------------------ */

  function resolveBrackets(value, rand) {
    // `value` has already been through normalizeOptions, so an absent option is
    // the default rather than null/undefined: anything unrecognised is an error.
    if (value === 'random') {
      return BRACKETS[BRACKET_NAMES[rand(BRACKET_NAMES.length)]];
    }
    if (typeof value !== 'string') {
      throw new TypeError('oddPassword: options.brackets must be a string.');
    }
    var key = BRACKET_ALIASES[value] || value.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(BRACKETS, key)) {
      throw new RangeError(
        'oddPassword: unknown brackets "' + value + '". Use one of: random, ' +
        BRACKET_NAMES.join(', ') + ', [], {}, <>, ().'
      );
    }
    return BRACKETS[key];
  }

  function resolveOddPosition(value, slots, rand) {
    // `slots` is blocks + 1: the odd block can land before, between, or after.
    if (value === 'random') return rand(slots);
    if (value === 'first') return 0;
    if (value === 'last') return slots - 1;
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value) {
      throw new TypeError(
        'oddPassword: options.oddBlockPosition must be "random", "first", ' +
        '"last", or an integer index.'
      );
    }
    if (value < 0 || value >= slots) {
      throw new RangeError(
        'oddPassword: oddBlockPosition ' + value + ' is out of range 0..' + (slots - 1) + '.'
      );
    }
    return value;
  }

  function normalizeOptions(options) {
    var o = options || {};
    var opts = {};
    var key;
    for (key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        opts[key] = Object.prototype.hasOwnProperty.call(o, key) && o[key] !== undefined
          ? o[key]
          : DEFAULTS[key];
      }
    }

    if (typeof opts.blocks !== 'number' || !isFinite(opts.blocks) ||
        Math.floor(opts.blocks) !== opts.blocks) {
      throw new TypeError('oddPassword: options.blocks must be an integer.');
    }
    if (opts.blocks < MIN_BLOCKS) {
      throw new RangeError('oddPassword: options.blocks must be at least ' + MIN_BLOCKS + '.');
    }

    if (typeof opts.blockLength !== 'number' || !isFinite(opts.blockLength) ||
        Math.floor(opts.blockLength) !== opts.blockLength) {
      throw new TypeError('oddPassword: options.blockLength must be an integer.');
    }
    if (opts.blockLength < 1) {
      throw new RangeError('oddPassword: options.blockLength must be at least 1.');
    }

    if (typeof opts.separator !== 'string' || opts.separator.length === 0) {
      throw new TypeError('oddPassword: options.separator must be a non-empty string.');
    }

    if (opts.rng != null && typeof opts.rng !== 'function') {
      throw new TypeError('oddPassword: options.rng must be a function (max) => int.');
    }

    return opts;
  }

  /* ------------------------------------------------------------------ *
   * Building blocks
   * ------------------------------------------------------------------ */

  /** A block of random uppercase letters and digits, e.g. "A1AA", "5555". */
  function makeUpperBlock(length, rand) {
    var out = '';
    for (var i = 0; i < length; i++) out += pick(UPPER_ALNUM, rand);
    return out;
  }

  /** The odd block: exactly one lowercase letter and one digit, either order. */
  function makeOddBlock(rand) {
    var letter = pick(LOWER, rand);
    var digit = pick(DIGITS, rand);
    return rand(2) === 0 ? letter + digit : digit + letter;
  }

  /**
   * True when the uppercase blocks, taken together, hold at least one letter
   * and at least one digit. Individual blocks are unconstrained: "DDDD" and
   * "5555" are both fine as long as something else supplies the other class.
   */
  function hasBothClasses(blocks) {
    var joined = blocks.join('');
    return /[A-Z]/.test(joined) && /[0-9]/.test(joined);
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  /**
   * Generate one password.
   * @param {Object} [options] see DEFAULTS above.
   * @returns {string} e.g. "[AAA1-BBB2-333C-4d-5F5F]"
   */
  function generate(options) {
    var opts = normalizeOptions(options);
    var rand = opts.rng || secureRandomInt;

    var pair = resolveBrackets(opts.brackets, rand);
    var oddIndex = resolveOddPosition(opts.oddBlockPosition, opts.blocks + 1, rand);

    // Redraw the whole run rather than patching a character into it: rejection
    // keeps the result uniform over the passwords that satisfy the rule.
    var parts;
    var attempts = 0;
    do {
      parts = [];
      for (var i = 0; i < opts.blocks; i++) {
        parts.push(makeUpperBlock(opts.blockLength, rand));
      }
      attempts++;
    } while (!hasBothClasses(parts) && attempts < MAX_CLASS_ATTEMPTS);

    if (!hasBothClasses(parts)) {
      throw new Error(
        'oddPassword: gave up after ' + MAX_CLASS_ATTEMPTS + ' attempts to draw ' +
        'uppercase blocks containing both a letter and a digit. Check that ' +
        'options.rng returns a usable spread of values.'
      );
    }

    parts.splice(oddIndex, 0, makeOddBlock(rand));

    return pair[0] + parts.join(opts.separator) + pair[1];
  }

  /**
   * Generate `count` passwords.
   * @returns {string[]}
   */
  function generateMany(count, options) {
    if (typeof count !== 'number' || !isFinite(count) || Math.floor(count) !== count || count < 0) {
      throw new TypeError('oddPassword: count must be a non-negative integer.');
    }
    var out = [];
    for (var i = 0; i < count; i++) out.push(generate(options));
    return out;
  }

  /**
   * Check a string against the spec. Useful for validating user-supplied or
   * stored passwords without re-deriving the rules.
   * @returns {{valid: boolean, reason?: string, brackets?: string,
   *            blocks?: number, blockLength?: number, oddBlockIndex?: number}}
   */
  function validate(password, options) {
    var opts;
    try {
      opts = normalizeOptions(options);
    } catch (e) {
      return { valid: false, reason: e.message };
    }

    if (typeof password !== 'string') {
      return { valid: false, reason: 'Not a string.' };
    }
    if (password.length < 2) {
      return { valid: false, reason: 'Too short to be bracketed.' };
    }

    var open = password.charAt(0);
    var close = password.charAt(password.length - 1);
    var name = null;
    for (var i = 0; i < BRACKET_NAMES.length; i++) {
      var p = BRACKETS[BRACKET_NAMES[i]];
      if (p[0] === open) { name = BRACKET_NAMES[i]; break; }
    }
    if (!name) {
      return { valid: false, reason: 'Does not start with [, {, < or (.' };
    }
    if (BRACKETS[name][1] !== close) {
      return { valid: false, reason: 'Mismatched brackets: "' + open + '" ... "' + close + '".' };
    }
    if (opts.brackets !== 'random') {
      var wanted = resolveBrackets(opts.brackets, function () { return 0; });
      if (wanted[0] !== open) {
        return { valid: false, reason: 'Expected ' + wanted[0] + wanted[1] + ' brackets.' };
      }
    }

    var body = password.slice(1, -1);
    var parts = body.split(opts.separator);

    var oddIndex = -1;
    for (var j = 0; j < parts.length; j++) {
      var part = parts[j];
      if (/^[A-Z0-9]+$/.test(part)) continue;
      if (/^(?:[a-z][0-9]|[0-9][a-z])$/.test(part)) {
        if (oddIndex !== -1) {
          return { valid: false, reason: 'More than one lowercase block.' };
        }
        oddIndex = j;
        continue;
      }
      return { valid: false, reason: 'Block "' + part + '" is not a valid block.' };
    }

    if (oddIndex === -1) {
      return { valid: false, reason: 'Missing the lowercase-letter + digit block.' };
    }

    var upperBlocks = [];
    for (var k = 0; k < parts.length; k++) {
      if (k !== oddIndex) upperBlocks.push(parts[k]);
    }
    if (upperBlocks.length < MIN_BLOCKS) {
      return {
        valid: false,
        reason: 'Only ' + upperBlocks.length + ' uppercase blocks; minimum is ' + MIN_BLOCKS + '.'
      };
    }
    for (var m = 0; m < upperBlocks.length; m++) {
      if (upperBlocks[m].length !== upperBlocks[0].length) {
        return { valid: false, reason: 'Uppercase blocks have inconsistent lengths.' };
      }
    }

    if (!hasBothClasses(upperBlocks)) {
      return {
        valid: false,
        reason: 'Uppercase blocks need at least one letter and one digit between them.'
      };
    }

    return {
      valid: true,
      brackets: open + close,
      blocks: upperBlocks.length,
      blockLength: upperBlocks[0].length,
      oddBlockIndex: oddIndex
    };
  }

  /**
   * Entropy of the generated shape, in bits, for the given options.
   * Counts the random choices actually made: bracket set, odd-block slot,
   * odd-block order, and every character.
   */
  function entropyBits(options) {
    var opts = normalizeOptions(options);
    var bits = 0;
    if (opts.brackets === 'random') bits += Math.log2(BRACKET_NAMES.length);
    if (opts.oddBlockPosition === 'random') bits += Math.log2(opts.blocks + 1);
    bits += 1; // letter-digit vs digit-letter
    bits += Math.log2(LOWER.length) + Math.log2(DIGITS.length);
    // The uppercase run is uniform over the 36^n strings minus those with no
    // digit (26^n) and those with no letter (10^n). Computed in log space so
    // large block counts do not overflow.
    var n = opts.blocks * opts.blockLength;
    bits += n * Math.log2(UPPER_ALNUM.length) +
      Math.log2(1 - Math.pow(26 / 36, n) - Math.pow(10 / 36, n));
    return bits;
  }

  return {
    generate: generate,
    generateMany: generateMany,
    validate: validate,
    entropyBits: entropyBits,
    defaults: DEFAULTS,
    MIN_BLOCKS: MIN_BLOCKS,
    BRACKETS: BRACKETS
  };
}));
