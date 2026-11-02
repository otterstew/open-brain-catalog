// Drives the graph's Explore tab and the phone's note list in a real browser,
// against a stubbed MCP server holding a small made-up archive.
//
//   npm i playwright
//   node tests/explore_test.js
//
// Set CHROME_PATH to use a browser other than Playwright's own.

const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MCP = 'https://uftlxeahciewiitclkbu.supabase.co/functions/v1/open-brain-mcp';

const id = i => '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0');
const PEOPLE = ['Rob Burbea', 'Tara Brach', 'Ethan Mollick', 'Simon Willison', 'Ruth King', 'Sam Harris'];
const TOPICS = ['Meditation', 'AI tools', 'Health', 'Book'];
const thoughts = [];
for (let i = 0; i < 60; i++) {
  const people = [PEOPLE[i % PEOPLE.length]];
  if (i % 3 === 0) people.push(PEOPLE[(i + 1) % PEOPLE.length]);
  if (i % 4 === 0) people.push('Stewart');
  thoughts.push({ id: id(i), content: 'Body of note ' + i, created_at: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
    metadata: { type: i % 2 ? 'observation' : 'reference', title: 'Note number ' + i,
      topics: [TOPICS[i % TOPICS.length]], people, source_name: i % 5 ? 'Kindle' : 'YouTube',
      linked_thought_ids: i ? [id(i - 1)] : [] } });
}

function handle(body) {
  const { method, params, id: rid } = body;
  const reply = text => ({ jsonrpc: '2.0', id: rid, result: { content: [{ type: 'text', text }] } });
  if (method !== 'tools/call') return { jsonrpc: '2.0', id: rid, result: {} };
  if (params.name === 'list_thoughts') return reply(JSON.stringify((params.arguments || {}).topic ? [] : thoughts));
  if (params.name === 'topic_vocabulary') return reply(JSON.stringify({ headings: {}, sides: {}, personal: {} }));
  return reply('[]');
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(u => u.href.startsWith(MCP), async route => {
    const res = handle(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('openbrain.accessKey', 'test-key'); });
  await page.goto(PAGE);
  await page.waitForTimeout(900);

  const results = [];
  const check = (label, ok, extra) => results.push({ label, ok, extra });
  const G = '.drawer-graph ';

  // --- the overview: every person a labelled name, Stewart left out ---
  const names = await page.$$eval(G + '.ex-pill .ex-l', els => els.map(e => e.textContent));
  check('explore opens by default, on people', names.length === PEOPLE.length, names);
  check('every person named', PEOPLE.every(p => names.includes(p)), names);
  check('Stewart is not a name', !names.some(n => /stewart/i.test(n)), names);
  const overlaps = await page.$$eval(G + '.ex-pill', els => {
    const r = els.map(e => e.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) n++;
    }
    return n;
  });
  check('names do not overlap', overlaps === 0, overlaps);
  const inside = await page.$eval(G + '.explore-stage', st => {
    const b = st.getBoundingClientRect();
    return [...st.querySelectorAll('.ex-pill')].every(p => {
      const r = p.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
  });
  check('names stay inside the box', inside);

  // --- tap a person: they move to the middle with their notes around ---
  await page.click(G + '.ex-pill[data-ex-key="person:rob burbea"]');
  await page.waitForTimeout(600);
  const center = await page.$eval(G + '.ex-center .ex-l', e => e.textContent);
  check('tapped person is in the middle', center === 'Rob Burbea', center);
  const crumbs = await page.$$eval(G + '.ex-crumbs button', els => els.map(e => e.textContent));
  check('trail reads People › Rob Burbea', JSON.stringify(crumbs) === JSON.stringify(['People', 'Rob Burbea']), crumbs);
  const robNotes = thoughts.filter(t => t.metadata.people.includes('Rob Burbea')).length;
  const listed = await page.$$eval(G + '.ex-group:first-child .ex-rows li', els => els.length);
  check('all their notes are listed', listed === robNotes, { listed, robNotes });
  const around = await page.$$eval(G + '.ex-pill:not(.ex-center)', els => els.map(e => e.dataset.exKey));
  check('notes, people and topics around them',
    around.some(k => k.startsWith('note:')) && around.some(k => k.startsWith('person:')) && around.some(k => k.startsWith('topic:')), around);

  // --- on to a note, then back by the trail ---
  const noteKey = around.find(k => k.startsWith('note:'));
  await page.click(G + '.ex-pill[data-ex-key="' + noteKey + '"]');
  await page.waitForTimeout(600);
  check('a note can be the middle', await page.$eval(G + '.ex-center', e => e.dataset.exKey) === noteKey);
  check('a note offers Read', !!(await page.$(G + '.explore-actions [data-ex-open]')));
  await page.click(G + '[data-ex-back]');
  await page.waitForTimeout(500);
  check('Back returns to the person', await page.$eval(G + '.ex-center .ex-l', e => e.textContent) === 'Rob Burbea');
  await page.click(G + '[data-ex-crumb="0"]');
  await page.waitForTimeout(500);
  check('the first crumb returns to the overview', !(await page.$(G + '.ex-center')));

  // --- the lens ---
  await page.click(G + '[data-elens="topics"]');
  await page.waitForTimeout(400);
  const topics = await page.$$eval(G + '.ex-pill .ex-l', els => els.map(e => e.textContent).sort());
  check('Topics lens names the topics', JSON.stringify(topics) === JSON.stringify([...TOPICS].sort()), topics);
  await page.click(G + '[data-elens="people"]');
  await page.waitForTimeout(400);

  // --- from Explore into the drawer's list ---
  await page.click(G + '.ex-pill[data-ex-key="person:tara brach"]');
  await page.waitForTimeout(500);
  await page.click(G + '[data-ex-filter]');
  await page.waitForTimeout(500);
  check('List in the drawer filters by the person',
    JSON.stringify(await page.evaluate(() => [...activePeople])) === '["tara brach"]');

  // --- the phone's list head ---
  const chip = await page.$$eval('.lh-chip', els => els.map(e => e.textContent));
  check('list head shows the filter as a chip', chip.length === 1 && /Tara Brach/.test(chip[0]), chip);
  const headTop = await page.$eval('#listHead', e => Math.round(e.getBoundingClientRect().top));
  check('list brought up under its head', headTop === 0, headTop);
  await page.click('.lh-chip');
  await page.waitForTimeout(400);
  check('the chip removes the filter', await page.evaluate(() => activePeople.size) === 0);

  // --- picking from the People panel closes it ---
  await page.evaluate(() => { document.querySelector('.drawer').scrollTop = 0; });
  await page.click('#facetBtnPeople');
  await page.waitForTimeout(300);
  await page.click('#facetChips .chip >> nth=0');
  await page.waitForTimeout(400);
  check('panel closes after a pick on a phone', await page.$eval('#facetPanel', e => e.hidden));
  check('the pick still filters', await page.evaluate(() => activePeople.size) === 1);
  const rowsVisible = await page.$$eval('.card-row', els => els.filter(e => {
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }).length);
  check('several notes visible after the pick', rowsVisible >= 4, rowsVisible);

  // --- back from a note keeps the place in the list ---
  await page.click('.lh-chip');
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('.drawer').scrollTop = 1500; });
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => document.querySelector('.drawer').scrollTop);
  const row = await page.$$('.card-row');
  for (const r of row) { const b = await r.boundingBox(); if (b && b.y > 100) { await r.click(); break; } }
  await page.waitForTimeout(400);
  await page.click('.back-btn');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.querySelector('.drawer').scrollTop);
  check('Back from a note keeps the list where it was', Math.abs(after - before) < 2, { before, after });

  check('no page errors', errors.length === 0, errors);
  results.forEach(r => console.log((r.ok ? 'ok   ' : 'FAIL ') + r.label + (r.ok ? '' : '  ' + JSON.stringify(r.extra))));
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
