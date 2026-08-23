/*
 * Browser suite: loads the module through a <script> tag in real Chromium and
 * drives test.html. Skipped automatically when Playwright is not installed, so
 * the Node suites remain the baseline everywhere.
 */
'use strict';

var { describe, it, before, after } = require('node:test');
var assert = require('node:assert');
var http = require('node:http');
var fs = require('node:fs');
var path = require('node:path');

var h = require('./helpers.js');

// Playwright is optional: set ODDPW_PLAYWRIGHT_PATH to point at a global
// install, or `npm i -D playwright`. Without it this whole suite is skipped.
var chromium = null;
try {
  chromium = require(process.env.ODDPW_PLAYWRIGHT_PATH || 'playwright').chromium;
} catch (e) {
  chromium = null;
}

var ROOT = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

function startServer() {
  var server = http.createServer(function (req, res) {
    var name = path.basename(decodeURIComponent(req.url.split('?')[0]));
    var file = path.join(ROOT, name || 'test.html');
    fs.readFile(file, function (err, body) {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
      res.end(body);
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

describe('in a real browser', { skip: chromium ? false : 'playwright not installed' }, function () {
  var server, browser, origin;

  before(async function () {
    server = await startServer();
    origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch();
  });

  after(async function () {
    if (browser) await browser.close();
    if (server) await new Promise(function (r) { server.close(r); });
  });

  async function openPage(t) {
    var page = await browser.newPage();
    var problems = [];
    page.on('pageerror', function (e) { problems.push('pageerror: ' + e.message); });
    page.on('console', function (m) {
      if (m.type() === 'error') problems.push('console: ' + m.text());
    });
    t.after(async function () {
      await page.close();
      assert.deepStrictEqual(problems, [], 'browser reported no errors');
    });
    return page;
  }

  it('exposes window.oddPassword from a <script> tag', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    var api = await page.evaluate(function () {
      return Object.keys(window.oddPassword).sort();
    });
    assert.deepStrictEqual(api, [
      'BRACKETS', 'MIN_BLOCKS', 'defaults', 'entropyBits',
      'generate', 'generateMany', 'validate'
    ]);
  });

  it('generates valid passwords using the browser CSPRNG', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    var result = await page.evaluate(function () {
      var bad = [];
      var seen = {};
      for (var i = 0; i < 1000; i++) {
        var pw = window.oddPassword.generate();
        seen[pw] = true;
        var v = window.oddPassword.validate(pw);
        if (!v.valid) bad.push(pw + ' -> ' + v.reason);
      }
      return { bad: bad, unique: Object.keys(seen).length };
    });
    assert.deepStrictEqual(result.bad, []);
    assert.strictEqual(result.unique, 1000, 'no collisions in the browser either');
  });

  it('honours options in the browser', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    var pw = await page.evaluate(function () {
      return window.oddPassword.generate({ blocks: 6, brackets: '{}', oddBlockPosition: 'last' });
    });
    assert.match(pw, /^\{[A-Z0-9]{4}(?:-[A-Z0-9]{4}){5}-(?:[a-z][0-9]|[0-9][a-z])\}$/, pw);
  });

  it('renders a valid password on load', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    var shown = (await page.textContent('#out')).trim();
    var result = await page.evaluate(function (value) {
      return window.oddPassword.validate(value);
    }, shown);
    assert.ok(result.valid, shown + ' -> ' + result.reason);
  });

  it('generates a batch of ten valid passwords', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    await page.click('#genMany');
    var rows = await page.$$eval('#batch li', function (els) {
      return els.map(function (el) { return el.textContent; });
    });
    assert.strictEqual(rows.length, 10);
    rows.forEach(function (row) {
      assert.ok(/valid$/.test(row), row);
    });
  });

  it('surfaces option errors in the UI instead of throwing', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    await page.fill('#blocks', '2');
    await page.click('#gen');
    assert.match(await page.textContent('#out'), /at least 3/);
  });

  it('reports validator verdicts for good and bad input', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');

    await page.fill('#check', '[AAA1-BBB2-333C-4d-5F5F]');
    assert.match(await page.textContent('#verdict'), /^Valid/);

    await page.fill('#check', '[AAA1-BBB2-333C-4d>');
    assert.match(await page.textContent('#verdict'), /^Invalid — Mismatched brackets/);
  });

  it('passes its own 5,000-password stress test', async function (t) {
    var page = await openPage(t);
    await page.goto(origin + '/test.html');
    await page.click('#stress');
    await page.waitForFunction(function () {
      return document.getElementById('stressOut').textContent.trim().length > 0;
    }, null, { timeout: 30000 });
    assert.strictEqual(await page.textContent('#stressOut'), 'All 5,000 passed validation.');
  });
});
