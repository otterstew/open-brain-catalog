// Drives the catalog's task view in a real browser against a stubbed MCP server,
// so the UI is checked against the same tool contract the edge function
// implements — no deployment and no access key needed.
//
//   npm i playwright
//   node tests/task_view_test.js
//
// A browser is already present in CI-style images at PLAYWRIGHT_BROWSERS_PATH;
// set CHROME_PATH to point somewhere else.

const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';
const TODAY = new Date().toISOString().slice(0, 10);
const day = n => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };

let tasks = [
  { id: 't1', title: 'Overdue thing', status: 'next', due_date: day(-3), project: 'house',
    notes: '', defer_until: null, recur: null, recur_from: 'completion', thought_id: null,
    created_at: '2026-08-01T00:00:00Z', completed_at: null },
  { id: 't2', title: 'Due today thing', status: 'inbox', due_date: TODAY, project: null,
    notes: '', defer_until: null, recur: 'weekly', recur_from: 'completion', thought_id: null,
    created_at: '2026-08-02T00:00:00Z', completed_at: null },
  { id: 't3', title: 'Later thing', status: 'waiting', due_date: day(20), project: null,
    notes: 'blocked on someone', defer_until: null, recur: null, recur_from: 'completion',
    thought_id: 'th-9', created_at: '2026-08-03T00:00:00Z', completed_at: null },
  { id: 't4', title: 'No date thing', status: 'inbox', due_date: null, project: null,
    notes: '', defer_until: null, recur: null, recur_from: 'completion', thought_id: null,
    created_at: '2026-08-04T00:00:00Z', completed_at: null },
];

const calls = [];

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

  if (name === 'list_thoughts') return reply(JSON.stringify([
    { id: 'th-9', content: 'A note that exists so the facet bar has something to show.',
      created_at: '2026-08-01T00:00:00Z',
      metadata: { type: 'reference', title: 'A note', topics: ['x'], author: 'Someone',
                  source_name: 'Somewhere', people: ['A Person'] } },
  ]));
  if (name === 'list_tasks') {
    const open = ['inbox', 'next', 'waiting'];
    const want = args.status && args.status.length ? args.status : open;
    return reply(JSON.stringify(tasks.filter(t => want.includes(t.status))));
  }
  if (name === 'create_task') {
    tasks.push({ id: 'new' + tasks.length, title: args.title, status: 'inbox',
      due_date: args.due_date || null, project: args.project || null, notes: '',
      defer_until: null, recur: null, recur_from: 'completion', thought_id: null,
      created_at: new Date().toISOString(), completed_at: null });
    return reply('Created task "' + args.title + '"');
  }
  if (name === 'complete_task') {
    const t = tasks.find(x => x.id === args.id);
    if (t) t.status = 'done';
    return reply('Completed "' + (t ? t.title : '?') + '". Next one due ' + day(7) + '.');
  }
  if (name === 'update_task') {
    const t = tasks.find(x => x.id === args.id);
    if (t) Object.keys(args).forEach(k => { if (k !== 'id') t[k] = args[k]; });
    return reply('Updated');
  }
  if (name === 'delete_task') {
    tasks = tasks.filter(x => x.id !== args.id);
    return reply('Deleted');
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
    // Google Fonts cannot be reached from this sandbox; not our bug.
    if (!/fonts\.(googleapis|gstatic)/.test(t) && !/Failed to load resource/.test(t)) errors.push('CONSOLE: ' + t);
  }});

  await page.route(u => u.href.startsWith(MCP), async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const res = handle(body);
    if (res === null) return route.fulfill({ status: 202, body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });

  await ctx.addInitScript(() => { localStorage.setItem('openbrain.accessKey', 'test-key'); });
  await page.goto(PAGE);
  await page.waitForTimeout(800);

  const results = [];
  const check = (label, ok, extra) => { results.push({ label, ok, extra }); };

  // --- the quick-add syntax, exercised in the page ---
  const parserCases = await page.evaluate((today) => {
    const qa = s => parseQuickAdd(s, today);
    const D = n => { const d = new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000);
                     return d.toISOString().slice(0, 10); };
    return [
      ['plain', qa('Call the dentist'), {title:'Call the dentist', due_date:null, project:null}],
      ['project', qa('Call the dentist #health'), {title:'Call the dentist', due_date:null, project:'health'}],
      ['project mid-string', qa('Call #health the dentist'), {title:'Call the dentist', due_date:null, project:'health'}],
      ['last project wins', qa('x #a #b'), {title:'x', due_date:null, project:'b'}],
      ['due today', qa('Bins due:today'), {title:'Bins', due_date:D(0), project:null}],
      ['due tomorrow', qa('Bins due:tomorrow'), {title:'Bins', due_date:D(1), project:null}],
      ['iso date', qa('Renew due:2026-09-01'), {title:'Renew', due_date:'2026-09-01', project:null}],
      ['multi-word date', qa('Renew due:1 Sep 2026'), {title:'Renew', due_date:'2026-09-01', project:null}],
      ['day-first slashes', qa('Renew due:01/09/2026'), {title:'Renew', due_date:'2026-09-01', project:null}],
      ['both markers', qa('Pay rent #home due:2026-09-01'), {title:'Pay rent', due_date:'2026-09-01', project:'home'}],
      ['case insensitive', qa('Bins DUE:today'), {title:'Bins', due_date:D(0), project:null}],
      // Things that must NOT be treated as markers.
      ['unreadable date kept in title', qa('Ring mum due:whenever'), {title:'Ring mum due:whenever', due_date:null, project:null}],
      ['bare due: kept', qa('Think about due:'), {title:'Think about due:', due_date:null, project:null}],
      ['overdue is not a marker', qa('Chase the overdue invoice'), {title:'Chase the overdue invoice', due_date:null, project:null}],
      ['mid-word hash', qa('Fix issue C#12'), {title:'Fix issue C#12', due_date:null, project:null}],
      ['impossible date refused', qa('x due:2026-02-31'), {title:'x due:2026-02-31', due_date:null, project:null}],
      ['whitespace tidied', qa('   spaced   out   '), {title:'spaced out', due_date:null, project:null}],
    ];
  }, TODAY);
  parserCases.forEach(([label, got, want]) => {
    check('quick-add: ' + label, JSON.stringify(got) === JSON.stringify(want), { got, want });
  });

  // --- switch to tasks ---
  await page.click('#modeTasks');
  await page.waitForTimeout(500);

  const groups = await page.$$eval('.task-group span:first-child', els => els.map(e => e.textContent));
  check('groups in order', JSON.stringify(groups) === JSON.stringify(['Overdue','Today','Later','No date']), groups);

  const titles = await page.$$eval('.task-title', els => els.map(e => e.textContent));
  check('all four tasks listed', titles.length === 4, titles);

  const overdueTone = await page.$eval('.task-sub .due', e => e.className);
  check('overdue styled late', overdueTone.includes('late'), overdueTone);

  const badge = await page.$eval('#modeTasksN', e => e.textContent);
  check('badge counts due+overdue only', badge === '2', badge);

  const repeat = await page.$$eval('.task-sub .repeat', els => els.map(e => e.textContent.trim()));
  check('repeat shown', repeat.length === 1 && /weekly/.test(repeat[0]), repeat);

  const noteLink = await page.$$eval('.task-sub .note-link', els => els.length);
  check('linked-note marker shown', noteLink === 1, noteLink);

  // Visibility is asserted from computed style, never from the hidden
  // attribute: any class that sets display overrides it, which is exactly the
  // bug an attribute check sails straight past.
  const shown = sel => page.evaluate(s => {
    const e = document.querySelector(s);
    return !!e && getComputedStyle(e).display !== 'none';
  }, sel);

  check('search box hidden in task mode', !(await shown('#searchRow')));
  check('quick-add box shown', await shown('#taskAddRow'));
  check('facet bar hidden in task mode', !(await shown('.facet-bar')));
  for (const id of ['newBtn', 'statsBtn', 'importBtn']) {
    check(id + ' hidden in task mode', !(await shown('#' + id)));
  }
  for (const id of ['lockBtn', 'refreshBtn']) {
    check(id + ' still shown', await shown('#' + id));
  }

  // --- quick add, with the little syntax ---
  await page.fill('#taskAddInput', 'Pay the window cleaner #house due:tomorrow');
  await page.press('#taskAddInput', 'Enter');
  await page.waitForTimeout(500);
  const created = calls.filter(c => c.name === 'create_task').pop();
  check('quick add parsed title', created && created.args.title === 'Pay the window cleaner', created && created.args);
  check('quick add parsed project', created && created.args.project === 'house', created && created.args.project);
  check('quick add parsed due', created && created.args.due_date === day(1), created && created.args.due_date);
  const boxCleared = await page.$eval('#taskAddInput', e => e.value);
  check('quick-add box cleared', boxCleared === '', boxCleared);

  // --- tick one off ---
  const before = tasks.filter(t => t.status !== 'done').length;
  await page.click('.task-row .task-tick');
  await page.waitForTimeout(500);
  const completed = calls.filter(c => c.name === 'complete_task').pop();
  check('tick called complete_task', !!completed, completed);
  check('completed the overdue one', completed && completed.args.id === 't1', completed && completed.args.id);
  const after = await page.$$eval('.task-title', els => els.length);
  check('completed task left the list', after === before - 1, { before, after });

  // --- open one and edit it ---
  await page.click('.task-open >> nth=0');
  await page.waitForTimeout(300);
  const hasDetail = await page.$('.task-detail');
  check('detail pane opened', !!hasDetail);

  await page.fill('#tdTitle', 'Renamed task');
  await page.fill('#tdDue', 'friday');
  await page.click('#tdSave');
  await page.waitForTimeout(600);
  const upd = calls.filter(c => c.name === 'update_task').pop();
  check('save sent new title', upd && upd.args.title === 'Renamed task', upd && upd.args.title);
  check('save turned "friday" into a date', upd && /^\d{4}-\d{2}-\d{2}$/.test(upd.args.due_date || ''), upd && upd.args.due_date);

  // a date it cannot read must stop the save, not drop the value
  await page.fill('#tdDue', 'whenever');
  const updCountBefore = calls.filter(c => c.name === 'update_task').length;
  await page.click('#tdSave');
  await page.waitForTimeout(400);
  const updCountAfter = calls.filter(c => c.name === 'update_task').length;
  const msg = await page.$eval('#tdStatusMsg', e => e.textContent);
  check('bad date blocks the save', updCountAfter === updCountBefore, { updCountBefore, updCountAfter });
  check('bad date explains itself', /not recognised/i.test(msg), msg);

  // an empty title is refused too
  await page.fill('#tdDue', '');
  await page.fill('#tdTitle', '   ');
  await page.click('#tdSave');
  await page.waitForTimeout(300);
  const msg2 = await page.$eval('#tdStatusMsg', e => e.textContent);
  check('empty title refused', /needs a title/i.test(msg2), msg2);

  // --- delete needs two presses ---
  await page.fill('#tdTitle', 'Renamed task');
  const delCountBefore = calls.filter(c => c.name === 'delete_task').length;
  await page.click('#tdDelete');
  await page.waitForTimeout(200);
  check('first delete press only arms', calls.filter(c => c.name === 'delete_task').length === delCountBefore);
  const delLabel = await page.$eval('#tdDelete', e => e.textContent.trim());
  check('delete button re-labels', /really/i.test(delLabel), delLabel);
  await page.click('#tdDelete');
  await page.waitForTimeout(500);
  check('second press deletes', calls.filter(c => c.name === 'delete_task').length === delCountBefore + 1);

  // --- back to notes ---
  await page.click('#modeNotes');
  await page.waitForTimeout(400);
  check('notes mode restores the search box', await shown('#searchRow'));
  check('notes mode hides the quick-add box', !(await shown('#taskAddRow')));
  check('notes mode restores the facet bar', await shown('.facet-bar'));
  check('notes mode restores the new-note button', await shown('#newBtn'));

  // --- the done filter asks the server for done tasks ---
  await page.click('#modeTasks');
  await page.waitForTimeout(400);
  await page.click('.chip >> nth=4');
  await page.waitForTimeout(500);
  const doneCall = calls.filter(c => c.name === 'list_tasks').pop();
  check('done filter queries done', doneCall && JSON.stringify(doneCall.args.status) === '["done"]', doneCall && doneCall.args);

  await browser.close();

  let fails = 0;
  results.forEach(r => {
    if (!r.ok) { fails++; console.log('FAIL  ' + r.label + '  ->  ' + JSON.stringify(r.extra)); }
  });
  console.log(`\n${results.length - fails} passed, ${fails} failed`);
  if (errors.length) { console.log('\nJS errors on the page:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fails || errors.length ? 1 : 0);
})();
