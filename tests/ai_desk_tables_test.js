// Drives AI Desk (ai.html) in a real browser against a stubbed MCP server:
// Download PDF on every page, and the editable tables (```table notes) in the
// Project register: edit, add and delete rows, CSV out and back in, and the
// print layout. Then strips the owner-only code the way the share build does
// and checks the colleague copy still runs, with no PDF button or editing.
// No deployment and no access key needed.
//
//   npm i playwright
//   node tests/ai_desk_tables_test.js
//
// A browser is already present in CI-style images at PLAYWRIGHT_BROWSERS_PATH;
// set CHROME_PATH to point somewhere else.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FILE = path.resolve(__dirname, '..', 'ai.html');

const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';
const HEALTH = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/system-health';

const TABLE = { columns: [
  { k: 'name', label: 'Project' },
  { k: 'what', label: 'What it is', long: true },
  { k: 'effort', label: 'Effort' },
], rows: [
  { name: 'Tideline', what: 'Client onboarding triage, with a `code` bit and a [link](https://example.com)', effort: '' },
  { name: 'Trips', what: 'Trip wallet, "quoted", with a comma', effort: 'Low' },
] };
const block = (t) => '```table\n' + JSON.stringify(t) + '\n```';

let notes = [
  { id: '11111111-1111-1111-1111-111111111111', created_at: '2026-10-14T09:00:00Z',
    metadata: { title: 'Project register', topics: ['AI Dashboard', 'Project register'], published_date: '2026-10-14' },
    content: '# Project register\n\n' + block(TABLE) + '\n\n## How to read it\nEfforts are rough.' },
  { id: '22222222-2222-2222-2222-222222222222', created_at: '2026-10-12T09:00:00Z',
    metadata: { title: 'Last week in AI', topics: ['AI Dashboard', 'AI weekly update'], published_date: '2026-10-12' },
    content: '# Last week in AI\n\n## One\nA thing happened.' },
];
const calls = [];

function handle(body) {
  const { params, id } = body;
  const reply = (text, isError) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: !!isError } });
  const name = params.name, args = params.arguments || {};
  calls.push({ name, args });
  if (name === 'list_thoughts') return reply(JSON.stringify(notes.filter(n => n.metadata.topics.includes(args.topic))));
  if (name === 'update_thought') {
    const n = notes.find(x => x.id === args.id);
    if (!n) return reply('Could not find thought', true);
    if (args.content !== undefined) n.content = args.content;
    if (args.updated_date) n.metadata.updated_date = args.updated_date;
    return reply('Updated thought ' + n.id);
  }
  return reply('');
}

// The note's table as the server now holds it.
const stored = () => JSON.parse(notes[0].content.match(/```table\s*\n([\s\S]*?)\n```/)[1]);

// What ~/Documents/Claude Code/AI Desk Share/build.js does to the file: drop
// every owner region and every line ending "// owner", then fill in SNAPSHOT.
function shareBuild(src, snapshot) {
  const out = src.replace(/^[ \t]*\/\/ <owner>[ \t]*$[\s\S]*?^[ \t]*\/\/ <\/owner>[ \t]*$/gm, '').split('\n').filter(l => !/\/\/ owner\s*$/.test(l)).join('\n');
  return out.replace('const SNAPSHOT = null;', 'const SNAPSHOT = ' + JSON.stringify(snapshot) + ';');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
  let confirmAnswer = true;
  page.on('dialog', d => (d.type() === 'confirm' ? (confirmAnswer ? d.accept() : d.dismiss()) : (errors.push('ALERT: ' + d.message()), d.accept())));

  await page.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(u => u.href.startsWith(HEALTH), route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ checks: [{ check_id: 'site:x', name: 'Website', app: 'Sites', status: 'ok', detail: 'Fine.', half: 'cloud' }], cloud: {}, mac: {} }) }));

  await ctx.addInitScript(() => {
    localStorage.setItem('openbrain.accessKey', 'test-key');
    sessionStorage.setItem('aidesk.view', JSON.stringify({ section: 'Project register' }));
    // window.print would block headless Chrome; record what the page looks like when it's called.
    window.__prints = [];
    window.print = () => {
      window.__prints.push({ title: document.title, landscape: [...document.querySelectorAll('style')].some(s => /size:A4 landscape/.test(s.textContent)) });
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.goto('file://' + FILE);
  await page.waitForSelector('.rg table');

  const results = [];
  const check = (label, ok, extra) => results.push({ label, ok, extra });
  const cellTexts = () => page.locator('.rg tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.innerText)));

  // --- the table ---
  check('the register is in the private section', /Project register/.test(await page.locator('nav').innerText()));
  let cells = await cellTexts();
  check('every row is drawn', cells.length === 2 && cells[0][0] === 'Tideline' && cells[1][2] === 'Low', cells);
  check('an empty cell shows a dash', cells[0][2] === '–');
  check('markdown in cells: code and links', await page.locator('.rg td code').count() === 1 && await page.locator('.rg td a[href="https://example.com"]').count() === 1);
  check('the note text under the table still renders', /Efforts are rough/.test(await page.locator('.body').innerText()));
  check('the JSON block is not shown as text', await page.locator('.body pre').count() === 0);

  // --- Download PDF ---
  await page.click('[data-pdf]');
  let prints = await page.evaluate(() => window.__prints);
  check('Download PDF opens the print dialog', prints.length === 1, prints);
  check('the PDF file name is the page title', prints[0] && prints[0].title === 'AI Desk - Project register', prints[0]);
  check('a table page prints landscape', prints[0] && prints[0].landscape);
  check('the tab title comes back afterwards', (await page.title()) === 'AI Desk');
  check('the landscape rule is removed afterwards', !(await page.evaluate(() => [...document.querySelectorAll('style')].some(s => /size:A4 landscape/.test(s.textContent)))));

  // --- edit a row ---
  await page.click('.rg tbody tr >> nth=0');
  check('tapping a row opens its form', await page.locator('[data-tform]').count() === 1 && (await page.locator('[data-tform] h3').innerText()) === 'Tideline');
  check('the form holds the row’s values', (await page.inputValue('[data-tform] textarea[name="what"]')).startsWith('Client onboarding'));
  await page.fill('[data-tform] textarea[name="effort"]', 'High');
  await page.click('[data-tform] .save');
  await page.waitForSelector('[data-tform]', { state: 'detached' });
  const upd = calls.filter(c => c.name === 'update_thought');
  check('saving calls update_thought once', upd.length === 1, upd.length);
  check('…with today’s date as updated_date', upd[0] && /^\d{4}-\d\d-\d\d$/.test(upd[0].args.updated_date));
  check('the stored table has the new value', stored().rows[0].effort === 'High', stored().rows[0]);
  check('the rest of the note is kept', /^# Project register\n\n```table/.test(notes[0].content) && /## How to read it\nEfforts are rough\.$/.test(notes[0].content));
  check('the stored block keeps one row per line', notes[0].content.split('\n').filter(l => l.startsWith('{"name"')).length === 2);
  cells = await cellTexts();
  check('the page shows the saved value', cells[0][2] === 'High');

  // --- a link in a cell opens the link, not the form ---
  await page.locator('.rg td a').evaluate(a => { a.removeAttribute('target'); a.addEventListener('click', e => e.preventDefault()); });
  await page.click('.rg td a');
  check('clicking a link in a cell does not open the form', await page.locator('[data-tform]').count() === 0);

  // --- add a row, with a backtick fence in it ---
  await page.click('[data-tadd]');
  check('Add a row opens an empty form', (await page.locator('[data-tform] h3').innerText()) === 'New row' && (await page.inputValue('[data-tform] textarea[name="name"]')) === '');
  await page.click('[data-tform] .save');
  check('an empty row is refused', /at least one/.test(await page.locator('#terr').innerText()));
  await page.fill('[data-tform] textarea[name="name"]', 'Sustainability Watch');
  await page.fill('[data-tform] textarea[name="what"]', 'Weekly digest\nwith ``` fences');
  await page.click('[data-tform] .save');
  await page.waitForSelector('[data-tform]', { state: 'detached' });
  check('the new row is stored at the end', stored().rows.length === 3 && stored().rows[2].name === 'Sustainability Watch');
  check('a ``` in a cell does not break the note', stored().rows[2].what === 'Weekly digest\nwith ``` fences');
  cells = await cellTexts();
  check('line breaks in a cell are kept', cells.length === 3 && /Weekly digest\nwith/.test(cells[2][1]), cells[2]);

  // --- a failed save leaves things as they were ---
  const before = notes[0].content;
  await page.unroute(u => u.href.startsWith(MCP));
  await page.route(u => u.href.startsWith(MCP), route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' }));
  await page.click('.rg tbody tr >> nth=1');
  await page.fill('[data-tform] textarea[name="effort"]', 'Changed');
  await page.click('[data-tform] .save');
  await page.waitForFunction(() => /Could not save/.test(document.querySelector('#terr').textContent));
  check('a failed save says so and keeps the form open', await page.locator('[data-tform]').count() === 1);
  check('a failed save leaves the note alone', notes[0].content === before);
  await page.unroute(u => u.href.startsWith(MCP));
  await page.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.click('[data-tcancel]');
  cells = await cellTexts();
  check('Cancel closes the form and nothing changed', await page.locator('[data-tform]').count() === 0 && cells[1][2] === 'Low');

  // --- delete a row ---
  confirmAnswer = false;
  await page.click('.rg tbody tr >> nth=1');
  await page.click('[data-tdel]');
  check('saying no to delete keeps the row', stored().rows.length === 3);
  confirmAnswer = true;
  await page.click('[data-tdel]');
  await page.waitForSelector('[data-tform]', { state: 'detached' });
  check('delete removes the row', stored().rows.map(r => r.name).join() === 'Tideline,Sustainability Watch', stored().rows.map(r => r.name));

  // --- CSV out ---
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-tcsv]')]);
  check('the CSV is named after the note', dl.suggestedFilename() === 'Project register.csv', dl.suggestedFilename());
  const csvPath = path.join(os.tmpdir(), 'aidesk-test.csv');
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('the CSV starts with a byte-order mark for Excel', csv.charCodeAt(0) === 0xfeff);
  check('the CSV has headings and rows', csv.slice(1).split('\r\n')[0] === 'Project,What it is,Effort', csv.slice(0, 60));
  check('fields with commas, quotes and line breaks are quoted', csv.includes('"Weekly digest\nwith ``` fences"'));

  // --- CSV back in (edited in Excel: a row added, columns reordered, an extra column) ---
  const edited = 'Effort,Project,Notes,What it is\r\nHigh,Tideline,x,"Onboarding, triage"\r\nMedium,Trips,,"Wallet ""v2"""\r\n,New one,,\r\n';
  await page.setInputFiles('[data-tupload]', { name: 'edited.csv', mimeType: 'text/csv', buffer: Buffer.from(edited) });
  await page.waitForFunction(() => document.querySelectorAll('.rg tbody tr').length === 3);
  const s = stored();
  check('upload replaces the rows', s.rows.length === 3 && s.rows.map(r => r.name).join() === 'Tideline,Trips,New one', s.rows);
  check('upload matches columns by heading, in any order', s.rows[1].what === 'Wallet "v2"' && s.rows[1].effort === 'Medium', s.rows[1]);
  check('an unknown column is skipped', !('Notes' in s.rows[0]) && !('notes' in s.rows[0]));
  check('the table’s columns are unchanged', s.columns.length === 3);

  // --- print layout, at phone width too ---
  await page.setViewportSize({ width: 400, height: 860 });
  await page.emulateMedia({ media: 'print' });
  const vis = (sel) => page.locator(sel).first().evaluate(el => getComputedStyle(el).display !== 'none');
  check('print hides the sidebar and list', !(await vis('nav')) && !(await vis('.list')));
  check('print hides the buttons', !(await vis('.tools')) && !(await vis('.rg-bar')));
  check('print shows the page itself', await vis('.detail') && await vis('.rg table'));
  check('print is dark ink on white', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- a normal note prints portrait; health pages have the button too ---
  await page.click('[data-sec="AI weekly update"]');
  await page.click('[data-pdf]');
  prints = await page.evaluate(() => window.__prints);
  check('a text note prints portrait, named after it', prints[1] && !prints[1].landscape && prints[1].title === 'AI Desk - Last week in AI', prints[1]);
  await page.click('[data-sec="__health"]');
  check('System health has Download PDF', await page.locator('[data-pdf]').count() === 1);

  // --- the colleague copy ---
  const shared = shareBuild(fs.readFileSync(FILE, 'utf8'), { built: '2026-10-14T09:00:00Z', notes: [notes[0], notes[1]] });
  check('the share build drops the editing and PDF code', !/printPage|saveTable|data-tadd|rowForm\(|Upload CSV/.test(shared));
  const sharedPath = path.join(os.tmpdir(), 'aidesk-shared.html');
  fs.writeFileSync(sharedPath, shared);
  const p2 = await ctx.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto('file://' + sharedPath);
  await p2.waitForSelector('.shell');
  check('the colleague copy runs without errors', errs2.length === 0, errs2);
  check('the colleague copy has no Download PDF button', await p2.locator('[data-pdf]').count() === 0);
  check('the colleague copy has no private sections', !/Project register/.test(await p2.locator('nav').innerText()));
  // Even if a table note were shared, it would be read-only there.
  await p2.evaluate(() => { notes[0].section = 'AI weekly update'; state.section = 'AI weekly update'; state.noteId = notes[0].id; render(); });
  check('a shared table is read-only', await p2.locator('.rg table').count() === 1 && await p2.locator('[data-trow], .rg-bar').count() === 0);

  await browser.close();
  let failed = 0;
  for (const r of results) { if (!r.ok) failed++; console.log((r.ok ? 'ok   ' : 'FAIL ') + r.label + (r.ok || r.extra === undefined ? '' : '  → ' + JSON.stringify(r.extra))); }
  for (const e of errors) console.log(e);
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed' + (errors.length ? ', ' + errors.length + ' page errors' : ''));
  process.exit(failed || errors.length ? 1 : 0);
})();
