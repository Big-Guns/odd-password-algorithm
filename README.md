# odd-password-algorithm

Generates passwords with a deliberately odd, fixed shape:

```
[AAA1-BBB2-333C-4d-5F5F]
```

- **N blocks** of random uppercase letters and digits — default 4, minimum 3.
  Any mix is allowed, including all letters (`DDDD`) or all digits (`5555`).
- **Exactly one "odd block"** of one lowercase letter and one digit, in either
  order (`4d` or `d4`). Its position among the other blocks is random by default.
- Blocks are joined with hyphens and wrapped in **one matched bracket pair** —
  `[]`, `{}`, `<>` or `()`, chosen at random unless you pin it. Never mismatched.

Vanilla JS, no dependencies, UMD (`<script>` tag, CommonJS or AMD).

## Usage

```html
<script src="oddPassword.js"></script>
<script>
  oddPassword.generate();                       // "(NCLV-w9-Y90V-VQ1Q-PRBY)"
  oddPassword.generate({ blocks: 6 });          // "<E7GK-E36R-NZ35-0l-UFS5-2ZV3-PUPB>"
  oddPassword.generate({ brackets: '{}' });     // "{R53C-9KCQ-243T-8e-KCX4}"
</script>
```

```js
const oddPassword = require('odd-password-algorithm');
// or, through a bundler:
import oddPassword from 'odd-password-algorithm';
```

## API

### `generate(options?) → string`

| Option | Default | Meaning |
| --- | --- | --- |
| `blocks` | `4` | Number of uppercase/digit blocks. Minimum 3; throws below that. |
| `blockLength` | `4` | Characters per uppercase/digit block. |
| `brackets` | `'random'` | `'random'`, or one of `'[]' '{}' '<>' '()'` (also named: `'square'`, `'curly'`, `'angle'`, `'round'`). |
| `oddBlockPosition` | `'random'` | `'random'`, `'first'`, `'last'`, or an integer index in `0 .. blocks`. |
| `separator` | `'-'` | String between blocks. |
| `rng` | CSPRNG | `(max) => int in [0, max)`. Inject for deterministic tests. |

Invalid options throw `TypeError` / `RangeError` with a message naming the
offending option — nothing is silently clamped.

### `generateMany(count, options?) → string[]`

### `validate(password, options?) → result`

Checks a string against the spec without re-deriving the rules:

```js
oddPassword.validate('[AAA1-BBB2-333C-4d-5F5F]');
// { valid: true, brackets: '[]', blocks: 4, blockLength: 4, oddBlockIndex: 3 }

oddPassword.validate('[AAA1-BBB2-333C-4d>');
// { valid: false, reason: 'Mismatched brackets: "[" ... ">".' }
```

Passing `options` tightens the check — e.g. `{ brackets: '{}' }` requires curly
braces. Omitted options accept anything the spec allows.

### `entropyBits(options?) → number`

Bits of entropy for the given shape, counting every random choice made
(bracket set, odd-block slot, odd-block order, and each character).
Defaults come out at **~96 bits**.

Also exported: `defaults`, `MIN_BLOCKS`, `BRACKETS`.

## Randomness

Characters come from `crypto.getRandomValues` with rejection sampling, so the
modulo does not skew the distribution — every symbol in each alphabet is
equally likely. `Math.random` is never used. If no WebCrypto is available the
module throws rather than falling back to something weaker; supply your own
`options.rng` if you need to control that.

## Tests

```
npm test          # Node suites — no dependencies, uses the built-in test runner
npm run test:browser
```

125 tests across five suites:

| Suite | Covers |
| --- | --- |
| `test/spec.test.js` | The required shape: matched brackets, block counts and charsets, exactly one odd block, both odd-block orders, collision-freedom. |
| `test/options.test.js` | Every option and every value that must be rejected, including error types and messages. |
| `test/validate.test.js` | `validate()` acceptance, each rejection reason, option-tightened checks, and single-character mutation of a known-good password. |
| `test/random.test.js` | Chi-square uniformity (p = 0.001) over characters, bracket sets, odd-block slot and order; no `Math.random`; the no-CSPRNG failure path; and that rejection sampling really discards out-of-range bytes. |
| `test/module.test.js` | Public API surface, all three UMD load paths (CommonJS, AMD, `<script>` global), packaging, and the entropy arithmetic. |

`test/browser.test.js` additionally drives real Chromium against `test.html`
— the `<script>` tag path, the browser CSPRNG, the UI, and its 5,000-password
stress run. It is **skipped unless Playwright is available**: either
`npm i -D playwright`, or point `ODDPW_PLAYWRIGHT_PATH` at a global install.

CI (`.github/workflows/test.yml`) runs the Node suites on Node 20, 22 and 24,
plus a Chromium job for the browser suite.

## Test page

`test.html` is a local harness — open it directly in a browser (or serve the
folder). Not intended for deployment.
