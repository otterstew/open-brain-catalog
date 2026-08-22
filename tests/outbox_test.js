// Drives the catalog's held-notes outbox in a real browser, with the archive
// made genuinely unreachable rather than mocked into returning an error — the
// distinction the whole feature turns on is "nothing reached the server" vs
// "the server said no", and a stubbed 500 exercises the wrong one.
//
//   npm i playwright
//   node tests/outbox_test.js
//
// A browser is already present in CI-style images at PLAYWRIGHT_BROWSERS_PATH;
// set CHROME_PATH to point somewhere else.

const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';
const TODAY = new Date().toISOString().slice(0, 10);

const calls = [];
// The stub keeps what it was told, so list_thoughts answers with the archive's
// real state — which is what the duplicate check reads.
const archive = [];
// Flipped by the test: while true every request to the archive is aborted at
// the transport, which is what fetch() sees on a dead connection.
let offline = false;
// Flipped by the test: the archive is reachable but refuses, which must be
// reported rather than retried in silence.
let refusing = false;
// Flipped by the test: the note is saved and then the reply is thrown away, the
// one failure mode a blind retry turns into a duplicate.
let swallowReply = false;

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

  const name = params.name, args = params.arguments || {};
  calls.push({ name, args });

  if (name === 'list_thoughts') return reply(JSON.stringify(archive));
  if (name === 'list_tasks') return reply(JSON.stringify([]));
  if (name === 'capture_thought') {
    if (refusing) {
      // The shape a real refusal takes: HTTP 200 carrying a JSON-RPC error.
      return { jsonrpc: '2.0', id, error: { code: -32000, message: 'Nope.' } };
    }
    const uuid = '00000000-0000-4000-8000-' + String(archive.length + 1).padStart(12, '0');
    archive.push({ id: uuid, content: args.content, created_at: new Date().toISOString(),
                   metadata: { type: 'observation', author: args.author,
                               published_date: args.published_date, topics: [], people: [] } });
    return reply('Captured as observation | id: ' + uuid);
  }
  return reply('');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') {
    const t = m.text();
    if (!/fonts\.(googleapis|gstatic)/.test(t) && !/Failed to load resource/.test(t)) errors.push('CONSOLE: ' + t);
  }});

  await page.route(u => u.href.startsWith(MCP), async route => {
    if (offline) return route.abort('internetdisconnected');
    const body = JSON.parse(route.request().postData() || '{}');
    const res = handle(body);
    // The reply is dropped after the archive has already acted on the request,
    // so the page sees an unreachable server for something that did land.
    if (swallowReply && body.params && body.params.name === 'capture_thought') {
      return route.abort('connectionaborted');
    }
    if (res === null) return route.fulfill({ status: 202, body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });

  await ctx.addInitScript(() => { localStorage.setItem('openbrain.accessKey', 'test-key'); });
  await page.goto(PAGE);
  await page.waitForTimeout(600);

  const results = [];
  const check = (label, ok, extra) => { results.push({ label, ok, extra }); };

  const shown = sel => page.evaluate(s => {
    const e = document.querySelector(s);
    return !!e && getComputedStyle(e).display !== 'none';
  }, sel);
  const held = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('openbrain.outbox') || '[]'); }
    catch (_) { return 'UNPARSEABLE'; }
  });
  // onSaved runs while the composer is still on screen, before it closes
  // itself; the wait afterwards is long enough for that close, so the next note
  // is never typed into a textarea that is about to be replaced.
  const write = async (text, onSaved) => {
    await page.click('#newBtn');
    await page.waitForTimeout(150);
    await page.fill('#composeText', text);
    await page.click('#composeSave');
    await page.waitForTimeout(400);
    if (onSaved) await onSaved();
    await page.waitForTimeout(1300);
  };
  // A note that actually lands opens the confirm-the-tags step, which sits over
  // everything until it is answered. Waved away here so the next note can be
  // written; the tagging step itself is another test's business.
  const dismissTags = async () => {
    if (await shown('#tagPanel')) {
      await page.click('#importTagSkip');
      await page.waitForTimeout(300);
    }
  };

  check('pill hidden with an empty outbox', !(await shown('#heldBtn')));

  // --- the connection dies, and two notes get written anyway ---
  offline = true;
  let composerSaid = '';
  await write('First note, written with no signal.', async () => {
    composerSaid = await page.$eval('#composeStatus', e => e.textContent);
  });

  check('the composer says the note was held, not lost',
    /held on this device/i.test(composerSaid), composerSaid);

  let queue = await held();
  check('note held rather than lost', queue.length === 1, queue);
  check('held note keeps its text',
    queue[0] && queue[0].content === 'First note, written with no signal.', queue[0]);
  check('held note keeps the known author',
    queue[0] && typeof queue[0].author === 'string' && queue[0].author.length > 0, queue[0]);
  check('held note is dated the day it was written',
    queue[0] && queue[0].published_date === TODAY, queue[0]);
  check('pill appears while notes are held', await shown('#heldBtn'));
  check('pill shows the count', (await page.$eval('#heldCount', e => e.textContent)) === '1 held');

  await write('Second note, still no signal.');
  queue = await held();
  check('a second note queues behind the first', queue.length === 2, queue.map(r => r.content));
  check('pill counts both', (await page.$eval('#heldCount', e => e.textContent)) === '2 held');
  check('nothing was sent while offline', calls.filter(c => c.name === 'capture_thought').length === 0);

  // --- held notes survive the tab being closed and reopened ---
  await page.reload();
  await page.waitForTimeout(400);
  check('held notes survive a reload', (await held()).length === 2);

  // --- the archive comes back, but refuses ---
  offline = false;
  refusing = true;
  await page.click('#heldBtn');
  await page.waitForTimeout(600);
  queue = await held();
  check('a refused note is kept, not dropped', queue.length === 2, queue.length);
  check('a refusal is shown, not swallowed',
    await page.$eval('#heldBtn', e => e.classList.contains('stuck')));
  check('the refusal reason is on the pill',
    /refused/i.test(await page.$eval('#heldBtn', e => e.title)),
    await page.$eval('#heldBtn', e => e.title));

  // --- the archive comes back properly ---
  refusing = false;
  await page.click('#heldBtn');
  await page.waitForTimeout(900);

  queue = await held();
  check('the queue drains', queue.length === 0, queue);
  check('the pill goes away', !(await shown('#heldBtn')));
  check('the outbox key is removed rather than left as []',
    (await page.evaluate(() => localStorage.getItem('openbrain.outbox'))) === null);

  check('both notes reached the archive, and only once each',
    archive.length === 2, archive.map(t => t.content));
  check('filed in the order they were written',
    /First note/.test(archive[0] ? archive[0].content : '') &&
    /Second note/.test(archive[1] ? archive[1].content : ''),
    archive.map(t => t.content));
  check('the write date survived the wait',
    archive.every(t => t.metadata.published_date === TODAY),
    archive.map(t => t.metadata.published_date));

  // --- a reachable archive still saves straight through ---
  const before = calls.filter(c => c.name === 'capture_thought').length;
  await write('An ordinary note, written online.');
  await page.waitForTimeout(700);
  check('an online note is not queued', (await held()).length === 0);
  check('an online note goes straight to the archive',
    calls.filter(c => c.name === 'capture_thought').length === before + 1);

  // --- the reply is lost after the archive has already saved the note ---
  // Without a guard this is the case that files the same note twice: the page
  // cannot tell it from a request that never arrived.
  await dismissTags();
  const beforeSwallow = archive.length;
  swallowReply = true;
  await write('A note whose receipt goes missing.');
  check('a note with no reply is held', (await held()).length === 1, await held());
  check('the archive did save it', archive.length === beforeSwallow + 1, archive.length);

  swallowReply = false;
  await page.click('#heldBtn');
  await page.waitForTimeout(900);
  check('the replayed note is not filed twice',
    archive.length === beforeSwallow + 1,
    archive.map(t => t.content));
  check('and it stops being held once that is established', (await held()).length === 0, await held());
  check('the pill goes away after the duplicate is recognised', !(await shown('#heldBtn')));

  // --- an online failure that is not a network failure still fails loudly ---
  await dismissTags();
  refusing = true;
  await write('A note the archive will refuse.');
  check('a refused live note is not silently queued', (await held()).length === 0, await held());
  check('a refused live note leaves the composer open with an error',
    /could not save/i.test(await page.$eval('#composeStatus', e => e.textContent)),
    await page.$eval('#composeStatus', e => e.textContent));
  refusing = false;

  // ---
  results.forEach(r => console.log((r.ok ? 'ok   ' : 'FAIL ') + r.label +
    (r.ok ? '' : '  →  ' + JSON.stringify(r.extra))));
  errors.forEach(e => console.log('FAIL ' + e));

  const failed = results.filter(r => !r.ok).length + errors.length;
  console.log('\n' + (results.length - (failed - errors.length)) + '/' + results.length + ' checks passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
