// Slice 7c NEXT RUN in the page (docs/phase3/impl/slice-7-plan.md §6.4, R30–R38; the 7c review), on seed 7:
// • run 1 ends PURGE + REASSIGNMENT through the real FINALE (LAST LIGHT reached by __ap.route, locked at once, the root
//   deleted by clicks, the card by clicks): the FINAL CARD's two `NEXT RUN:` lines, then the title's (02 §3.12);
// • run 2 (UNIT-048) after it: HOLLOW is UNIT-031 mid-run (R34), the book is 047.log (R37: the last unit's, after
//   REASSIGNMENT), no ghost at the boot (R36); the boarding ship's boot closes with the stranger's line; the final ship's SHIP
//   CARD row `THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT` (R38); the last hop beamed by the real TRANSMIT, and the final
//   boot says REASSIGNMENT's allowance, the face (two lines) and CONTROL's `UNIT-047 was reassigned successfully.`, with the
//   root named UNIT-047 (R35);
// • a fresh page, run 1 archived PURGE + SUNSET (__ap.archiveAs): run 2's book is 031.log (its SCAN header and INSPECT name
//   it, no 046.log anywhere), SUNSET's cache ship wears the chart's `◆` and its card row `UNIT-047 LEFT A CACHE HERE`; beamed
//   there by the real TRANSMIT, its boot says `> UNIT-047 LEFT A CACHE HERE · +15 REPAIR CHARGE · <tool>` and the place is
//   given (the `◆` gone); a reload at that boot replays it from the BEAM save, gives the gift once and keeps the book.
// `__ap.route` jumps re-arrive with no trace (debug.ts debugArrive), so every hop a trace rides is the real TRANSMIT.
// Usage: node tests/e2e/scenarios/traces.mjs   (env SHOT_VIEWPORT, E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { join } from 'node:path';
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';

const SEED = 7;
const browser = await launch();
const page = await (await browser.newContext({ viewport: viewportFromEnv() })).newPage();
const { check, finish } = checker();
const kit = pageKit(page);
const { errors, st, waitFor } = kit;
const screens = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `traces-${name}.png`) });
const logTexts = (after = -1) => st((from) => window.__ap.log().filter((entry) => entry.id > from).map((entry) => entry.text), after);
const lastLogId = () => st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));

async function freshPage() {
  await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
  await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
}

// The ship in flight with its boot played whole (SKIP says every line: a skipped boot still gives its gifts).
async function bootDone() {
  await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 15000);
  await st(() => window.__ap.skipBoot());
  return waitFor(() => window.__ap.store.getState().run.phase === 'flight', 15000);
}

// The ship ends locked at once and landed at once, its report closed: the DESK.
async function toDesk() {
  await screens.lockInRing({ sleep: true });
  await screens.landToReport();
  await screens.finishReport();
  return waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 10000);
}

// From the DESK, the real TRANSMIT to `slot`: SET COURSE, a card (the +12 charge when dealt), TRANSMIT ▸ (systems/run.ts
// transmitNext through __ap.transmit), into its boot.
async function beamTo(slot) {
  await st((to) => window.__ap.course(to), slot);
  await waitFor(() => window.__ap.draft() !== null, 5000);
  await st(() => {
    const offer = window.__ap.draft().offer;
    if (offer.length > 0) window.__ap.pick(offer.some((card) => card.id === 'charge') ? 'charge' : offer[0].id);
    window.__ap.transmit();
  });
  return waitFor(() => window.__ap.store.getState().run.phase === 'boot', 10000);
}

// A ship's SHIP CARD on the DESK (its node clicked): the rows by key, and whether its node wears the `◆`.
async function cardOf(slot) {
  let look = await screens.desk();
  if (look.card?.slot !== slot) {
    await screens.clickNode(slot);
    await page.waitForTimeout(400);
    look = await screens.desk();
  }
  const mark = await st((s) => document.querySelector(`#deskScreen [data-slot="${s}"] .cn-trace`) !== null, slot);
  return { rows: look.card?.slot === slot ? look.card.rows : [], mark };
}

// ======================================================================================================================
// 1. Run 1 ends PURGE + REASSIGNMENT: the FINAL CARD's NEXT RUN: lines, then the title's.
// ======================================================================================================================
await freshPage();
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await st(() => window.__ap.route([0, 2, 5, 11, 15, 19]));
await bootDone();
await st(() => window.__ap.give('rm'));
await screens.lockInRing({ sleep: true });
const duel = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
const fell = await waitFor(() => window.__ap.store.getState().hollow.finale.rootFell, 30000, 200);
const stepsFailed = await screens.finaleTwoSteps('purge', 'reassignment');
check('run 1 on seed 7: LAST LIGHT\'s duel won by clicks, PURGE then REASSIGNMENT on the card', duel && fell && stepsFailed === null, String(stepsFailed));
// The verdict typed whole and ended, the final report, the tally.
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'verdict', 6000);
for (let i = 0; i < 3 && (await st(() => window.__ap.store.getState().hollow.finale.phase)) === 'verdict'; i++) {
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
}
await waitFor(() => window.__ap.store.getState().run.phase === 'report' && !document.getElementById('landingReport').hidden, 40000, 300);
await screens.finishReport();
await waitFor(() => window.__ap.store.getState().run.phase === 'end' && !document.getElementById('reNew').classList.contains('arming'), 15000, 200);
// The night by keys up to the FINAL CARD, its NEXT RUN: lines read there, then NEW RUN.
await page.keyboard.press('Enter');
await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'epilogue', 4000);
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
const finalUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'final' && !document.getElementById('finalCard').hidden, 4000);
const nextLines = await st(() => [...document.querySelectorAll('#finalCard .nf-next-line')].map((line) => line.textContent.replace(/\s+/g, ' ').trim()));
await shot('1-final-card');
const NEXT = ['NEXT RUN: + your seeds die at the final ship · − a hungrier finale', 'NEXT RUN: + 8 charge at the final ship · − the last root is you'];
check('the FINAL CARD (`STAND BY`): its two NEXT RUN: lines, PURGE\'s then REASSIGNMENT\'s (R12, 05 §3.12)', finalUp
  && JSON.stringify(nextLines) === JSON.stringify(NEXT), JSON.stringify(nextLines));
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await waitFor(() => window.__ap.store.getState().run.phase === 'title' && !document.getElementById('titleCard').hidden, 8000);
await page.waitForTimeout(600);
const titleTraces = await st(() => (document.getElementById('titleTraces').hidden ? null
  : [...document.querySelectorAll('#titleTraces .title-traces-line')].map((line) => line.textContent)));
check('NEW RUN: the title shows the same NEXT RUN: lines (02 §3.12)', JSON.stringify(titleTraces) === JSON.stringify(NEXT), JSON.stringify(titleTraces));
await shot('2-title');

// ======================================================================================================================
// 2. Run 2 after PURGE + REASSIGNMENT: the stranger, 047.log, the final ship's card row, the face.
// ======================================================================================================================
const bootFrom = await lastLogId();
await page.locator('#titleReceive').click();
await bootDone();
const run2 = await st(() => {
  const s = window.__ap.store.getState();
  return { unit: s.run.unitNumber, wave: s.run.wave, hollow: s.run.hollowUnits, book: window.__ap.log.book().book, ghostSpoken: s.run.ghostSpoken,
    traces: window.__ap.traces(), final: s.run.map.arm.find((ship) => ship?.kind === 'final')?.slot ?? null };
});
const ship1Lines = await logTexts(bootFrom);
check('run 2 (UNIT-048): HOLLOW is UNIT-031 mid-run (R34); the book 047.log (R37, after REASSIGNMENT); no ghost at the boot (R36: a won unit)',
  run2.unit === 48 && run2.wave === 2 && JSON.stringify(run2.hollow) === '[31]' && run2.book.kind === 'last' && run2.book.unit === 47
  && !run2.ghostSpoken && !ship1Lines.some((line) => /^> hi 048\./.test(line)),
  JSON.stringify({ hollow: run2.hollow, book: run2.book.kind, ghost: run2.ghostSpoken }));
check('…its traces: PURGE + REASSIGNMENT from UNIT-047, no place on the arm (both play at the final ship)',
  run2.traces.traces.from?.unit === 47 && run2.traces.traces.kinds.join() === 'purge,reassignment' && run2.traces.traces.places.length === 0
  && run2.traces.final.purge && run2.traces.final.reassignment && !run2.traces.final.wild, JSON.stringify(run2.traces.traces.kinds));
const route2 = await st(() => window.__ap.traces.route());
const before = route2 === null ? null : route2.at(-2);
// To the ship before the final one by jumps (the boarding ship: HOLLOW boards one hop from the final ship).
const boardFrom = await lastLogId();
if (route2 !== null) await st((r) => window.__ap.route(r.slice(0, -1)), route2);
await bootDone();
const boarding = await st(() => ({ boarded: window.__ap.store.getState().run.arrival?.boarded ?? null, ship: window.__ap.store.getState().level.shipName }));
const boardLines = await logTexts(boardFrom);
check(`…the boarding ship (${boarding.ship}): its boot says the stranger's \`> another one. they keep sending you.\``,
  route2 !== null && boarding.boarded !== null && boardLines.includes('> another one. they keep sending you.'), JSON.stringify(boardLines.filter((line) => line.startsWith('>')).slice(-6)));
await toDesk();
const finalCard = await cardOf(route2.at(-1));
check('the final ship\'s SHIP CARD: `TRACE · THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT` (R38), no `◆` (no gift waits there)',
  finalCard.rows.includes('trace=THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT') && !finalCard.mark, JSON.stringify(finalCard));
await shot('3-final-card-row');
const faceFrom = await lastLogId();
const beamed = await beamTo(route2.at(-1));
await bootDone();
// CONTROL's line types after its chime (say.ts): wait for it.
await waitFor((from) => window.__ap.log().some((entry) => entry.id > from && entry.text.startsWith('UNIT-047 was reassigned')), 8000, 200, faceFrom);
const finalBoot = await logTexts(faceFrom);
const finalState = await st(() => {
  const s = window.__ap.store.getState();
  return { arrival: { giftCharge: s.run.arrival?.giftCharge, lines: s.run.arrival?.traceLines.map((line) => line.text) ?? [], seeds: s.run.arrival?.seeds.length },
    root: window.__ap.traces().root, target: s.hollow.cfg.seed?.target ?? null, spread: s.hollow.cfg.spreadEverySec,
    owner: s.memory.find((seg) => seg.type === 'hollow' && seg.root)?.owner ?? null };
});
const faceAt = finalBoot.findIndex((line) => line.startsWith("> hi 048. it's 047. i deleted 046."));
check('the final ship by the real TRANSMIT: REASSIGNMENT\'s allowance `> AN ALLOWANCE FOR THE WAIT · +8 REPAIR CHARGE` (+8 on arrival; slice 8, its own number), no seed rode (PURGE)',
  beamed && finalState.arrival.giftCharge === 8 && finalBoot.includes('> AN ALLOWANCE FOR THE WAIT · +8 REPAIR CHARGE') && finalState.arrival.seeds === 0,
  JSON.stringify(finalState.arrival));
check('…the face (R35): `> hi 048. it\'s 047. i deleted 046. they sent me to its dish.`, then its wait and charge, then CONTROL\'s line',
  faceAt >= 0 && /^> \d+ years? at this dish\. they gave you 36 blocks too\. mine ran out\.$/.test(finalBoot[faceAt + 1] ?? '')
  && finalBoot.indexOf('UNIT-047 was reassigned successfully. Disregard it.') > faceAt + 1, JSON.stringify(finalBoot.slice(Math.max(0, faceAt - 1))));
check('…the root is UNIT-047 (its blocks named so), the FINALE\'s seeds hunt your best skill, its bites ×0.85 (PURGE)',
  JSON.stringify(finalState.root) === '[47]' && finalState.owner === 'UNIT-047' && finalState.target === 'near-skill' && Math.abs(finalState.spread - 12 * 0.85) < 1e-9,
  JSON.stringify(finalState));
check('…and no line of run 2 named 046.log (the boot\'s key lines name 047.log)', ![...ship1Lines, ...boardLines, ...finalBoot].some((line) => line.includes('046.log'))
  && [...boardLines, ...finalBoot].filter((line) => line.includes('KEY FOUND')).every((line) => line.startsWith('> 047.log')));
await shot('4-face');

// ======================================================================================================================
// 3. Run 2 after PURGE + SUNSET: 031.log, SUNSET's cache on the chart and its card, the gift at its boot, a reload there.
// ======================================================================================================================
await freshPage();
await st(() => window.__ap.archiveAs('won-purge', undefined, { you: 'sunset', fuelPct: 25, kit: ['scan', 'repair', 'delete', 'move'] }));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const sunsetFrom = await lastLogId();
await page.locator('#titleReceive').click();
await bootDone();
const sunset = await st(() => {
  const s = window.__ap.store.getState();
  return { book: window.__ap.log.book().book, hollow: s.run.hollowUnits, places: s.run.traces.places, kinds: s.run.traces.kinds };
});
const place = sunset.places.find((p) => p.kind === 'sunset');
check('run 2 after PURGE + SUNSET: the book is 031.log (R37), HOLLOW UNIT-031, SUNSET\'s cache placed on the arm',
  sunset.book.kind === 'stranger' && sunset.book.unit === 31 && JSON.stringify(sunset.hollow) === '[31]' && place !== undefined, JSON.stringify(sunset));
// SCAN on the `???` file (the MIND, by clicks): its header names 031.log; INSPECT's words and READ follow the book.
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
const scanFrom = await lastLogId();
await page.locator('#chip-scan').click({ force: true });
await page.locator('[data-log-chip]').first().click({ force: true });
const scanned = await waitFor(() => window.__ap.store.getState().run.log.scanned, 10000, 200);
await page.waitForTimeout(600);
const scanLines = await logTexts(scanFrom);
const inspect = await st(() => {
  const ap = window.__ap;
  const log = ap.store.getState().memory.find((seg) => seg.type === 'log');
  ap.store.update((d) => { d.ui.activeTool = null; d.ui.selectedId = log.id; d.ui.memoryRev++; });
  return null;
});
await page.waitForTimeout(400);
const panel = await st(() => ({ title: document.querySelector('#detailBody .detail-title')?.textContent ?? null, desc: document.querySelector('#detailBody .detail-desc')?.textContent ?? null }));
check('…SCAN on the `???` file: `031.log · origin UNIT-031 · 6 entries · 0 found`; INSPECT reads `031.log`, UNIT-031\'s log',
  scanned && inspect === null && scanLines.some((line) => line.includes('031.log · origin UNIT-031 · 6 entries · 0 found'))
  && panel.title === '031.log' && /^UNIT-031's log/.test(panel.desc ?? ''), JSON.stringify({ scan: scanLines.slice(-3), panel }));
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
if (place.slot === 0) {
  // SUNSET's fallback: the first ship (its boot already said it).
  const firstLines = await logTexts(sunsetFrom);
  check('…SUNSET\'s cache on the first ship (its fallback): its boot says `> UNIT-047 LEFT A CACHE HERE`', firstLines.some((line) => line.startsWith('> UNIT-047 LEFT A CACHE HERE')),
    JSON.stringify(firstLines.filter((line) => line.startsWith('>'))));
} else {
  const route3 = await st((slot) => window.__ap.traces.route([slot]), place.slot);
  const at = route3.indexOf(place.slot);
  if (at > 1) {
    await st((r) => window.__ap.route(r), route3.slice(0, at));
    await bootDone();
  }
  await toDesk();
  const giftCard = await cardOf(place.slot);
  check(`SUNSET's cache ship (slot ${place.slot}): the chart's \`◆\` and its card row \`TRACE · UNIT-047 LEFT A CACHE HERE\` (R38)`,
    giftCard.mark && giftCard.rows.includes('trace=UNIT-047 LEFT A CACHE HERE'), JSON.stringify(giftCard));
  await shot('5-gift-card');
  const giftFrom = await lastLogId();
  await beamTo(place.slot);
  // The BEAM save is written; the boot plays its lines (the gift said and given).
  await bootDone();
  const giftLines = await logTexts(giftFrom);
  const look = () => st((slot) => {
    const s = window.__ap.store.getState();
    const pool = s.memory.filter((seg) => seg.type === 'redundancy').reduce((sum, seg) => sum + seg.size, 0);
    return { given: s.run.traces.places.find((p) => p.slot === slot)?.given ?? null, gift: s.run.arrival?.giftCharge ?? null, pool,
      book: `${s.run.log.book.kind}:${s.run.log.book.unit ?? ''}:${s.run.log.scanned}`,
      rms: s.memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete').length, line: s.run.arrival?.traceLines.map((l) => l.text) ?? [] };
  }, place.slot);
  const said = await look();
  const giftLine = giftLines.find((line) => line.startsWith('> UNIT-047 LEFT A CACHE HERE · +15 REPAIR CHARGE')) ?? null;
  check('…beamed there by the real TRANSMIT: `> UNIT-047 LEFT A CACHE HERE · +15 REPAIR CHARGE · Rm` at its boot, +15 on arrival, the place given',
    giftLine === '> UNIT-047 LEFT A CACHE HERE · +15 REPAIR CHARGE · Rm' && said.gift === 15 && said.given === true, JSON.stringify({ giftLine, said }));
  // A reload at that boot: the BEAM save replays the boot, and the gift is given once (its charge and its Rm as before).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const offered = await st(() => (document.getElementById('titleSave').hidden ? null : document.getElementById('titleSaveLine').textContent));
  await st(() => window.__ap.resume());
  const replayFrom = await lastLogId();
  await bootDone();
  const replayLines = await logTexts(replayFrom);
  const replay = await look();
  check('…a reload at its boot: RESUME replays it from the BEAM save; the line once, the charge, the Rm and `given` as before (no double gift)',
    /^RESUME · UNIT-048 · SHIP \d+ · bound for /.test(offered ?? '') && replayLines.filter((line) => line.startsWith('> UNIT-047 LEFT A CACHE HERE')).length <= 1
    && replay.given === true && replay.gift === 15 && replay.pool === said.pool && replay.rms === said.rms, JSON.stringify({ offered, said, replay }));
  check('…and the book survives the reload: still 031.log, scanned (the save keeps run.log)', replay.book === 'stranger:31:true' && said.book === replay.book, replay.book);
  await toDesk();
  // The ship the unit is on is not a pick on the DESK (desk.ts selectShip), so its card (`· FOUND`) is not shown there: only
  // the chart's mark is read (traces/ui-models pins the row).
  const markAfter = await st((s) => ({ node: document.querySelector(`#deskScreen [data-slot="${s}"]`) !== null,
    mark: document.querySelector(`#deskScreen [data-slot="${s}"] .cn-trace`) !== null }), place.slot);
  check('…back at the DESK: the cache ship\'s `◆` is gone (its gift given)', markAfter.node && !markAfter.mark, JSON.stringify(markAfter));
}

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await finish(browser);
