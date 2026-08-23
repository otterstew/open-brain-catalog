// Drives the catalog's drag-and-drop import in a real browser, with the archive
// both locked and unlocked.
//
//   npm i playwright
//   node tests/import_drop_test.js
//
// The case worth having: a file dropped while the archive is locked used to be
// discarded in silence, which looked exactly like a broken import. It should
// now be held and carried through the unlock.

const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';
const KEY = 'openbrain.accessKey';
const FILE_NAME = 'notes.md';
const FILE_BODY = 'A dropped note about Harvey and the PoC.';

function handle(body) {
  const { method, params, id } = body;
  const reply = (text) => ({
    jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] },
  });
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05', capabilities: { tools: {} },
      serverInfo: { name: 'open-brain', version: '1' } } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: [] } };
  if (method !== 'tools/call') return { jsonrpc: '2.0', id, result: {} };
  if (params.name === 'list_thoughts') return reply(JSON.stringify([]));
  if (params.name === 'list_tasks') return reply(JSON.stringify([]));
  return reply('');
}

// Build a DataTransfer in the page and fire the real event names at window, so
// the page's own listeners run rather than a stubbed stand-in.
const fireDrag = ([type, name, body]) => {
  const dt = new DataTransfer();
  if (name) dt.items.add(new File([body], name, { type: 'text/markdown' }));
  window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Google Fonts cannot be reached from this sandbox; not our bug.
    if (!/fonts\.(googleapis|gstatic)/.test(t) && !/Failed to load resource/.test(t)) {
      errors.push('CONSOLE: ' + t);
    }
  });

  await page.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    if (res === null) return route.fulfill({ status: 202, body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });

  const results = [];
  const check = (label, ok, extra) => results.push({ label, ok, extra });

  const state = () => page.evaluate(() => ({
    locked: !document.getElementById('unlock').hidden,
    unlockCopy: document.getElementById('unlockCopy').textContent,
    veilOn: document.getElementById('dropVeil').classList.contains('on'),
    veilLocked: document.getElementById('dropVeil').classList.contains('locked'),
    openShown: getComputedStyle(document.querySelector('.drop-open')).display !== 'none',
    lockedShown: getComputedStyle(document.querySelector('.drop-locked')).display !== 'none',
    importOpen: !document.getElementById('importPanel').hidden,
    importFile: document.getElementById('importFile').textContent,
    importText: document.getElementById('importText').value,
  }));

  // ---------- locked: the file is held, not dropped on the floor ----------
  await ctx.addInitScript(k => localStorage.removeItem(k), KEY);
  await page.goto(PAGE);
  await page.waitForTimeout(500);

  check('starts locked with no key', (await state()).locked);

  await page.evaluate(fireDrag, ['dragenter', FILE_NAME, FILE_BODY]);
  let s = await state();
  check('locked drag still raises the veil', s.veilOn);
  check('locked drag marks the veil locked', s.veilLocked);
  check('locked drag shows the unlock message', s.lockedShown && !s.openShown);

  await page.evaluate(fireDrag, ['drop', FILE_NAME, FILE_BODY]);
  await page.waitForTimeout(300);
  s = await state();
  check('locked drop clears the veil', !s.veilOn && !s.veilLocked);
  check('locked drop names the held file', s.unlockCopy.includes(FILE_NAME),
        JSON.stringify(s.unlockCopy));
  check('locked drop does not open the import panel', !s.importOpen);
  check('locked drop leaves the gate up', s.locked);

  // The whole point: unlocking carries the held file through.
  await page.fill('#unlockInput', 'test-key');
  await page.click('#unlockForm button[type=submit]').catch(async () => {
    await page.evaluate(() => document.getElementById('unlockForm')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  });
  await page.waitForTimeout(700);
  s = await state();
  check('unlocking imports the held file', s.importOpen);
  check('held file keeps its name', s.importFile === FILE_NAME, s.importFile);
  check('held file keeps its text', s.importText.includes('Harvey'), s.importText);

  // ---------- unlocked: the ordinary path still works ----------
  await ctx.addInitScript((k) => localStorage.setItem(k, 'test-key'), KEY);
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => errors.push('PAGEERROR(2): ' + e.message));
  await page2.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    if (res === null) return route.fulfill({ status: 202, body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page2.goto(PAGE);
  await page2.waitForTimeout(500);

  await page2.evaluate(fireDrag, ['dragenter', FILE_NAME, FILE_BODY]);
  const veil = await page2.evaluate(() => ({
    on: document.getElementById('dropVeil').classList.contains('on'),
    locked: document.getElementById('dropVeil').classList.contains('locked'),
  }));
  check('unlocked drag raises the plain veil', veil.on && !veil.locked);

  await page2.evaluate(fireDrag, ['drop', FILE_NAME, FILE_BODY]);
  await page2.waitForTimeout(500);
  const after = await page2.evaluate(() => ({
    importOpen: !document.getElementById('importPanel').hidden,
    importFile: document.getElementById('importFile').textContent,
    importText: document.getElementById('importText').value,
  }));
  check('unlocked drop imports straight away', after.importOpen);
  check('unlocked drop keeps its name', after.importFile === FILE_NAME, after.importFile);
  check('unlocked drop keeps its text', after.importText.includes('Harvey'), after.importText);

  // A drag with no files at all must not raise the veil.
  await page2.evaluate(() => {
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: new DataTransfer() }));
  });
  check('a fileless drag is ignored', !(await page2.evaluate(
    () => document.getElementById('dropVeil').classList.contains('on'))));

  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) { failed++; console.log('FAIL  ' + r.label + (r.extra ? '  -> ' + r.extra : '')); }
  }
  for (const e of errors) { failed++; console.log(e); }
  console.log((results.length - results.filter(r => !r.ok).length) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
