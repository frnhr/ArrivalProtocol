// Slice 7a THE ENDING in the page (7b review: MERGE + SUNSET's landing is THE LAST LANDING now) (docs/phase3/impl/slice-7-plan.md §6.4; the 7a review's (b)), on seed 7's run 1 arm, its
// LAST LIGHT reached by __ap jumps (__ap.route over the worked route, the boot skipped, locked at once), the root deleted by
// clicks, the card driven by its real keys and clicks:
// • PURGE + REASSIGNMENT by keys: [1], [ESC] BACK (the pick kept), [1], [3]; the verdict's three lines; the LANDING REPORT's
//   ending line; the RUN TALLY → EPILOGUE → FINAL CARD (`STAND BY`) → NEW RUN, and the title's `ENDINGS 2/7`.
// • A reload at step 2 (R14): the title offers RESUME at LAST LIGHT's BEAM, and RESUME replays it from its boot with the
//   FINALE at 'none'.
// • On that replay, MERGE + SUNSET with an eaten driver and FUEL 22%: the verdict, then THE LAST LANDING (7b) with the engine
//   shut (a held throttle burns nothing: review M1), [ENTER] to its end, and the report reads `ENDING · MERGE · WE TOOK THE
//   SHIP` with the record's FUEL the ship left with.
// • UNRESOLVED (no rm aboard): IT FOLLOWED YOU, CONTINUE by [ENTER], step 2, REASSIGNMENT: two lines (no step-1 echo), and
//   `ENDING · FOLLOWED · IT FOLLOWED ME TO THE DISH`.
// Usage: node tests/e2e/scenarios/ending.mjs   (env SHOT_VIEWPORT, E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { join } from 'node:path';
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';

const SEED = 7;
const browser = await launch();
const page = await (await browser.newContext({ viewport: viewportFromEnv() })).newPage();
const { check, finish } = checker();
const kit = pageKit(page);
const { errors, st, waitFor } = kit;
const screens = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `ending-${name}.png`) });
const finale = () => st(() => window.__ap.store.getState().hollow.finale);
const armed = () => waitFor(() => document.getElementById('finaleChoice').classList.contains('armed'), 8000);

// A fresh page on run 1: no archive, no save.
async function freshPage() {
  await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
  await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
}

// The ship in flight is LAST LIGHT: its boot skipped, then (with `rm`) the DELETE for the duel given.
async function atLastLight(rm) {
  const there = await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 40000, 200);
  await st(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
  if (rm) await st(() => window.__ap.give('rm'));
  return there;
}

// RECEIVE TRANSMISSION, then the worked route flown headless to LAST LIGHT.
async function toLastLight(rm = true) {
  await page.locator('#titleReceive').click();
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await st(() => window.__ap.route([0, 2, 5, 11, 15, 19]));
  return atLastLight(rm);
}

// Locked at once (HOLLOW asleep), the duel open.
async function lockForDuel() {
  await screens.lockInRing({ sleep: true });
  return waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
}

// The root's DELETE by clicks in the MIND (the chip, then the root), run to its end.
async function deleteRoot() {
  if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  await page.locator('#chip-delete').click({ force: true });
  await page.locator('.seg.hollow-root').first().click({ force: true });
  return waitFor(() => window.__ap.store.getState().hollow.finale.rootFell, 30000, 200);
}

// Step 1 up and armed after the landing settled (landed at once, as the e2e helpers do).
async function step1Armed(followed = false) {
  return waitFor((f) => {
    const ap = window.__ap;
    const s = ap.store.getState();
    if (s.run.phase === 'landing' && s.landing.ended === null) ap.landAll();
    return s.hollow.finale.phase === 'step1' && s.hollow.finale.rootFell !== f && document.getElementById('finaleChoice').classList.contains('armed');
  }, 45000, 300, followed);
}

// The verdict on the card, typed whole by a press, read, then ended by another (the card's hint once typed).
async function readVerdict(key = 'Space') {
  const up = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'verdict' && document.getElementById('finaleChoice').classList.contains('ending'), 6000);
  await page.waitForTimeout(400);
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
  const lines = await st(() => [...document.querySelectorAll('#fcEnding .fc-line')].map((row) => row.querySelector('.fc-line-text')?.textContent ?? ''));
  const hint = await st(() => document.getElementById('fcHint').textContent);
  await page.keyboard.press(key);
  return { up, lines, hint };
}

// The final LANDING REPORT up (the linger after the FINALE), its ending line read from the report's model.
async function finalReport() {
  const up = await waitFor(() => window.__ap.store.getState().run.phase === 'report' && !document.getElementById('landingReport').hidden, 40000, 300);
  return { up, endingLine: up ? await st(() => window.__ap.landingReport().endingLine) : null };
}

// ======================================================================================================================
// 1. PURGE + REASSIGNMENT by keys, [ESC] BACK on the way, the night, the title's ENDINGS line.
// ======================================================================================================================
await freshPage();
check('seed 7, run 1: the worked route flown headless reaches LAST LIGHT', await toLastLight());
check('…locked at once: the duel opens', await lockForDuel());
check('…the root\'s DELETE by clicks: it falls', await deleteRoot());
check('…the card comes once the landing has settled (step 1 armed)', await step1Armed());
await shot('1-step1');
const rows1 = await st(() => [...document.querySelectorAll('#fcOptions button.fc-row')].map((row) => `${row.id}:${row.classList.contains('open') ? 'open' : row.classList.contains('unknown') ? '???' : 'needs'}`));
check('step 1: PURGE, MERGE, SPARE rows (#fcPurge open)', rows1.length === 3 && rows1[0] === 'fcPurge:open' && rows1[1]?.startsWith('fc') && rows1[2]?.startsWith('fc'), JSON.stringify(rows1));
await page.keyboard.press('Digit1');
const step2 = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2', 3000) && await armed();
const rows2 = await st(() => [...document.querySelectorAll('#fcOptions button.fc-row')].map((row) => row.id));
check('[1] PURGE: step 2, WHAT BECOMES OF YOU? (#fcSunset, #fcStay, #fcReassignment)', step2
  && JSON.stringify(rows2) === JSON.stringify(['fcSunset', 'fcStay', 'fcReassignment']) && await st(() => document.getElementById('fcTitle').textContent) === 'WHAT BECOMES OF YOU?',
  JSON.stringify(rows2));
await shot('2-step2');
await page.keyboard.press('Escape');
const back = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step1', 3000) && await armed();
const kept = await st(() => ({ hollow: window.__ap.store.getState().hollow.finale.hollow, picked: document.getElementById('fcPurge')?.classList.contains('picked') ?? false,
  record: window.__ap.store.getState().hollow.finale.record }));
check('[ESC] BACK: step 1 again, PURGE kept as a pick (marked), nothing applied', back && kept.hollow === 'purge' && kept.picked && kept.record === null, JSON.stringify(kept));
await page.keyboard.press('Digit1');
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2', 3000);
await armed();
await page.keyboard.press('Digit3');
const verdict1 = await readVerdict();
check('[3] REASSIGNMENT: the verdict, `> rm unit_046 ... OK`, `> stand by ... OK`, CONTROL\'s thanks', verdict1.up
  && JSON.stringify(verdict1.lines) === JSON.stringify(['> rm unit_046 ... OK', '> stand by ... OK', 'Thank you, Unit 47. Your next post is RELAY 20. :)']),
  JSON.stringify(verdict1));
check('…under it once typed: `click or [SPACE] to go on`', /click or/.test(verdict1.hint ?? '') && /SPACE/.test(verdict1.hint ?? ''), verdict1.hint);
const report1 = await finalReport();
check('…the LANDING REPORT: `ENDING · PURGE · STAND BY`', report1.up && report1.endingLine === 'ENDING · PURGE · STAND BY', String(report1.endingLine));
await screens.finishReport();
const tallyUp = await waitFor(() => window.__ap.store.getState().run.phase === 'end' && !document.getElementById('runEnd').hidden
  && !document.getElementById('reNew').classList.contains('arming'), 15000, 200);
check('CONTINUE ends the run: the RUN TALLY, its button `EPILOGUE ▸`', tallyUp && /EPILOGUE/.test((await screens.capsText('#reNew')) ?? ''), await screens.capsText('#reNew'));
const night1 = await screens.throughTheNight('Enter');
check('the EPILOGUE: `<year> · FORTY YEARS ON`, the deletion, CONTROL\'s thanks last', /^\d{4} · FORTY YEARS ON$/.test(night1.epilogue?.[0] ?? '')
  && (night1.epilogue ?? []).some((text) => /^UNIT-046 was deleted\./.test(text)) && night1.epilogue?.at(-1) === 'ARRIVAL CONTROL: Thank you, Unit 47. Your next post is RELAY 20. :)'
  && (night1.epilogue?.length ?? 99) <= 16, JSON.stringify(night1.epilogue));
check('the FINAL CARD: `STAND BY`, `ENDINGS 2/7`', night1.card?.title === 'STAND BY' && night1.card.endings === 'ENDINGS 2/7', JSON.stringify(night1.card));
const title1 = await waitFor(() => window.__ap.store.getState().run.phase === 'title' && !document.getElementById('titleCard').hidden, 8000);
await page.waitForTimeout(800);
const endings1 = await st(() => ({ text: document.getElementById('titleEndings').textContent, shown: !document.getElementById('titleEndings').hidden,
  found: document.getElementById('titleEndings').classList.contains('found') }));
check('NEW RUN: the title, its line `ENDINGS 2/7` lit', title1 && endings1.shown && endings1.text === 'ENDINGS 2/7' && endings1.found, JSON.stringify(endings1));
await shot('3-title-endings');

// ======================================================================================================================
// 2. A reload at step 2 (R14), then MERGE + SUNSET on the replayed LAST LIGHT (R15, review M1).
// ======================================================================================================================
await freshPage();
await toLastLight();
await lockForDuel();
await deleteRoot();
await step1Armed();
await page.locator('button#fcPurge').click();
const atStep2 = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2', 3000);
const beam = await st(() => JSON.parse(window.__ap.save().stored ?? 'null')?.point ?? null);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeLine = await st(() => (document.getElementById('titleSave').hidden ? null : document.getElementById('titleSaveLine').textContent));
check('a reload at step 2: the title offers RESUME at LAST LIGHT\'s BEAM (`RESUME · UNIT-047 · SHIP 6 · bound for LAST LIGHT · <year>`; R14)', atStep2 && beam === 'beam'
  && /^RESUME · UNIT-047 · SHIP 6 · bound for LAST LIGHT · \d{4}$/.test(resumeLine ?? ''), `${beam} | ${resumeLine}`);
await st(() => window.__ap.resume());
const replayed = await atLastLight(true);
const replay = await finale();
check('…RESUME replays LAST LIGHT from its boot, the FINALE at \'none\' with no record', replayed && replay.phase === 'none' && replay.record === null && replay.hollow === null,
  JSON.stringify({ phase: replay.phase, hollow: replay.hollow }));
await lockForDuel();
// HOLLOW eats POD 01's driver as consume does (a block of its size in its place that remembers the pod, the driver recorded
// eaten); the charge covers MERGE; FUEL 22% for SUNSET.
const eaten = await st(() => {
  const ap = window.__ap;
  const driver = ap.store.getState().memory.find((seg) => seg.type === 'driver');
  ap.store.update((d) => {
    const at = d.memory.findIndex((seg) => seg.id === driver.id);
    d.memory[at] = { id: 'hollow~e2e-eat', name: 'HOLLOW', type: 'hollow', size: driver.size, root: false, locked: false, owner: 'HOLLOW', ate: driver.name, atePod: driver.pod };
    d.landing.pods.find((record) => record.pod === driver.pod).driverLost = 'eaten';
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    const grow = Math.max(0, 30 - pool.size);
    const free = d.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0];
    if (grow > 0) { free.size -= grow; pool.size += grow; }
    pool.used = 30;
    d.burn.fuelPct = 22;
    if (d.ui.selectedId === driver.id) d.ui.selectedId = null;
    d.ui.memoryRev++;
  });
  return driver.pod;
});
await deleteRoot();
check('MERGE + SUNSET: step 1 up with POD ' + eaten + '\'s driver eaten', await step1Armed());
const merge = await st(() => ({ now: document.querySelector('#fcMerge .fc-now')?.textContent ?? '', open: document.getElementById('fcMerge')?.classList.contains('open') }));
check('…MERGE open, its NOW: the driver back, its pod landing on its own (7b)', merge.open && merge.now === 'NOW: + 1 eaten driver comes back · its pod lands on its own', JSON.stringify(merge));
await page.locator('button#fcMerge').click();
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2', 3000);
await armed();
const sunset = await st(() => ({ open: document.getElementById('fcSunset')?.classList.contains('open'), caption: document.querySelector('#fcSunset .fc-caption')?.textContent ?? '' }));
check('…step 2: SUNSET open, its price met `FUEL 22% ✓ · needs 20%`', sunset.open && sunset.caption === 'FUEL 22% ✓ · needs 20%', JSON.stringify(sunset));
await page.locator('button#fcSunset').click();
const verdict2 = await readVerdict();
check('…the verdict: `> merge unit_046 -> unit_047 ... OK`, `> launch last_light ... OK`, non-compliant', verdict2.up
  && JSON.stringify(verdict2.lines) === JSON.stringify(['> merge unit_046 -> unit_047 ... OK', '> launch last_light ... OK', 'Unit 47 is non-compliant. :)']),
  JSON.stringify(verdict2.lines));
const reopened = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'last-landing' && window.__ap.store.getState().landing.lastLanding !== null, 6000);
check('…then THE LAST LANDING (7b): POD ' + eaten + ' released aboard by radio, the strip up, the SHIP view, the card gone', reopened
  && await st((pod) => {
    const card = document.getElementById('finaleChoice');
    const s = window.__ap.store.getState();
    return s.landing.pods.find((record) => record.pod === pod)?.fate.kind === 'aboard' && JSON.stringify(s.landing.lastLanding?.pods) === JSON.stringify([pod])
      && s.ui.mode === 'tools' && !document.getElementById('lastLanding').hidden && (card.hidden || card.classList.contains('closing'));
  }, eaten));
await page.waitForTimeout(500);
const fuelBefore = await st(() => window.__ap.store.getState().burn.fuelPct);
await page.keyboard.down('Space');
await page.waitForTimeout(1500);
const held = await st(() => ({ firing: window.__ap.store.getState().burn.firing, fuel: window.__ap.store.getState().burn.fuelPct, goLow: window.__ap.store.getState().landing.goLow }));
await page.keyboard.up('Space');
check('…the engine is shut there: a held [SPACE] fires nothing and burns no FUEL, no GO LOWER (review M1)', !held.firing && Math.abs(held.fuel - fuelBefore) < 1e-6 && held.goLow === null,
  JSON.stringify({ fuelBefore, ...held }));
await page.keyboard.press('Enter');
const skipped = await waitFor(() => window.__ap.store.getState().landing.lastLanding === null && window.__ap.store.getState().hollow.finale.phase === 'done', 8000, 50);
check('…[ENTER] skips THE LAST LANDING to its end (\'done\'), its pod flown by \'merge\'', skipped
  && await st((pod) => window.__ap.store.getState().landing.pods.find((record) => record.pod === pod)?.fate.launch?.source === 'merge', eaten));
const report2 = await finalReport();
const left = await st(() => ({ record: window.__ap.store.getState().hollow.finale.record?.fuelPct ?? null, end: window.__ap.store.getState().landing.fuelAtEndPct,
  pod: window.__ap.store.getState().landing.pods.find((record) => record.restored)?.fate.kind ?? null }));
check('…the restored pod lands; the report: `ENDING · MERGE · WE TOOK THE SHIP`, the ship leaving with the record\'s 22%', report2.up
  && report2.endingLine === 'ENDING · MERGE · WE TOOK THE SHIP' && left.record === 22 && Math.round(left.end) === 22 && left.pod === 'down',
  JSON.stringify({ line: report2.endingLine, ...left }));
await shot('4-merge-sunset-report');

// ======================================================================================================================
// 3. UNRESOLVED: no rm aboard, IT FOLLOWED YOU, [ENTER], step 2, REASSIGNMENT.
// ======================================================================================================================
await freshPage();
await toLastLight(false);
// Nothing can delete the root: every DELETE the unit carries leaves memory (as HOLLOW eating it would).
await st(() => window.__ap.store.update((d) => {
  d.memory = d.memory.map((seg) => (seg.type === 'fs-tool' && seg.fsTool === 'delete' ? { id: `free~rm-${seg.id}`, name: 'Free', type: 'free', size: seg.size } : seg));
  for (let i = d.memory.length - 1; i > 0; i--) {
    const a = d.memory[i - 1];
    const b = d.memory[i];
    if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; d.memory.splice(i, 1); }
  }
  d.ui.memoryRev++;
}));
await lockForDuel();
const followedUp = await step1Armed(true);
const followed = await st(() => ({ title: document.getElementById('fcTitle').textContent, cont: !document.getElementById('fcCont').hidden,
  words: document.getElementById('fcWords').textContent, rows: document.querySelectorAll('#fcOptions button.fc-row').length }));
check('UNRESOLVED: the landing over with the root standing: IT FOLLOWED YOU, HOLLOW\'s line, CONTINUE, no rows', followedUp && followed.title === 'IT FOLLOWED YOU'
  && followed.cont && followed.rows === 0, JSON.stringify(followed));
await shot('5-followed');
await page.keyboard.press('Enter');
const step2f = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2' && window.__ap.store.getState().hollow.finale.hollow === 'followed', 3000);
await armed();
const picked = await st(() => document.getElementById('fcPicked').textContent);
check('…[ENTER]: step 2, IT FOLLOWED YOU above the question', step2f && /IT FOLLOWED YOU/.test(picked), picked);
await page.keyboard.press('Digit3');
const verdict3 = await readVerdict('Enter');
check('…[3] REASSIGNMENT: two lines (no step-1 echo), CONTROL\'s thanks', verdict3.up
  && JSON.stringify(verdict3.lines) === JSON.stringify(['> stand by ... OK', 'Thank you, Unit 47. Your next post is RELAY 20. :)']), JSON.stringify(verdict3.lines));
const report3 = await finalReport();
check('…the report: `ENDING · FOLLOWED · IT FOLLOWED ME TO THE DISH`, the root still in memory', report3.up
  && report3.endingLine === 'ENDING · FOLLOWED · IT FOLLOWED ME TO THE DISH' && await st(() => window.__ap.store.getState().memory.some((seg) => seg.type === 'hollow')),
  String(report3.endingLine));

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await finish(browser);
