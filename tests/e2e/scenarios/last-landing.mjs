// Slice 7b THE LAST LANDING in the page (docs/phase3/impl/slice-7-plan.md R24–R29, §6.4; the 7b review's e2e), on seed 7's
// run 1 arm, its LAST LIGHT reached by __ap jumps (__ap.route over the worked route, the boot skipped, locked at once), three
// drivers eaten by hand as HOLLOW's consume leaves them, the root deleted by clicks, the card driven by its keys:
// • MERGE + REASSIGNMENT: the card's `NOW:` says the pods land on their own; after the verdict THE LAST LANDING flies: the
//   header strip (`THE LAST LANDING`, `3 OF 3 PODS TO LAND`, who flies them, `[ENTER] SKIP TO THE END`), the SHIP view held
//   (TAB does nothing), the POD BAY's `RESTORED 3` row with its pips and `DRIVERS BY RADIO · 80%`, a steady amber
//   `.np-beacon.restored` per pod on the NAV PLOT; the kid's launch refused ([L] shut by the layer, __ap.launch MERGE FLYING).
// • [ENTER]: skipped to the end over frames (slice 8 POLISH, OD 66): the hint reads `SKIPPING… n LEFT`, no long task over
//   100 ms (a PerformanceObserver on 'longtask'; the one-call skip was one task of about 2 s), a click on the header's
//   pause, TAB and a second [ENTER] change nothing while it runs, then the machine cleared, 'done', the strip gone, the
//   restored pods down, and the report's RESTORED row counts as many LANDED as the pods' own fates.
// • The final LANDING REPORT: `.lr-row.kind-restored` (`RESTORED BY MERGE · 3 RESTORED · …`), `(restored)` on the credits.
// • The night: the RUN TALLY → EPILOGUE → FINAL CARD → NEW RUN, to the title.
// MERGE + SUNSET with the engine shut is ending.mjs's part 2.
// Usage: node tests/e2e/scenarios/last-landing.mjs   (env SHOT_VIEWPORT, E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { join } from 'node:path';
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';

const SEED = 7;
const EATEN = 3;
const browser = await launch();
const page = await (await browser.newContext({ viewport: viewportFromEnv() })).newPage();
const { check, finish } = checker();
const kit = pageKit(page);
const { errors, st, waitFor } = kit;
const screens = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `last-landing-${name}.png`) });
const armed = () => waitFor(() => document.getElementById('finaleChoice').classList.contains('armed'), 8000);

await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// RECEIVE TRANSMISSION, the worked route flown headless to LAST LIGHT, its boot skipped, a DELETE for the duel.
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await st(() => window.__ap.route([0, 2, 5, 11, 15, 19]));
const there = await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 40000, 200);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => window.__ap.give('rm'));
check('seed 7, run 1: the worked route flown headless reaches LAST LIGHT', there);
await screens.lockInRing({ sleep: true });
check('…locked at once: the duel opens', await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000));

// HOLLOW eats three drivers as consume does (a block of its size in each place that remembers the pod, the driver recorded
// eaten); the charge covers MERGE.
const eaten = await st((n) => {
  const ap = window.__ap;
  const drivers = ap.store.getState().memory.filter((seg) => seg.type === 'driver').slice(0, n);
  ap.store.update((d) => {
    for (const driver of drivers) {
      const at = d.memory.findIndex((seg) => seg.id === driver.id);
      d.memory[at] = { id: `hollow~e2e-eat${driver.pod}`, name: 'HOLLOW', type: 'hollow', size: driver.size, root: false, locked: false, owner: 'HOLLOW', ate: driver.name, atePod: driver.pod };
      d.landing.pods.find((record) => record.pod === driver.pod).driverLost = 'eaten';
      if (d.ui.selectedId === driver.id) d.ui.selectedId = null;
    }
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    const grow = Math.max(0, 30 - pool.size);
    const free = d.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0];
    if (grow > 0) { free.size -= grow; pool.size += grow; }
    pool.used = 30;
    d.ui.memoryRev++;
  });
  return drivers.map((driver) => driver.pod);
}, EATEN);

// The root's DELETE by clicks in the MIND (the chip, then the root), run to its end.
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
check('the root\'s DELETE by clicks: it falls', await waitFor(() => window.__ap.store.getState().hollow.finale.rootFell, 30000, 200));
const step1 = await waitFor(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  if (s.run.phase === 'landing' && s.landing.ended === null) ap.landAll();
  return s.hollow.finale.phase === 'step1' && document.getElementById('finaleChoice').classList.contains('armed');
}, 45000, 300);
const parked = await st((pods) => pods.every((pod) => {
  const fate = window.__ap.store.getState().landing.pods.find((record) => record.pod === pod)?.fate;
  return fate?.kind === 'parked' && fate.restorable;
}), eaten);
check(`step 1 up, PODS ${eaten.join(', ')} parked restorable (their drivers eaten)`, step1 && parked);
const merge = await st(() => ({ now: document.querySelector('#fcMerge .fc-now')?.textContent ?? '', open: document.getElementById('fcMerge')?.classList.contains('open') }));
check('…MERGE open, its NOW: `+ 3 eaten drivers come back · their pods land on their own` (7b)', merge.open
  && merge.now === `NOW: + ${EATEN} eaten drivers come back · their pods land on their own`, JSON.stringify(merge));

// ======================================================================================================================
// MERGE + REASSIGNMENT by keys, the verdict, then THE LAST LANDING.
// ======================================================================================================================
await page.keyboard.press('Digit2');
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2', 3000);
await armed();
await page.keyboard.press('Digit3');
const verdictUp = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'verdict' && document.getElementById('finaleChoice').classList.contains('ending'), 6000);
await page.waitForTimeout(400);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const verdict = await st(() => [...document.querySelectorAll('#fcEnding .fc-line')].map((row) => row.querySelector('.fc-line-text')?.textContent ?? ''));
check('[2] MERGE, [3] REASSIGNMENT: the verdict `> merge unit_046 -> unit_047 ... OK`, `> stand by ... OK`, CONTROL\'s thanks', verdictUp
  && verdict[0] === '> merge unit_046 -> unit_047 ... OK' && verdict[1] === '> stand by ... OK' && /^Thank you, Unit 47\./.test(verdict[2] ?? ''), JSON.stringify(verdict));
await page.keyboard.press('Space');
const flying = await waitFor(() => window.__ap.store.getState().landing.lastLanding !== null && !document.getElementById('lastLanding').hidden, 6000);
await page.waitForTimeout(700);
const strip = await st(() => {
  const s = window.__ap.store.getState();
  const card = document.getElementById('finaleChoice');
  return {
    title: document.querySelector('#lastLanding .ll-title')?.textContent ?? '', status: document.querySelector('#lastLanding .ll-status')?.textContent ?? '',
    flier: document.querySelector('#lastLanding .ll-flier')?.textContent ?? '', skip: document.querySelector('#lastLanding .ll-skip')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    llOn: document.body.classList.contains('ll-on'), mode: s.ui.mode, phase: s.hollow.finale.phase, pods: s.landing.lastLanding?.pods ?? [],
    flierState: s.landing.lastLanding?.flier ?? null, cardGone: card.hidden || card.classList.contains('closing'),
  };
});
check('…THE LAST LANDING flies: the header strip `THE LAST LANDING` · `3 OF 3 PODS TO LAND` · who flies · `[ENTER] SKIP TO THE END`', flying
  && strip.title === 'THE LAST LANDING' && /^\d OF 3 PODS TO LAND$/.test(strip.status) && strip.flier.length > 0 && /ENTER/.test(strip.skip) && /SKIP TO THE END/.test(strip.skip)
  && strip.llOn && strip.phase === 'last-landing' && JSON.stringify([...strip.pods].sort((a, b) => a - b)) === JSON.stringify([...eaten].sort((a, b) => a - b)),
  JSON.stringify(strip));
check('…the card gone, the SHIP view forced', strip.cardGone && strip.mode === 'tools', JSON.stringify(strip));
await page.keyboard.press('Tab');
await page.waitForTimeout(400);
check('…TAB does nothing: the MIND is shut (R26)', (await st(() => window.__ap.store.getState().ui.mode)) === 'tools');
const bay = await st(() => {
  const row = document.querySelector('#podBayWin .pb-restored');
  const win = document.getElementById('podBayWin');
  return {
    winShown: win !== null && getComputedStyle(win).display !== 'none' && win.getBoundingClientRect().height > 0,
    row: row !== null && !row.hidden, text: row?.querySelector('.pb-restored-text')?.textContent ?? '', note: row?.querySelector('.pb-restored-note')?.textContent ?? '',
    pips: row ? row.querySelectorAll('.pb-restored-pip').length : 0,
  };
});
check('…the POD BAY: `RESTORED 3`, a pip per pod, `DRIVERS BY RADIO · 80%`', bay.winShown && bay.row && bay.text === `RESTORED ${EATEN}` && bay.pips === EATEN
  && bay.note === 'DRIVERS BY RADIO · 80%', JSON.stringify(bay));
const beacons = await st(() => ({ restored: document.querySelectorAll('.np-beacon.restored').length, all: document.querySelectorAll('.np-beacon').length }));
check('…the NAV PLOT: a steady amber `.np-beacon.restored` per pod still to fly', beacons.restored >= 1 && beacons.restored <= EATEN, JSON.stringify(beacons));
await shot('1-flying');

// The kid's hands: [L] is shut by the layer, and every other way in (a click's path, __ap.launch) is refused MERGE FLYING.
const aboardBefore = await st((pods) => pods.filter((pod) => window.__ap.store.getState().landing.pods.find((r) => r.pod === pod)?.fate.kind === 'aboard').length, eaten);
await page.keyboard.press('KeyL');
await page.waitForTimeout(200);
const launched = await st(() => window.__ap.launch());
const kidLaunches = await st(() => window.__ap.store.getState().landing.pods.filter((r) => (r.fate.kind === 'falling' || r.fate.kind === 'down') && r.fate.launch.source === 'player' && r.restored).length);
const bayLaunch = await st(() => document.getElementById('pbLaunchStatus')?.textContent ?? '');
check('…the kid\'s launch refused: [L] launches nothing, __ap.launch is MERGE FLYING, the POD BAY says `MERGE IS FLYING THEM`', aboardBefore > 0
  && launched.kind === 'refused' && launched.reason === 'MERGE FLYING' && kidLaunches === 0 && /MERGE IS FLYING THEM/.test(bayLaunch),
  JSON.stringify({ aboardBefore, launched, kidLaunches, bayLaunch }));

// ======================================================================================================================
// [ENTER] skips to the end.
// ======================================================================================================================
await st(() => {
  window.__llTasks = [];
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__llTasks.push(Math.round(entry.duration)); }).observe({ type: 'longtask' });
  window.__llEnd = null;
  window.__llHints = new Set();
  // Every hint the strip shows while the skip runs, sampled each frame.
  const sample = () => {
    const words = document.querySelector('#lastLanding .ll-skip-words')?.textContent ?? '';
    if (!document.getElementById('lastLanding').hidden) window.__llHints.add(words);
    if (window.__ap.store.getState().landing.lastLanding !== null) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
const t0 = Date.now();
await page.keyboard.press('Enter');
// While it runs: the header's pause button and TAB are swallowed (the world the skip flies must be the one-call skip's).
await page.waitForTimeout(120);
const midway = await st(() => ({ running: window.__ap.store.getState().landing.lastLanding !== null, skipping: document.body.classList.contains('ll-skipping') }));
await page.locator('#speedPause').click({ force: true, timeout: 2000 }).catch(() => {});
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
const midAfter = await st(() => ({ paused: window.__ap.store.getState().clock.paused, mode: window.__ap.store.getState().ui.mode }));
const skipped = await waitFor(() => window.__ap.store.getState().landing.lastLanding === null, 30000, 50);
const skipMs = Date.now() - t0;
await page.waitForTimeout(300);
const frames = await st(() => ({ tasks: window.__llTasks, hints: [...window.__llHints] }));
const longest = Math.max(0, ...frames.tasks);
check(`[ENTER] skips over frames: \`SKIPPING… n LEFT\` while it runs, its longest task ${longest} ms (≤ 100), done in ${skipMs} ms`,
  skipped && longest <= 100 && frames.hints.some((hint) => /^SKIPPING… \d+ LEFT$/.test(hint)), JSON.stringify(frames));
check('…while it runs a click on PAUSE, TAB and a second [ENTER] change nothing', !midway.running || (midway.skipping && !midAfter.paused && midAfter.mode === 'tools'),
  JSON.stringify({ midway, midAfter }));
const after = await st((pods) => {
  const s = window.__ap.store.getState();
  return { phase: s.hollow.finale.phase, stripHidden: document.getElementById('lastLanding').hidden, llOn: document.body.classList.contains('ll-on'),
    landedLz: pods.filter((pod) => { const fate = s.landing.pods.find((record) => record.pod === pod)?.fate; return fate?.kind === 'down' && fate.touchdown.place === 'lz'; }).length,
    fates: pods.map((pod) => s.landing.pods.find((record) => record.pod === pod)?.fate.kind), sources: pods.map((pod) => s.landing.pods.find((record) => record.pod === pod)?.fate.launch?.source ?? null) };
}, eaten);
check(`…THE LAST LANDING over, 'done', the strip gone, every restored pod down by 'merge'`, skipped && after.phase === 'done'
  && after.stripHidden && !after.llOn && after.fates.every((kind) => kind === 'down') && after.sources.every((source) => source === 'merge'), JSON.stringify(after));

// ======================================================================================================================
// The final LANDING REPORT: the RESTORED BY MERGE row, the credits.
// ======================================================================================================================
const reportUp = await waitFor(() => window.__ap.store.getState().run.phase === 'report' && !document.getElementById('landingReport').hidden, 40000, 300);
await page.waitForTimeout(2500);
const report = await st(() => {
  const model = window.__ap.landingReport();
  const row = model.rows.find((candidate) => candidate.kind === 'restored');
  return { line: row?.line ?? null, icons: row?.icons.length ?? 0, dom: document.querySelectorAll('#landingReport .lr-row.kind-restored').length,
    credits: (model.credits ?? []).filter((credit) => / \(restored\)$/.test(credit.where)).length, endingLine: model.endingLine };
});
check('the final LANDING REPORT: `.lr-row.kind-restored` (`RESTORED BY MERGE · 3 RESTORED · …`, an icon per pod), `(restored)` on the credits', reportUp
  && report.dom === 1 && /^RESTORED BY MERGE · 3 RESTORED/.test(report.line ?? '') && report.icons === EATEN && report.credits >= 1, JSON.stringify(report));
check(`…its LANDED count is the skip's own (${after.landedLz} in an LZ with room)`, after.landedLz === 0
  ? !/ LANDED/.test(report.line ?? '') : (report.line ?? '').includes(` ${after.landedLz} LANDED`), String(report.line));
check('…its ending line `ENDING · MERGE · …`', /^ENDING · MERGE · /.test(report.endingLine ?? ''), String(report.endingLine));
await shot('2-report');

// ======================================================================================================================
// The night, to the title.
// ======================================================================================================================
await screens.finishReport();
const tallyUp = await waitFor(() => window.__ap.store.getState().run.phase === 'end' && !document.getElementById('runEnd').hidden
  && !document.getElementById('reNew').classList.contains('arming'), 15000, 200);
check('CONTINUE ends the run: the RUN TALLY (won-merge)', tallyUp && (await st(() => window.__ap.store.getState().run.endCause)) === 'won-merge',
  await st(() => window.__ap.store.getState().run.endCause));
const night = await screens.throughTheNight('Enter');
check('the EPILOGUE, then the FINAL CARD', (night.epilogue?.length ?? 0) > 0 && night.card !== null && night.card.title.length > 0, JSON.stringify(night));
const title = await waitFor(() => window.__ap.store.getState().run.phase === 'title' && !document.getElementById('titleCard').hidden, 8000);
check('NEW RUN: the title', title);

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await finish(browser);
