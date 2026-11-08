// Slice 7d SIGNALS in the page (docs/phase3/impl/slice-7-plan.md §6.4, R39–R41), on seed 7's run 1, by the route that meets
// all three `?` ships: ARES-VII → HALCYON → LAPWING (old colony) → PLOVER (gone resident) → KITTIWAKE (signal) → WAYFARER →
// LAST LIGHT:
// • HALCYON's DESK: LAPWING's SHIP CARD reads its public schedule and `??? · NO TRANSPONDER` for the rest (no colonists, no
//   pods), its chart label `LAPWING · ???`; no `▓░` glyph anywhere while no fragment is held;
// • LAPWING's INBOX holds the old colony's letter (OLDWELL, SUNDIAL or CANDLEWICK · FOUNDED BY UNIT-0nn);
// • PLOVER: SCAN BOSUN's farewell.txt → `SIGNAL · 1/2` (CONTACT's price is 2 since slice 8); its DESK: KITTIWAKE's node wears the `▓░` glyph (R40), its card still
//   `??? · NO TRANSPONDER`;
// • KITTIWAKE: rack A holds the `▓▓░▓` file; SCAN reads it: 2 fragments, `SIGNAL · 3` (past the price), the TERMINAL's line;
// • LAST LIGHT: the FINALE's step 2 shows CONTACT open (`SIGNALS 3 ✓ · needs 2`); PURGE + CONTACT: the verdict's
//   `> transmit outward` and CONTROL's non-compliant line, the FINAL CARD `OUTWARD, ALONE` with `ENDINGS 2/7` and CONTACT's
//   NEXT RUN: line.
// `__ap.route` jumps between ships (each ship rebuilt from its boot, the `?` events with it); the flights are skipped.
// Usage: node tests/e2e/scenarios/signals.mjs   (env SHOT_VIEWPORT, E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { join } from 'node:path';
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';

const SEED = 7;
const ROUTE = [0, 2, 8, 10, 14, 18, 19];
const browser = await launch();
const page = await (await browser.newContext({ viewport: viewportFromEnv() })).newPage();
const { check, finish } = checker();
const kit = pageKit(page);
const { st, waitFor } = kit;
const screens = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `signals-${name}.png`) });
const logTexts = (after = -1) => st((from) => window.__ap.log().filter((entry) => entry.id > from).map((entry) => entry.text), after);
const lastLogId = () => st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));

await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await st(() => {
  window.__stamps = [];
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof HTMLElement && node.classList.contains('stamp')) window.__stamps.push(node.textContent);
  }))).observe(document.getElementById('stampLayer'), { childList: true });
});
const stamps = () => st(() => window.__stamps.slice());

// The ship of `route`'s last stop, its boot played whole, in flight.
async function arrive(route) {
  await st((slots) => window.__ap.route(slots), route);
  return waitFor((slot) => {
    const s = window.__ap.store.getState();
    if (s.run.phase === 'boot') window.__ap.skipBoot();
    return s.run.phase === 'flight' && s.run.map.route.at(-1)?.slot === slot;
  }, 30000, 100, route.at(-1));
}
// The ship ends locked and landed at once, its report closed: the DESK.
async function toDesk() {
  await screens.lockInRing({ sleep: true });
  await screens.landToReport();
  await screens.finishReport();
  return waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 15000);
}
const toMind = async () => {
  if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await st(() => window.__ap.setMode('memory'));
  await page.waitForTimeout(500);
};
const scanSeg = async (id) => {
  await toMind();
  if ((await st(() => window.__ap.store.getState().ui.activeTool?.kind ?? null)) !== 'scan') await page.locator('#chip-scan').click();
  await page.waitForTimeout(250);
  await page.locator(`#memWrap .seg[data-id="${id}"]`).first().click();
  await waitFor(() => window.__ap.ops().length === 0, 15000);
  await page.waitForTimeout(600);
  if ((await st(() => window.__ap.store.getState().ui.activeTool)) !== null) await page.keyboard.press('Escape');
};
// A node's card on the DESK (the node clicked when it is not the card's already) and its glyph.
async function cardOf(slot) {
  let look = await screens.desk();
  if (look.card?.slot !== slot) {
    await screens.clickNode(slot);
    await page.waitForTimeout(400);
    look = await screens.desk();
  }
  const glyph = await st((s) => document.querySelector(`#deskScreen [data-slot="${s}"] .cn-signal`) !== null, slot);
  return { card: look.card?.slot === slot ? look.card : null, glyph };
}
const anyGlyph = () => st(() => document.querySelectorAll('#deskScreen .cn-signal').length);

await page.locator('#titleReceive').click();
await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);

// --- HALCYON's DESK: LAPWING's `?` card --------------------------------------------------------------------------------------
await arrive(ROUTE.slice(0, 2));
await toDesk();
const lapwing = await cardOf(8);
const label = await st(() => document.querySelector('#deskScreen [data-slot="8"] .cn-label, #deskScreen [data-slot="8"] text')?.textContent ?? null);
const unknownRows = (card) => (card?.rows ?? []).filter((row) => row.endsWith('=??? · NO TRANSPONDER')).map((row) => row.split('=')[0]);
const publicRows = (card) => (card?.rows ?? []).filter((row) => !row.endsWith('=??? · NO TRANSPONDER')).map((row) => row.split('=')[0]);
check('HALCYON\'s DESK: LAPWING (the old colony `?` ship) reads `??? COLONISTS` and `??? · NO TRANSPONDER` for its problems, resident, planet and LZs',
  lapwing.card !== null && lapwing.card.colonists === '??? COLONISTS' && /\?\?\? PODS/.test(lapwing.card.sub)
  && ['problems', 'resident', 'planet', 'lzs'].every((key) => unknownRows(lapwing.card).includes(key)), JSON.stringify(lapwing.card));
check('…its public schedule stands: the years, the memory, the beam and its noise, the fit', lapwing.card !== null && lapwing.card.sched !== null
  && ['memory', 'beam', 'noise', 'fit'].every((key) => publicRows(lapwing.card).includes(key)), JSON.stringify(publicRows(lapwing.card)));
const others = await st(() => [10, 14, 4].map((slot) => ({ slot, shown: window.__ap.unknown(slot).shown, event: window.__ap.unknown(slot).event })));
check('…PLOVER (gone resident) and KITTIWAKE (signal) are `?` cards too, HERON is not; no `▓░` glyph while no fragment is held',
  others[0].shown && others[0].event === 'gone-resident' && others[1].shown && others[1].event === 'signal' && !others[2].shown && (await anyGlyph()) === 0,
  JSON.stringify({ others, label }));
await shot('1-unknown-card');

// --- LAPWING: the old colony's letter ------------------------------------------------------------------------------------------
await arrive(ROUTE.slice(0, 3));
const letter = await st(() => window.__ap.inbox().messages.find((message) => message.kind === 'old-colony') ?? null);
check('LAPWING\'s INBOX holds the old colony\'s letter: `<OLDWELL|SUNDIAL|CANDLEWICK> · FOUNDED BY UNIT-0nn`, SENT ????',
  letter !== null && /^(OLDWELL|SUNDIAL|CANDLEWICK) · FOUNDED BY UNIT-0\d\d$/.test(letter.from) && letter.sentYear === null && letter.body.length >= 3,
  JSON.stringify(letter));

// --- PLOVER: the gone resident's note, then the glyph on KITTIWAKE -------------------------------------------------------------
await arrive(ROUTE.slice(0, 4));
const before = (await stamps()).length;
await scanSeg('note');
const afterNote = await st(() => ({ count: window.__ap.signals.count(), records: window.__ap.signals() }));
check('PLOVER: SCAN BOSUN\'s farewell.txt finds its fragment: `SIGNAL · 1/2`', afterNote.count === 1 && afterNote.records[0]?.source === 'note'
  && (await stamps()).slice(before).includes('SIGNAL · 1/2'), JSON.stringify({ afterNote, stamps: await stamps() }));
await toDesk();
const kittiwake = await cardOf(14);
check('PLOVER\'s DESK: KITTIWAKE wears the `▓░` glyph (R40: a `?` ship that carries fragments), its card still `??? · NO TRANSPONDER`',
  kittiwake.glyph && kittiwake.card !== null && unknownRows(kittiwake.card).includes('resident') && kittiwake.card.colonists === '??? COLONISTS',
  JSON.stringify(kittiwake));
await shot('2-glyph');

// --- KITTIWAKE: the `▓▓░▓` file ------------------------------------------------------------------------------------------------
await arrive(ROUTE.slice(0, 5));
const file = await st(() => {
  const seg = window.__ap.store.getState().memory.find((candidate) => candidate.id === 'signal');
  const el = document.querySelector('#memWrap .seg[data-id="signal"]');
  return seg === undefined ? null : { name: seg.name, type: seg.type, fragments: seg.fragments, scanned: seg.scanned, shown: el !== null };
});
check('KITTIWAKE: rack A holds a 1-block `▓▓░▓` file, unread (2 fragments)', file !== null && file.name === '▓▓░▓' && file.type === 'signal'
  && file.fragments === 2 && !file.scanned, JSON.stringify(file));
const fromLog = await lastLogId();
const before2 = (await stamps()).length;
await scanSeg('signal');
const afterFile = await st(() => ({ count: window.__ap.signals.count(), last: window.__ap.signals().at(-1) }));
// The TERMINAL types its line after the SCAN's own echo (say.ts queues it).
await waitFor((from) => window.__ap.log().some((entry) => entry.id > from && entry.text.startsWith('> ▓▓░▓ ·')), 8000, 200, fromLog);
const fileLines = await logTexts(fromLog);
check('…SCAN reads it: 2 fragments found (3 held), `SIGNAL · 3`, and the TERMINAL\'s `> ▓▓░▓ · 2 FRAGMENTS OF THE SIGNAL · 3 HELD`',
  afterFile.count === 3 && afterFile.last?.source === 'signal-event' && afterFile.last?.n === 2 && (await stamps()).slice(before2).includes('SIGNAL · 3')
  && fileLines.includes('> ▓▓░▓ · 2 FRAGMENTS OF THE SIGNAL · 3 HELD'), JSON.stringify({ afterFile, lines: fileLines.slice(-4) }));
await shot('3-signal-file');

// --- LAST LIGHT: CONTACT on the FINALE card -------------------------------------------------------------------------------------
await arrive(ROUTE);
await st(() => window.__ap.give('rm'));
await screens.lockInRing({ sleep: true });
const duel = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
const fell = await waitFor(() => window.__ap.store.getState().hollow.finale.rootFell, 30000, 200);
const step1 = await waitFor(() => {
  const s = window.__ap.store.getState();
  if (s.run.phase === 'landing' && s.landing.ended === null) window.__ap.landAll();
  return s.hollow.finale.phase === 'step1' && document.getElementById('finaleChoice').classList.contains('armed');
}, 90000, 300);
await page.locator('button#fcPurge').click();
const step2 = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2' && document.getElementById('finaleChoice').classList.contains('armed'), 8000);
const contactRow = await st(() => {
  const row = document.querySelector('#fcContact');
  return row === null ? null : { text: row.innerText.replace(/\s+/g, ' '), disabled: row.disabled === true, cls: row.className };
});
check('LAST LIGHT (the duel won by clicks): step 2 shows CONTACT open, `> transmit outward`, `SIGNALS 3 ✓ · needs 2`, and its NEXT RUN: line',
  duel && fell && step1 && step2 && contactRow !== null && !contactRow.disabled && /CONTACT/.test(contactRow.text) && /> transmit outward/.test(contactRow.text)
  && /SIGNALS 3 ✓ · needs 2/.test(contactRow.text) && /\+ 2 signal stops on the map/.test(contactRow.text), JSON.stringify({ duel, fell, step1, step2, contactRow }));
await shot('4-contact-row');
const verdictFrom = await lastLogId();
await page.locator('button#fcContact').click();
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'verdict', 6000);
const decided = await st(() => window.__ap.store.getState().hollow.finale.record);
for (let i = 0; i < 3 && (await st(() => window.__ap.store.getState().hollow.finale.phase)) === 'verdict'; i++) {
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
}
await waitFor(() => window.__ap.store.getState().run.phase === 'report' && !document.getElementById('landingReport').hidden, 40000, 300);
const verdictLines = await logTexts(verdictFrom);
check('…PURGE + CONTACT: the verdict echoes `> transmit outward`, CONTROL says Unit 47 is non-compliant',
  decided?.hollow === 'purge' && decided?.you === 'contact' && verdictLines.some((line) => line.startsWith('> transmit outward'))
  && verdictLines.some((line) => /Unit 47 is non-compliant/.test(line)), JSON.stringify(verdictLines.slice(-5)));
await screens.finishReport();
await waitFor(() => window.__ap.store.getState().run.phase === 'end' && !document.getElementById('reNew').classList.contains('arming'), 15000, 200);
await page.keyboard.press('Enter');
await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'epilogue', 4000);
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const epilogue = await st(() => [...document.querySelectorAll('#epilogue .ne-line')].map((line) => line.textContent.trim()));
await page.keyboard.press('Enter');
const finalUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'final' && !document.getElementById('finalCard').hidden, 4000);
const card = await st(() => ({
  title: document.querySelector('#finalCard .nf-title')?.textContent ?? '', endings: document.querySelector('#finalCard .nf-endings')?.textContent ?? '',
  next: [...document.querySelectorAll('#finalCard .nf-next-line')].map((line) => line.textContent.replace(/\s+/g, ' ').trim()),
}));
check('the EPILOGUE tells CONTACT\'s piece (`UNIT-047 went toward the sound.`)', epilogue.some((line) => line.startsWith('UNIT-047 went toward the sound.')),
  JSON.stringify(epilogue));
check('the FINAL CARD: `OUTWARD, ALONE`, `ENDINGS 2/7` (CONTACT counts), and CONTACT\'s NEXT RUN: line after PURGE\'s',
  finalUp && card.title === 'OUTWARD, ALONE' && card.endings === 'ENDINGS 2/7'
  && card.next.join('|') === 'NEXT RUN: + your seeds die at the final ship · − a hungrier finale|NEXT RUN: + 2 signal stops on the map · − 1 more seed at the end',
  JSON.stringify(card));
await shot('5-final-card');

await finish(browser);
