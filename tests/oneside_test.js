// Drives One Side (oneside.html) in a real browser against a stubbed MCP
// server: the day's meetings, stepping through one-sided cards, and adding
// meeting prep by pasting a message. No deployment and no access key needed.
//
//   npm i playwright
//   node tests/oneside_test.js
//
// A browser is already present in CI-style images at PLAYWRIGHT_BROWSERS_PATH;
// set CHROME_PATH to point somewhere else.

const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'oneside.html');

const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = day(0);

let notes = [
  { id: '11111111-1111-1111-1111-111111111111', created_at: '2026-10-01T09:00:00Z',
    metadata: { title: 'Weekly team catch-up', topics: ['Meeting prep'], published_date: TODAY },
    content: '# Weekly team catch-up\nDate: ' + TODAY + '\nTime: 23:58\n\n' +
      '## Tideline budget\nWe are **on track**: spend is at 62% with a third of the year left.\n\n' +
      '## Hiring\nTwo offers out, one accepted.\n\n' +
      '## <script>alert(1)</script>\nEscaped, not run.\n' },
  { id: '22222222-2222-2222-2222-222222222222', created_at: '2026-10-01T08:00:00Z',
    metadata: { title: 'Board prep', topics: ['Meeting prep'], published_date: TODAY },
    // No "##" sections and no Date line: numbered points become the cards,
    // and the day comes from published_date.
    content: '# Board prep\nTime: 00:00\n\n1. Risks: nothing new since September.\n2. Budget – flat for Q4.' },
  { id: '33333333-3333-3333-3333-333333333333', created_at: '2026-10-01T07:00:00Z',
    metadata: { title: 'Later', topics: ['Meeting prep'], published_date: day(3) },
    content: '# Quarterly review\nDate: ' + day(3) + '\n\n## Only card\nSay this.' },
];

const calls = [];
let nextId = 0;

function handle(body) {
  const { params, id } = body;
  const reply = (text, isError) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: !!isError } });
  const name = params.name, args = params.arguments || {};
  calls.push({ name, args });

  if (name === 'list_thoughts') {
    return reply(JSON.stringify(notes.filter(n => (n.metadata.topics || []).includes(args.topic))));
  }
  if (name === 'capture_thought') {
    const nid = 'aaaaaaaa-0000-0000-0000-00000000000' + (nextId++);
    notes.push({ id: nid, content: args.content, created_at: new Date().toISOString(),
      metadata: { topics: ['Work'], published_date: args.published_date } });
    return reply('Captured as observation | id: ' + nid);
  }
  if (name === 'update_thought') {
    const n = notes.find(x => x.id === args.id);
    if (!n) return reply('Could not find thought', true);
    if (args.content !== undefined) n.content = args.content;
    ['title', 'topics', 'type', 'published_date', 'updated_date'].forEach(k => { if (args[k] !== undefined) n.metadata[k] = args[k]; });
    return reply('Updated thought ' + n.id);
  }
  if (name === 'delete_thought') {
    notes = notes.filter(x => x.id !== args.id);
    return reply('Deleted');
  }
  return reply('');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => { if (/alert/.test(d.type())) errors.push('ALERT RAN: ' + d.message()); d.accept(); });
  page.on('console', m => { if (m.type() === 'error') {
    const t = m.text();
    if (!/fonts\.(googleapis|gstatic)/.test(t) && !/Failed to load resource/.test(t)) errors.push('CONSOLE: ' + t);
  }});

  await page.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });

  await ctx.addInitScript(() => { localStorage.setItem('openbrain.accessKey', 'test-key'); });
  await page.goto(PAGE);
  await page.waitForSelector('.mtg');

  const results = [];
  const check = (label, ok, extra) => results.push({ label, ok, extra });
  const text = sel => page.locator(sel).first().innerText();

  // --- today's meetings, in time order ---
  const chips = await page.locator('.mtg .name').allInnerTexts();
  check('today shows its two meetings, earliest first', JSON.stringify(chips) === '["Board prep","Weekly team catch-up"]', chips);
  check('the label says Today', /Today/i.test(await text('#dayLabel')));
  check('the meeting still to come today is open by default', /Weekly team catch-up/i.test(await text('.card-label')), await text('.card-label'));

  // --- one card at a time ---
  check('first card heading', (await text('.card-head')) === 'Tideline budget');
  check('bold is drawn as bold', await page.locator('.card-body strong').count() === 1);
  check('counter reads 1 / 3', /1 \/ 3/.test(await text('.card-label')));
  await page.click('#card');
  check('tapping the card moves to the next', (await text('.card-head')) === 'Hiring');
  await page.keyboard.press('ArrowRight');
  check('arrow key moves on', /3 \/ 3/.test(await text('.card-label')));
  check('a script in a heading is shown as text', /<script>/.test(await text('.card-head')));
  await page.keyboard.press('ArrowLeft');
  check('arrow back goes back', (await text('.card-head')) === 'Hiring');

  await page.click('#viewBtn');
  check('All cards shows every card', await page.locator('.list .card').count() === 3);
  await page.click('#viewBtn');

  // --- a note with numbered points instead of sections ---
  await page.click('.mtg >> text=Board prep');
  check('numbered points become cards', /1 \/ 2/.test(await text('.card-label')));
  check('"Risks: ..." splits into heading and words', (await text('.card-head')) === 'Risks' && /nothing new/.test(await text('.card-body')));
  await page.click('#card');
  check('"Budget – ..." splits too', (await text('.card-head')) === 'Budget' && /flat for Q4/.test(await text('.card-body')));

  // --- moving through days ---
  await page.click('#dayNext');
  check('tomorrow is empty and offers the next prep', /Nothing prepped/.test(await text('#stage')) && await page.locator('[data-jump]').count() === 1);
  await page.click('[data-jump]');
  check('jumping lands on the day with prep', /Quarterly review/i.test(await text('.card-label')));
  await page.click('#dayLabel');
  check('the day label goes back to today', /Today/i.test(await text('#dayLabel')));

  // --- adding prep by pasting a message ---
  await page.click('#addBtn');
  check('the editor opens on the paste box', await page.locator('#pasteBox[open]').count() === 1);
  const msg = [
    'Meeting prep for 1:1 with Sam (' + day(1) + ', 2:30pm)',
    '',
    '1. **Project Atlas**: we hit the milestone on Friday.',
    '   Next is the pilot.',
    '2. Hiring - the role is approved.',
    '3. What I need from you: a decision on the budget by Monday.',
  ].join('\n');
  await page.fill('#pasteIn', msg);
  await page.click('#pasteReplace');
  check('name read from the message', (await page.inputValue('#mName')) === '1:1 with Sam', await page.inputValue('#mName'));
  check('date read from the message', (await page.inputValue('#mDate')) === day(1), await page.inputValue('#mDate'));
  check('time read from the message (2:30pm → 14:30)', (await page.inputValue('#mTime')) === '14:30', await page.inputValue('#mTime'));
  const heads = await page.$$eval('#rows .row input', els => els.map(e => e.value));
  check('three cards made, with headings', JSON.stringify(heads) === '["Project Atlas","Hiring","What I need from you"]', heads);
  const firstWords = await page.$eval('#rows .row textarea', e => e.value);
  check('a point’s follow-on line stays with it', /milestone on Friday\.\nNext is the pilot\./.test(firstWords), firstWords);

  await page.click('#saveBtn');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  const cap = calls.find(c => c.name === 'capture_thought');
  check('captured with the meeting day as published_date', cap && cap.args.published_date === day(1));
  check('captured in the One Side note shape',
    cap && cap.args.content.startsWith('# 1:1 with Sam\nDate: ' + day(1) + '\nTime: 14:30\n\n## Project Atlas\n'), cap && cap.args.content);
  const tagged = calls.find(c => c.name === 'update_thought' && c.args.topics);
  check('then tagged Meeting prep with its title', tagged && tagged.args.topics[0] === 'Meeting prep' && tagged.args.title === '1:1 with Sam');
  check('the app moves to the new meeting', /1:1 with Sam/i.test(await text('.card-label')) && (await text('.card-head')) === 'Project Atlas');

  // --- editing it ---
  await page.click('#editBtn');
  await page.locator('#rows .row input').nth(1).fill('Hiring update');
  await page.click('#saveBtn');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  const upd = calls.filter(c => c.name === 'update_thought' && c.args.content).pop();
  check('an edit rewrites the same note', upd && upd.args.id === tagged.args.id && /## Hiring update\n/.test(upd.args.content));

  // --- deleting it ---
  await page.click('#editBtn');
  await page.click('#deleteBtn');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('delete removes the note', calls.some(c => c.name === 'delete_thought' && c.args.id === tagged.args.id));
  check('and the day is empty again', /Nothing prepped/.test(await text('#stage')), await text('#stage'));

  // --- a rejected key goes back to the lock ---
  await page.route(u => u.href.startsWith(MCP), route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Unauthorized' } }) }));
  await page.click('#refreshBtn');
  await page.waitForSelector('#lock:not([hidden])');
  check('a rejected key shows the lock', /rejected/.test(await text('#lockErr')));

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT }).catch(() => {});
  await browser.close();

  let failed = 0;
  results.forEach(r => { if (!r.ok) failed++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.label + (r.ok || r.extra === undefined ? '' : '  → ' + JSON.stringify(r.extra))); });
  errors.forEach(e => { failed++; console.log('FAIL ' + e); });
  console.log(failed ? '\n' + failed + ' failed' : '\nall ' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
