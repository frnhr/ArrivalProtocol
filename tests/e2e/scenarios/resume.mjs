// The e2e run save (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.1–§2.2, §3 step 6, §6.3): one save slot written at
// RUN START, SHIP DONE, BEAM and ENDING CHOSEN, and the title's RESUME block over it. On run 1's arm (seed 4, the worked
// route), played like a kid between the reloads:
// A. ARES-VII and HALCYON to the second DESK (slice 4: desk 1 opens on TRAINING, and its required first pick is made by [1],
//    ENTER); a reload there: the RESUME block (`RESUME · UNIT-047 · SHIP 2 DONE · AT THE DESK · 2352`, RESUME ▸ [ENTER],
//    NEW RUN, no RECEIVE TRANSMISSION), and ENTER resumes the same desk (the route, the year, the nodes, the INBOX's read
//    marks, the requests, amber, the bought AUTOBURN v1 and the cycles), with the run not counted again.
// B. SET COURSE to KESTREL, TRANSMIT: its boot typed in full, then a reload mid-flight: `RESUME · UNIT-047 · SHIP 3 · bound
//    for KESTREL · …`, and a click on RESUME ▸ replays KESTREL from its boot with the same lines, hits and seeds.
// C. KESTREL landed, a reload at its LANDING REPORT (no save point before the final ship: the line still names KESTREL's
//    boot). NEW RUN asks `ABANDON UNIT-047'S RUN? · ITS SHIPS COUNT AS DONE` (ABANDON RUN [DEL] / KEEP IT [ENTER]; slice 3c
//    review fix minor 1: ENTER keeps, abandoning takes a click or DEL); ENTER keeps the run, so does ESC, nothing written.
// D. On to LAST LIGHT by the DESK (each ship flown at once), its duel by DELETE, PURGE, the LANDING REPORT: ENDING CHOSEN. A reload there,
//    ENTER restores the report; CONTINUE ends the run once (the archive counts it once, the save is gone), and the RUN TALLY
//    says `NEXT UNIT LAUNCHES … · UNIT-048` and the arm's update. NEW RUN: UNIT-048's title, launched after UNIT-047.
// E. UNIT-048's RECEIVE (RUN START), a reload in its boot, NEW RUN; ENTER on the confirm keeps the run, DEL abandons it:
//    UNIT-049's title.
// F. A fresh page: a corrupt save (__ap.saveCorrupt) and a reload give `RUN SAVE CAN'T RESUME · THE SAVE IS DAMAGED` with
//    ABANDON RUN only; ENTER abandons (recorded signal-lost: the game lost the run, review fix minor 7), to UNIT-048's title.
//    Then the save's storage throws (setItem stubbed for the run save's key only): RECEIVE's RUN START can't be written, the
//    footer says NO SAVE and the TERMINAL `RUN SAVE OFFLINE — …`.
// G. Playtest 1: ERASE ALL RECORDS. A first visit's title and keys; a played browser (UNIT-047's run recorded, UNIT-048's
//    saved); the button asks, ENTER and ESC keep, [DEL] erases and the page reloads to exactly the first visit's title and keys.
// No page errors anywhere, except the console lines the save itself writes for a corrupt save and a write that throws.
// ENTER is the kid's key on the RESUME block; where it does not do its job (it ran RECEIVE TRANSMISSION over the block before
// the slice 3c review fix B2), the check FAILs and the scenario goes on by the logged fallback: the storage as it was before
// the key, a reload, then __ap.resume() (or the ABANDON RUN button).
// About 5 minutes; shots under tests/.out/e2e/shots/resume-*.
// Usage: node tests/e2e/scenarios/resume.mjs   (env E2E_BASE_URL, SHOT_VIEWPORT; tests/e2e/run.mjs runs it)
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';
import { join } from 'node:path';

const SEED = 4;
const RUN_SAVE_KEY = 'arrival-protocol/run/v1';   // data/tuning.ts RUN_SAVE_KEY
// The console lines the save writes on purpose (systems/save-write.ts: each refusal's detail goes to console.error only).
// `[run save] can't resume (not-json): …` and `[run save] offline: the run-start write failed …`.
const EXPECTED_ERROR = /^\[run save\] (can't resume|offline)/;

const viewport = viewportFromEnv();
const browser = await launch();
const { check, finish } = checker();
const log = (text) => console.log(`      ${text}`);

// One page with its kit; `name` prefixes the shots.
async function openPage(name) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const kit = pageKit(page);
  const screens = runKit(page, kit);
  const shot = (what) => page.screenshot({ path: join(SHOTS, `resume-${name}-${what}.png`) });
  await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
  await kit.st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return { page, kit, screens, shot };
}

// The title as the kid reads it: the unit line and its stamp, the RESUME block (its line, the confirm, the four buttons as
// their key caps read), RECEIVE TRANSMISSION, the `runs save between ships` note, the lineage line.
const titleLook = (kit) => kit.st(() => {
  const read = (node) => node.nodeType === Node.TEXT_NODE ? node.textContent
    : node.nodeType !== Node.ELEMENT_NODE ? '' : node.matches('kbd.keycap') ? `[${node.textContent}]` : [...node.childNodes].map(read).join('');
  const button = (id) => { const el = document.getElementById(id); return el.hidden ? null : read(el).replace(/\s+/g, ' ').trim(); };
  const shown = (id) => !document.getElementById(id).hidden;
  const s = window.__ap.store.getState();
  return {
    phase: s.run.phase, card: shown('titleCard'), unit: document.getElementById('titleUnit').textContent,
    stamp: shown('titleStamp') ? document.getElementById('titleStamp').textContent : null,
    save: shown('titleSave') ? { kind: document.getElementById('titleSave').dataset.kind, line: document.getElementById('titleSaveLine').textContent,
      ask: shown('titleSaveAsk') ? document.getElementById('titleSaveAsk').textContent : null } : null,
    resume: button('titleResume'), newRun: button('titleNewRun'), abandon: button('titleAbandon'), keep: button('titleKeep'),
    receive: shown('titleReceive'), note: shown('titleNote') ? document.getElementById('titleNote').textContent : null,
    lineage: shown('titleLineage') ? document.getElementById('titleLineage').textContent : null,
  };
});

// From run 2 the launch line rolls its year up before its stamp lands (TITLE_LAUNCH_ROLL_*: about 2.4 s): the title read
// once it has settled.
const settledTitle = async (kit) => {
  await kit.waitFor(() => !document.getElementById('titleStamp').hidden, 6000);
  return titleLook(kit);
};

// The archive and the save as the page holds them.
const stored = (kit) => kit.st(() => {
  const meta = window.__ap.archive().meta;
  const save = window.__ap.save();
  let parsed = null;
  try { parsed = save.stored === null ? null : JSON.parse(save.stored); } catch { parsed = 'not json'; }
  return {
    runs: meta.runs, routes: meta.routes.length, activeRun: meta.activeRun === null ? null : meta.activeRun.unit,
    lastUnit: meta.lastUnit === null ? null : { number: meta.lastUnit.number, cause: meta.lastUnit.cause },
    status: save.state.status, resume: save.state.resume, refusal: save.state.refusal?.kind ?? null,
    point: parsed && parsed !== 'not json' ? parsed.point : parsed, line: parsed && parsed !== 'not json' ? parsed.resume : null,
    logMax: parsed && parsed !== 'not json' ? Math.max(-1, ...parsed.log.entries.map((entry) => entry.id)) : null,
    raw: save.stored,
  };
});

// The whole of the page's storage, to put back after a key that did the wrong thing (the logged fallback).
const snapshot = (kit) => kit.st(() => JSON.stringify(Object.entries(localStorage)));
const restore = (kit, snap) => kit.st((entries) => { localStorage.clear(); for (const [key, value] of JSON.parse(entries)) localStorage.setItem(key, value); }, snap);

// What a resumed (or first) desk shows, settled: the run's place, the chart's nodes, the INBOX's marks, the requests.
const deskState = async ({ kit, screens }) => {
  const desk = await screens.desk();
  const more = await kit.st(() => {
    const s = window.__ap.store.getState();
    return {
      shipIndex: s.run.shipIndex, year: s.run.map.galaxyYear, ships: s.run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`),
      read: [...window.__ap.inbox().read].sort(), inbox: window.__ap.inbox().messages.map((m) => m.id), requests: JSON.stringify(s.run.repo.requests),
      memory: s.memory.map((seg) => `${seg.name}:${seg.size}`).join(','), mode: s.ui.mode, unit: s.run.unitNumber,
      // Slice 4: the tree as the save keeps it (the bank's earnings, what was bought; nothing pending at a save point).
      skills: JSON.stringify({ earned: s.run.skills.earned, grants: s.run.skills.grants, bought: s.run.skills.bought, pending: s.run.skills.pending }),
      bought: s.run.skills.bought.map((buy) => `${buy.skill}:${buy.kind}:v${buy.to.version}`).join(),
      tab: document.getElementById('deskScreen').dataset.tab ?? null,
    };
  });
  return { where: desk.where, title: desk.title, route: desk.route, nodes: desk.nodes.map((node) => `${node.slot}:${node.state}`).join(' '), ...more };
};

// The DESK → the next ship's PACKET (a click on its node, ENTER; __ap.course if the click missed) → [1] → TRANSMIT ▸. The
// first PACKET's LOG READER opens by itself (slice 2): SPACE closes it first.
async function sendTo({ page, kit, screens }, slot, name) {
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
  await page.waitForTimeout(400);
  const clicked = await screens.clickNode(slot);
  await page.waitForTimeout(300);
  if (clicked === true && (await kit.st(() => window.__ap.store.getState().ui.deskSelected)) === slot) await page.keyboard.press('Enter');
  else { log(`the click on ${name}'s node missed (${clicked}): __ap.course(${slot})`); await kit.st((to) => window.__ap.course(to), slot); }
  const packet = await kit.waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 6000);
  await page.waitForTimeout(600);
  for (let i = 0; i < 4 && (await kit.st(() => !document.getElementById('logReader').hidden)); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  const picked = (await screens.pickCard(0)) !== null;
  await page.locator('#txGo').click({ timeout: 10000 });
  const boot = await kit.waitFor((ship) => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === ship, 20000, 100, name);
  return packet && picked && boot;
}

// A ship flown at once: the boot skipped, a circular orbit in the ring, every pod landed, the report through to the DESK.
async function flyToDesk({ kit, screens }, { skip = true } = {}) {
  if (skip) await kit.st(() => window.__ap.skipBoot());
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
  await screens.lockInRing();
  const report = await screens.landToReport();
  await screens.finishReport();
  const desk = await kit.waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
  return report && desk;
}

// The TERMINAL's boot lines from the log entry after `from` on (MIND channel, the `>` lines), once the boot is done.
const bootLines = (kit, from) => kit.st((after) => window.__ap.log().filter((entry) => entry.id > after && entry.channel === 'mind' && entry.text.startsWith('>'))
  .map((entry) => entry.text), from);
// What the boot made of the ship: the arrival's hits, the beam's seeds, the memory's files, the ship.
const arrival = (kit) => kit.st(() => {
  const s = window.__ap.store.getState();
  return {
    ship: s.level.shipName, shipIndex: s.run.shipIndex, hits: JSON.stringify(s.run.arrival.hits),
    seeds: s.memory.map((seg, i) => (seg.type === 'hollow' ? `${seg.name}@${i}` : null)).filter((seed) => seed !== null).join(','),
    memory: s.memory.map((seg) => `${seg.name}:${seg.size}`).join(','),
  };
});

// ENTER on the RESUME block, as the kid presses it. `ok(state)` judges the page afterwards (in the page). On a FAIL the
// storage goes back to before the key, the page reloads and `fallback` gets past it (logged), so the rest is still checked.
async function enterOnTitle(tab, label, ok, fallback, fallbackWhat, key = 'Enter') {
  const { page, kit } = tab;
  const snap = await snapshot(kit);
  const before = await stored(kit);
  await page.keyboard.press(key);
  await page.waitForTimeout(1500);
  const after = await kit.st(() => { const s = window.__ap.store.getState(); return { phase: s.run.phase, ship: s.level.shipName, shipIndex: s.run.shipIndex, unit: s.run.unitNumber }; });
  const afterStore = await stored(kit);
  const good = ok(after, before, afterStore);
  check(label, good, JSON.stringify({ after, runs: `${before.runs} → ${afterStore.runs}`, save: `${before.point} → ${afterStore.point}` }));
  if (!good) {
    log(`FALLBACK (src bug: ${key} did not do the RESUME block's job): the storage put back, a reload, then ${fallbackWhat}`);
    await tab.shot(`enter-bug-${label.slice(0, 24).replace(/[^A-Za-z0-9]+/g, '-')}`);
    await restore(kit, snap);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    try { await fallback(); } catch (err) { check(`${label}: the fallback (${fallbackWhat}) gets past it`, false, String(err).split('\n')[0]); }
  }
  return good;
}

// ======================================================================================================================
// A. Run 1 to the second DESK, a reload, ENTER resumes it.
// ======================================================================================================================
const tab = await openPage('a');
const { page, kit, screens, shot } = tab;
const { st, waitFor, errors } = kit;

const fresh = await titleLook(kit);
check('a fresh page: run 1\'s title, RECEIVE TRANSMISSION, `runs save between ships`, no RESUME block', fresh.card && fresh.phase === 'title'
  && fresh.unit === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT' && fresh.stamp === null && fresh.receive && fresh.save === null
  && fresh.note === 'runs save between ships', JSON.stringify(fresh));
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
const runStart = await stored(kit);
check('RECEIVE TRANSMISSION: RUN START is written (`SHIP 1 · bound for ARES-VII · 2300`), the archive counts the run', runStart.point === 'run-start'
  && runStart.status === 'ok' && runStart.line?.ship === 'ARES-VII' && runStart.line?.depth === 1 && runStart.runs === 1 && runStart.activeRun === 47,
  JSON.stringify({ ...runStart, raw: undefined }));
check('ARES-VII flown at once to its DESK', await flyToDesk(tab));
const shipDone1 = await stored(kit);
check('…SHIP DONE is written at the DESK (`SHIP 1 DONE · AT THE DESK`)', shipDone1.point === 'ship-done' && shipDone1.line?.depth === 1 && shipDone1.line?.ship === 'ARES-VII',
  JSON.stringify(shipDone1.line));
// Slice 4: the run's first desk opens on TRAINING, and SET COURSE waits for the required first pick: [1] arms AUTOBURN v1,
// ENTER fills the 1.5 s bar and trains it (pending until TRANSMIT ▸), ESC goes back to the card.
const firstTab = (await screens.deskTabs()).tab;
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
const armed = (await screens.desk()).go;
await page.keyboard.press('Enter');
const firstPick = await waitFor(() => window.__ap.store.getState().run.skills.pending.length === 1, 4000);
const pendingPick = await st(() => window.__ap.store.getState().run.skills.pending.map((buy) => `${buy.skill}:${buy.kind}:v${buy.to.version}`).join());
check('desk 1 opens on TRAINING: [1] arms AUTOBURN v1 (`TRAIN ▸ 3 CYCLES [ENTER]`), ENTER trains it (pending)', firstTab === 'training'
  && armed === 'TRAIN ▸ 3 CYCLES [ENTER]' && firstPick && pendingPick === 'autoburn:train:v1', JSON.stringify({ firstTab, armed, firstPick, pendingPick }));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// The welcome read in the INBOX (a read mark the save must keep), and Mv requested for HALCYON (the worked route's).
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
await page.locator('#deskScreen .ib-row').first().click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(400);
await page.keyboard.press('KeyR');
await page.waitForTimeout(300);
await page.locator('#deskScreen .rp-row[data-file="mv"]').click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(300);
check('desk 1: the INBOX\'s welcome read, Mv requested', await st(() => window.__ap.inbox().read.length >= 1 && window.__ap.store.getState().run.repo.pick === 'mv'),
  JSON.stringify(await st(() => ({ read: window.__ap.inbox().read, pick: window.__ap.store.getState().run.repo.pick }))));
check('the DESK → HALCYON: SET COURSE, the PACKET, TRANSMIT ▸, its boot', await sendTo(tab, 2, 'HALCYON'));
const beam2 = await stored(kit);
check('…BEAM is written with HALCYON\'s boot (`SHIP 2 · bound for HALCYON`)', beam2.point === 'beam' && beam2.line?.ship === 'HALCYON' && beam2.line?.depth === 2,
  JSON.stringify(beam2.line));
check('HALCYON flown at once to the second DESK', await flyToDesk(tab));
// The greying beat settles. Nothing is read here: a mark made at a desk after its SHIP DONE is not saved (the PACKET is no
// save point either: a reload resumes the desk as it opened).
await page.waitForTimeout(2900);
const desk2 = await deskState(tab);
const shipDone2 = await stored(kit);
check('…SHIP DONE at the second desk (`SHIP 2 DONE`, HALCYON\'s year)', shipDone2.point === 'ship-done' && shipDone2.line?.depth === 2 && shipDone2.line?.ship === 'HALCYON'
  && shipDone2.line?.year === desk2.year, JSON.stringify({ line: shipDone2.line, year: desk2.year }));
log(`desk 2 before the reload: ${desk2.where} · route ${desk2.route.join(',')} · read ${desk2.read.join(',')} · requests ${desk2.requests}`);
await shot('1-desk2');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeDesk = await titleLook(kit);
check(`reload at the desk: the RESUME block reads \`RESUME · UNIT-047 · SHIP 2 DONE · AT THE DESK · ${desk2.year}\``, resumeDesk.card && resumeDesk.phase === 'title'
  && resumeDesk.save?.kind === 'resume' && resumeDesk.save.line === `RESUME · UNIT-047 · SHIP 2 DONE · AT THE DESK · ${desk2.year}` && resumeDesk.save.ask === null,
  JSON.stringify(resumeDesk));
check('…RESUME ▸ [ENTER] and NEW RUN; no RECEIVE TRANSMISSION, no ABANDON RUN or KEEP IT, no `runs save between ships`',
  resumeDesk.resume === 'RESUME ▸ [ENTER]' && resumeDesk.newRun === 'NEW RUN' && !resumeDesk.receive && resumeDesk.abandon === null && resumeDesk.keep === null
  && resumeDesk.note === null, JSON.stringify(resumeDesk));
check('…the title names the saved run\'s unit (run 1\'s line)', resumeDesk.unit === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', resumeDesk.unit);
const atTitle = await stored(kit);
check('…nothing is written or counted on the title (the save as it was, the archive\'s run still in progress)', atTitle.raw === shipDone2.raw && atTitle.runs === 1
  && atTitle.activeRun === 47, JSON.stringify({ runs: atTitle.runs, activeRun: atTitle.activeRun, same: atTitle.raw === shipDone2.raw }));
await shot('2-resume-desk-title');
await enterOnTitle(tab, 'ENTER on RESUME ▸ resumes the saved DESK (not RECEIVE TRANSMISSION; the run not counted again)',
  (after, before, now) => after.phase === 'desk' && after.shipIndex === 1 && now.runs === before.runs && now.raw === before.raw,
  () => st(() => window.__ap.resume()), '__ap.resume()');
await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
await page.waitForTimeout(2900);
const desk2b = await deskState(tab);
const same = (key) => JSON.stringify(desk2b[key]) === JSON.stringify(desk2[key]);
check('…the same DESK: HALCYON done, the route, the year, the header line', same('shipIndex') && same('route') && same('year') && same('where') && same('ships') && same('unit'),
  JSON.stringify({ before: [desk2.where, desk2.route, desk2.year, desk2.ships], after: [desk2b.where, desk2b.route, desk2b.year, desk2b.ships] }));
check('…the chart\'s nodes in the same states once the greying beat replays', same('nodes'), `${desk2.nodes} | ${desk2b.nodes}`);
check('…the INBOX\'s messages and read marks kept, the requests as they were', same('read') && same('inbox') && same('requests'),
  JSON.stringify({ before: [desk2.read, desk2.requests], after: [desk2b.read, desk2b.requests] }));
check('…the unit\'s memory as it was, the amber screen', same('memory') && desk2b.mode === 'tools', JSON.stringify({ mode: desk2b.mode, memory: same('memory') }));
check('slice 4: …the training kept: AUTOBURN v1 bought at desk 1 and in memory, the same cycles and grants, nothing pending; the desk on the card (no first pick again)',
  same('skills') && desk2b.bought === 'autoburn:train:v1' && /AUTOBURN\.skl:\d+/.test(desk2b.memory) && desk2b.tab === 'card' && desk2.tab === 'card',
  JSON.stringify({ before: [desk2.bought, desk2.tab, desk2.skills], after: [desk2b.bought, desk2b.tab, desk2b.skills] }));
await shot('3-resumed-desk');

// ======================================================================================================================
// B. KESTREL's boot, a reload mid-flight, RESUME ▸ replays the boot.
// ======================================================================================================================
check('the resumed DESK → KESTREL: SET COURSE, the PACKET, TRANSMIT ▸, its boot', await sendTo(tab, 5, 'KESTREL'));
const beam3 = await stored(kit);
check('…BEAM is written with KESTREL\'s boot (`SHIP 3 · bound for KESTREL`)', beam3.point === 'beam' && beam3.line?.ship === 'KESTREL' && beam3.line?.depth === 3,
  JSON.stringify(beam3.line));
const booted1 = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 60000, 200);
await page.waitForTimeout(800);
const boot1 = await bootLines(kit, beam3.logMax);
const arrival1 = await arrival(kit);
check(`KESTREL's boot, typed in full, into the flight (${boot1.length} lines)`, booted1 && boot1.length >= 3 && arrival1.ship === 'KESTREL', boot1.slice(0, 4).join(' | '));
await page.waitForTimeout(3000);
await shot('4-kestrel-flight');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeBeam = await titleLook(kit);
check(`reload mid-flight: \`RESUME · UNIT-047 · SHIP 3 · bound for KESTREL · ${beam3.line?.year}\` with RESUME ▸ and NEW RUN`, resumeBeam.save?.kind === 'resume'
  && resumeBeam.save.line === `RESUME · UNIT-047 · SHIP 3 · bound for KESTREL · ${beam3.line?.year}` && resumeBeam.resume === 'RESUME ▸ [ENTER]' && resumeBeam.newRun === 'NEW RUN'
  && !resumeBeam.receive, JSON.stringify(resumeBeam));
await page.locator('#titleResume').click();
const reboot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'KESTREL', 6000, 50);
const rebootStore = await stored(kit);
check('a click on RESUME ▸ replays KESTREL from its boot (the run not counted again, the save untouched)', reboot && rebootStore.runs === 1 && rebootStore.raw === beam3.raw,
  JSON.stringify({ reboot, runs: rebootStore.runs, point: rebootStore.point }));
check('…the TERMINAL\'s history before the boot is the saved one', await st((max) => Math.max(-1, ...window.__ap.log().filter((entry) => entry.id <= max).map((entry) => entry.id)) === max, beam3.logMax));
const booted2 = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 60000, 200);
await page.waitForTimeout(800);
const boot2 = await bootLines(kit, beam3.logMax);
const arrival2 = await arrival(kit);
check('…the boot types the same lines as the first time', booted2 && JSON.stringify(boot2) === JSON.stringify(boot1),
  JSON.stringify({ first: boot1, again: boot2.filter((line, i) => line !== boot1[i]).slice(0, 4) }));
check('…with the same hits, seeds and memory', arrival2.ship === 'KESTREL' && arrival2.shipIndex === arrival1.shipIndex && arrival2.hits === arrival1.hits
  && arrival2.seeds === arrival1.seeds && arrival2.memory === arrival1.memory, JSON.stringify({ first: arrival1, again: arrival2 }));
await shot('5-kestrel-replayed');

// ======================================================================================================================
// C. KESTREL's LANDING REPORT, a reload: no save point there. NEW RUN's confirm, ESC keeps the run.
// ======================================================================================================================
await screens.lockInRing();
const kestrelReport = await screens.landToReport();
await waitFor(() => !document.getElementById('lrContinue').hidden, 20000, 200);
check('KESTREL lands, its LANDING REPORT up', kestrelReport);
const atReport = await stored(kit);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeReport = await titleLook(kit);
check('reload at KESTREL\'s report: no save point before the final ship, the line still resumes KESTREL\'s boot', atReport.raw === beam3.raw
  && resumeReport.save?.line === `RESUME · UNIT-047 · SHIP 3 · bound for KESTREL · ${beam3.line?.year}`, JSON.stringify(resumeReport.save));
await page.locator('#titleNewRun').click();
await page.waitForTimeout(400);
const asking = await titleLook(kit);
check('NEW RUN asks first: `ABANDON UNIT-047\'S RUN? · ITS SHIPS COUNT AS DONE`, ABANDON RUN [DEL] / KEEP IT [ENTER], RESUME and NEW RUN put away',
  asking.save?.ask === 'ABANDON UNIT-047\'S RUN? · ITS SHIPS COUNT AS DONE' && asking.abandon === 'ABANDON RUN [DEL]' && asking.keep === 'KEEP IT [ENTER]'
  && asking.resume === null && asking.newRun === null && asking.phase === 'title', JSON.stringify(asking));
await shot('6-new-run-confirm');
const keptBy = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(400);
  const kept = await titleLook(kit);
  const keptStore = await stored(kit);
  check(`…${key === 'Enter' ? 'ENTER' : 'ESC'} keeps it: the RESUME block back as it was, nothing abandoned or written`, kept.save?.ask === null && kept.resume === 'RESUME ▸ [ENTER]' && kept.newRun === 'NEW RUN'
    && kept.abandon === null && kept.keep === null && kept.phase === 'title' && keptStore.raw === beam3.raw && keptStore.runs === 1 && keptStore.activeRun === 47
    && keptStore.routes === 0, JSON.stringify({ kept, runs: keptStore.runs, routes: keptStore.routes }));
};
await keptBy('Enter');
await page.locator('#titleNewRun').click();
await page.waitForTimeout(400);
await keptBy('Escape');

// ======================================================================================================================
// D. LAST LIGHT's ENDING CHOSEN, a reload at its report, ENTER restores it, CONTINUE ends the run once.
// ======================================================================================================================
// On by the DESK (as a kid plays it; __ap.route also works since the slice 3c review fixes, its skipped ships given debug
// results): KESTREL again, VESPER and CORMORANT flown at once, then LAST LIGHT.
await page.locator('#titleResume').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000, 50);
check('KESTREL (resumed again) flown at once to its DESK', await flyToDesk(tab));
check('the DESK → VESPER, flown at once to its DESK', await sendTo(tab, 11, 'VESPER') && await flyToDesk(tab));
check('the DESK → CORMORANT (boarded), flown at once with HOLLOW asleep, to its DESK', await sendTo(tab, 15, 'CORMORANT') && await (async () => {
  await st(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
  await screens.lockInRing({ sleep: true });
  const landed = await screens.landToReport();
  await screens.finishReport();
  return landed && await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
})());
const lastUp = await sendTo(tab, 19, 'LAST LIGHT');
const beam6 = await stored(kit);
check('the DESK → LAST LIGHT: BEAM written with its boot (`SHIP 6 · bound for LAST LIGHT`)', lastUp && beam6.point === 'beam'
  && beam6.line?.ship === 'LAST LIGHT' && beam6.line?.depth === 6, JSON.stringify(beam6.line));
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
// DELETE for the duel (nothing was requested on the way).
await st(() => window.__ap.give('rm'));
await screens.lockInRing({ sleep: true });
const duel = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
// Slice 7a (R6, R7): the card comes once the landing has settled; PURGE, then REASSIGNMENT.
const twoSteps = await screens.finaleTwoSteps('purge', 'reassignment');
check('LAST LIGHT: the duel, the root deleted, the card\'s two steps (PURGE, REASSIGNMENT)', duel && twoSteps === null, `stopped at ${twoSteps}`);
const finalReport = await screens.landToReport();
await waitFor(() => !document.getElementById('lrContinue').hidden, 30000, 200);
await page.waitForTimeout(800);
const reportSeen = await st(() => ({ title: document.getElementById('lrTitle').textContent, route: document.getElementById('lrRoute').textContent,
  headline: window.__ap.landingReport().headline, finale: window.__ap.store.getState().hollow.finale.phase }));
const ending = await stored(kit);
check('…PURGE, LAST LIGHT\'s LANDING REPORT: ENDING CHOSEN is written (`LAST LIGHT · LANDING REPORT`)', finalReport && ending.point === 'ending-chosen'
  && ending.line?.ship === 'LAST LIGHT' && ending.status === 'ok', JSON.stringify({ line: ending.line, reportSeen }));
await shot('7-final-report');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const resumeEnding = await titleLook(kit);
check(`reload at the final report: \`RESUME · UNIT-047 · LAST LIGHT · LANDING REPORT · ${ending.line?.year}\``, resumeEnding.save?.kind === 'resume'
  && resumeEnding.save.line === `RESUME · UNIT-047 · LAST LIGHT · LANDING REPORT · ${ending.line?.year}` && !resumeEnding.receive, JSON.stringify(resumeEnding));
await enterOnTitle(tab, 'ENTER on RESUME ▸ restores LAST LIGHT\'s LANDING REPORT (the run not counted again)',
  (after, before, now) => after.phase === 'report' && after.ship === 'LAST LIGHT' && now.runs === before.runs && now.raw === before.raw,
  () => st(() => window.__ap.resume()), '__ap.resume()');
await waitFor(() => window.__ap.store.getState().run.phase === 'report' && !document.getElementById('landingReport').hidden, 6000);
await page.waitForTimeout(1500);
const reportBack = await st(() => ({ title: document.getElementById('lrTitle').textContent, route: document.getElementById('lrRoute').textContent,
  headline: window.__ap.landingReport().headline, finale: window.__ap.store.getState().hollow.finale.phase, shown: !document.getElementById('landingReport').hidden }));
check('…the same report: its title, route, headline and the finale chosen', reportBack.shown && reportBack.title === reportSeen.title && reportBack.route === reportSeen.route
  && reportBack.headline === reportSeen.headline && reportBack.finale === reportSeen.finale, JSON.stringify({ reportSeen, reportBack }));
await shot('8-final-report-resumed');
for (let i = 0; i < 10 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
const ended = await waitFor(() => window.__ap.store.getState().run.phase === 'end' && !document.getElementById('runEnd').hidden, 8000);
const afterEnd = await stored(kit);
check('CONTINUE ends the run once: the archive counts one run and one route, UNIT-047 recorded, nothing in progress, the save gone', ended && afterEnd.runs === 1
  && afterEnd.routes === 1 && afterEnd.activeRun === null && afterEnd.lastUnit?.number === 47 && afterEnd.raw === null && afterEnd.resume === null,
  JSON.stringify({ ...afterEnd, raw: afterEnd.raw?.slice(0, 40) ?? null }));
await page.waitForTimeout(3600);
const tally = await st(() => ({
  next: document.querySelector('#runEnd .re-next-line')?.textContent ?? null, summary: document.querySelector('#runEnd .re-next-summary')?.textContent ?? null,
  valve: document.querySelector('#runEnd .re-next-valve')?.textContent ?? null, leave: [...document.querySelectorAll('#runEnd .re-next-leave')].map((el) => el.textContent),
  model: window.__ap.store.getState().run.next,
}));
const nextYear = Number(/^NEXT UNIT LAUNCHES (\d{4}) · UNIT-048$/.exec(tally.next ?? '')?.[1] ?? NaN);
check('the RUN TALLY: `NEXT UNIT LAUNCHES <year> · UNIT-048` and the arm\'s update `THE ARM: n DONE · n MOVED ON · n REPORTED HOME`', nextYear >= 2300 && nextYear <= 2335
  && /^THE ARM: \d+ DONE · \d+ MOVED ON · \d+ REPORTED HOME$/.test(tally.summary ?? '') && tally.model?.unit === 48 && tally.model?.startYear === nextYear, JSON.stringify(tally));
await shot('9-run-tally');
// Slice 7a (R19): the EPILOGUE and the FINAL CARD before NEW RUN.
const night = await screens.throughTheNight('Space');
check('…then the EPILOGUE and the FINAL CARD (`STAND BY`) before NEW RUN', night.epilogue !== null && night.card?.title === 'STAND BY', JSON.stringify(night.card));
await waitFor(() => window.__ap.store.getState().run.phase === 'title' && !document.getElementById('titleCard').hidden, 6000);
const run2Title = await settledTitle(kit);
const gap = nextYear - 2300;
const launched = gap === 0 ? `UNIT-048 · YEAR ${nextYear} · LAUNCHED IN THE SAME YEAR AS UNIT-047` : `UNIT-048 · YEAR ${nextYear} · LAUNCHED ${gap} ${gap === 1 ? 'YEAR' : 'YEARS'} AFTER UNIT-047`;
check(`NEW RUN: UNIT-048's title, \`${launched}\` with its stamp, RECEIVE TRANSMISSION, no RESUME block`, run2Title.unit === launched
  && run2Title.stamp === (gap === 0 ? 'SAME YEAR' : `+${gap} ${gap === 1 ? 'YEAR' : 'YEARS'}`) && run2Title.receive && run2Title.save === null
  && run2Title.note === 'runs save between ships' && /^last: UNIT-047 · /.test(run2Title.lineage ?? ''), JSON.stringify(run2Title));
await shot('10-unit-048-title');

// ======================================================================================================================
// E. UNIT-048's RUN START, a reload in its boot, NEW RUN; ENTER on the confirm keeps it, DEL abandons it.
// ======================================================================================================================
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
await page.waitForTimeout(800);
const start48 = await stored(kit);
check('UNIT-048\'s RECEIVE: RUN START written (`SHIP 1 · bound for ARES-VIII`), the archive\'s second run', start48.point === 'run-start' && start48.line?.unit === 48
  && start48.line?.ship === 'ARES-VIII' && start48.runs === 2 && start48.activeRun === 48, JSON.stringify({ line: start48.line, runs: start48.runs }));
await page.reload({ waitUntil: 'networkidle' });
const resume48 = await settledTitle(kit);
check(`reload in the boot: \`RESUME · UNIT-048 · SHIP 1 · bound for ARES-VIII · ${start48.line?.year}\`, under UNIT-048's launch line`, resume48.save?.line
  === `RESUME · UNIT-048 · SHIP 1 · bound for ARES-VIII · ${start48.line?.year}` && resume48.unit === launched, JSON.stringify(resume48));
await page.locator('#titleNewRun').click();
await page.waitForTimeout(400);
const asking48 = await titleLook(kit);
check('…NEW RUN asks `ABANDON UNIT-048\'S RUN? · ITS SHIPS COUNT AS DONE`', asking48.save?.ask === 'ABANDON UNIT-048\'S RUN? · ITS SHIPS COUNT AS DONE'
  && asking48.abandon === 'ABANDON RUN [DEL]' && asking48.keep === 'KEEP IT [ENTER]', JSON.stringify(asking48));
const keptOk = (after, before, now) => after.phase === 'title' && after.unit === 48 && now.runs === before.runs && now.activeRun === 48 && now.raw === before.raw;
await enterOnTitle(tab, 'ENTER on the confirm keeps UNIT-048\'s run (nothing abandoned, the save as it was)', keptOk, async () => {}, 'nothing');
const kept48 = await titleLook(kit);
check('…the RESUME block back (RESUME ▸ [ENTER], NEW RUN)', kept48.resume === 'RESUME ▸ [ENTER]' && kept48.newRun === 'NEW RUN' && kept48.save?.ask === null,
  JSON.stringify(kept48));
await page.locator('#titleNewRun').click();
await page.waitForTimeout(400);
const abandonedOk = (after, before, now) => after.phase === 'title' && after.unit === 49 && now.runs === before.runs && now.activeRun === null
  && now.lastUnit?.number === 48 && now.lastUnit?.cause === 'abandoned' && now.raw === null;
await enterOnTitle(tab, 'DEL on the confirm abandons UNIT-048\'s run (recorded abandoned, the save cleared): UNIT-049\'s title', abandonedOk, async () => {
  await page.locator('#titleNewRun').click();
  await page.waitForTimeout(400);
  await page.locator('#titleAbandon').click();
}, 'NEW RUN, then a click on ABANDON RUN', 'Delete');
const t49 = await settledTitle(kit);
const s49 = await stored(kit);
check('…UNIT-049\'s title: launched after UNIT-048, RECEIVE TRANSMISSION, no RESUME block; the archive has UNIT-048 abandoned', abandonedOk({ phase: t49.phase, unit: 49 }, s49, s49)
  && /^UNIT-049 · YEAR \d{4} · LAUNCHED .* UNIT-048$/.test(t49.unit) && t49.receive && t49.save === null, JSON.stringify({ t49, lastUnit: s49.lastUnit }));
await shot('11-unit-049-title');
const errorsA = errors.filter((text) => !EXPECTED_ERROR.test(text));
check('no page errors through the resumes (A–E)', errorsA.length === 0, errorsA.slice(0, 4).join(' | '));
await page.context().close();

// ======================================================================================================================
// F. A corrupt save: CAN'T RESUME, ABANDON RUN; then the save's storage throws: NO SAVE.
// ======================================================================================================================
const tabF = await openPage('f');
await tabF.page.locator('#titleReceive').click();
await tabF.kit.waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
await tabF.page.waitForTimeout(600);
await tabF.kit.st(() => window.__ap.saveCorrupt());
await tabF.page.reload({ waitUntil: 'networkidle' });
await tabF.page.waitForTimeout(800);
const corrupt = await titleLook(tabF.kit);
const corruptStore = await stored(tabF.kit);
check('a corrupt save, a reload: `RUN SAVE CAN\'T RESUME · THE SAVE IS DAMAGED` with ABANDON RUN [ENTER] only (no RESUME, NEW RUN or RECEIVE)', corrupt.phase === 'title'
  && corrupt.save?.kind === 'cant-resume' && corrupt.save.line === 'RUN SAVE CAN\'T RESUME · THE SAVE IS DAMAGED' && corrupt.abandon === 'ABANDON RUN [ENTER]'
  && corrupt.resume === null && corrupt.newRun === null && corrupt.keep === null && !corrupt.receive && corrupt.note === null && corruptStore.refusal === 'not-json',
  JSON.stringify({ corrupt, refusal: corruptStore.refusal }));
log(`console on the corrupt save: ${tabF.kit.errors.join(' | ') || '(nothing)'}`);
await tabF.shot('1-cant-resume');
const abandonedCorrupt = (after, before, now) => after.phase === 'title' && after.unit === 48 && now.runs === 1 && now.activeRun === null
  && now.lastUnit?.number === 47 && now.lastUnit?.cause === 'signal-lost' && now.raw === null && now.status === 'ok';
await enterOnTitle(tabF, 'ENTER on CAN\'T RESUME abandons the run (UNIT-047 recorded signal-lost, the save cleared): UNIT-048\'s title', abandonedCorrupt,
  () => tabF.page.locator('#titleAbandon').click(), 'a click on ABANDON RUN');
const t48 = await settledTitle(tabF.kit);
const s48 = await stored(tabF.kit);
check('…UNIT-048\'s title, launched after UNIT-047, RECEIVE TRANSMISSION back, `runs save between ships`', abandonedCorrupt({ phase: t48.phase, unit: 48 }, s48, s48)
  && /^UNIT-048 · YEAR \d{4} · LAUNCHED .* UNIT-047$/.test(t48.unit) && t48.receive && t48.save === null && t48.note === 'runs save between ships',
  JSON.stringify({ t48, s48: { ...s48, raw: undefined } }));
await tabF.shot('2-abandoned');
// The run save's writes throw from here on (a full disk): the archive's own key still writes.
await tabF.kit.st((key) => {
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('the disk is full', 'QuotaExceededError'); return setItem.call(this, k, v); };
}, RUN_SAVE_KEY);
const errorsBeforeOffline = tabF.kit.errors.length;
await tabF.page.locator('#titleReceive').click();
await tabF.kit.waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
const offlineSeen = await tabF.kit.waitFor(() => !document.getElementById('footSave').hidden, 6000);
await tabF.page.waitForTimeout(2500);
const offline = await tabF.kit.st(() => ({
  foot: document.getElementById('footSave').hidden ? null : document.getElementById('footSave').textContent, status: window.__ap.save().state.status,
  line: window.__ap.log().some((entry) => entry.text.includes('RUN SAVE OFFLINE — a reload will lose this run')), phase: window.__ap.store.getState().run.phase,
}));
check('the save\'s storage throws at RUN START: the footer says NO SAVE, the TERMINAL `RUN SAVE OFFLINE — a reload will lose this run`, the run goes on',
  offlineSeen && offline.foot === 'NO SAVE' && offline.status === 'offline' && offline.line && ['boot', 'flight'].includes(offline.phase), JSON.stringify(offline));
log(`console on the write that threw: ${tabF.kit.errors.slice(errorsBeforeOffline).join(' | ') || '(nothing)'}`);
await tabF.shot('3-no-save');
const errorsF = tabF.kit.errors.filter((text) => !EXPECTED_ERROR.test(text));
check('no page errors on the corrupt save and the offline save (beyond the save\'s own console lines)', errorsF.length === 0, errorsF.slice(0, 4).join(' | '));

// --- G. Playtest 1 (note 1, plan §3.12): ERASE ALL RECORDS. A first visit's title and storage, then a played browser (run
// 1 recorded, UNIT-048's run saved in its boot); the button asks, ENTER keeps, ESC keeps, [DEL] erases and the page reloads
// to exactly the first visit's title and storage. ---------------------------------------------------------------------------
const tabG = await openPage('erase');
// The whole title as the kid reads it, with the lines titleLook leaves out (endings, traces, notes, the archive box).
const fullLook = async (kit) => ({
  ...(await titleLook(kit)),
  ...(await kit.st(() => {
    const text = (id) => (document.getElementById(id).hidden ? null : document.getElementById(id).textContent);
    return {
      endings: text('titleEndings'), traces: text('titleTraces'), notes: text('titleNotes'), archive: text('titleArchive'),
      erase: !document.getElementById('titleErase').hidden && !document.getElementById('titleEraseBtn').hidden
        ? document.getElementById('titleEraseBtn').textContent : null,
      eraseAsk: document.getElementById('titleEraseAsk').hidden ? null : document.getElementById('titleEraseAsk').innerText.replace(/\s+/g, ' ').trim(),
      run: window.__ap.store.getState().run.map.run, tutorial: window.__ap.store.getState().run.tutorial,
    };
  })),
});
const keysNow = (kit) => kit.st(() => window.__ap.storedKeys().sort());
const firstVisit = await fullLook(tabG.kit);
const firstKeys = await keysNow(tabG.kit);
check('a first visit: UNIT-047 · YEAR 2300, RECEIVE, no RESUME, and `ERASE ALL RECORDS` at the foot', firstVisit.phase === 'title'
  && /^UNIT-047 · YEAR 2300 · /.test(firstVisit.unit) && firstVisit.receive && firstVisit.save === null && firstVisit.erase === 'ERASE ALL RECORDS'
  && firstVisit.eraseAsk === null && firstVisit.run === 1 && firstVisit.tutorial, JSON.stringify(firstVisit));
// Played: UNIT-047's run recorded (won), then UNIT-048's RECEIVE (RUN START) and a reload in its boot.
await tabG.kit.st(() => window.__ap.archiveAs('won-purge'));
await tabG.page.reload({ waitUntil: 'networkidle' });
await tabG.page.waitForTimeout(600);
await tabG.page.locator('#titleReceive').click();
await tabG.kit.waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
await tabG.page.waitForTimeout(800);
await tabG.page.reload({ waitUntil: 'networkidle' });
await settledTitle(tabG.kit);
const playedLook = await fullLook(tabG.kit);
const playedKeys = await keysNow(tabG.kit);
check('played: UNIT-048\'s RESUME block, the archive and the run save stored, ERASE ALL RECORDS still offered',
  playedLook.save?.kind === 'resume' && /UNIT-048/.test(playedLook.save.line) && playedKeys.includes(RUN_SAVE_KEY) && playedKeys.length >= 2
  && playedLook.erase === 'ERASE ALL RECORDS', JSON.stringify({ playedLook, playedKeys }));
// The ask: the button opens the confirm; ENTER keeps (and starts nothing: the RESUME block's ENTER waits).
await tabG.page.locator('#titleEraseBtn').click();
await tabG.page.waitForTimeout(300);
const eraseAsking = await fullLook(tabG.kit);
check('the click asks `ERASE EVERY UNIT, COLONY AND RUN? · THIS CANNOT BE UNDONE` with ERASE [DEL] / KEEP [ENTER]',
  eraseAsking.eraseAsk === 'ERASE EVERY UNIT, COLONY AND RUN? · THIS CANNOT BE UNDONE ERASE DEL KEEP ENTER' && eraseAsking.erase === null,
  JSON.stringify(eraseAsking.eraseAsk));
await tabG.shot('1-erase-confirm');
await tabG.page.keyboard.press('Enter');
await tabG.page.waitForTimeout(400);
const kept = await fullLook(tabG.kit);
check('ENTER keeps: the confirm closes, the run is neither resumed nor started, every key still stored',
  kept.phase === 'title' && kept.eraseAsk === null && kept.erase === 'ERASE ALL RECORDS' && kept.save?.kind === 'resume'
  && JSON.stringify(await keysNow(tabG.kit)) === JSON.stringify(playedKeys), JSON.stringify(kept));
await tabG.page.locator('#titleEraseBtn').click();
await tabG.page.waitForTimeout(200);
await tabG.page.keyboard.press('Escape');
await tabG.page.waitForTimeout(300);
const escaped = await fullLook(tabG.kit);
check('ESC keeps too', escaped.phase === 'title' && escaped.eraseAsk === null && JSON.stringify(await keysNow(tabG.kit)) === JSON.stringify(playedKeys));
// [DEL] erases: the page reloads by itself.
await tabG.page.locator('#titleEraseBtn').click();
await tabG.page.waitForTimeout(200);
const reloaded = tabG.page.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
await tabG.page.keyboard.press('Delete');
const didReload = await reloaded;
await tabG.page.waitForLoadState('networkidle');
await tabG.page.waitForTimeout(800);
const afterErase = await fullLook(tabG.kit);
const afterKeys = await keysNow(tabG.kit);
check('[DEL] erases and the page reloads by itself', didReload);
check('after the erase the title is exactly a first visit\'s', JSON.stringify(afterErase) === JSON.stringify(firstVisit),
  JSON.stringify({ afterErase, firstVisit }));
check('…and the browser holds exactly what a first visit holds', JSON.stringify(afterKeys) === JSON.stringify(firstKeys),
  `${afterKeys.join(', ')} | ${firstKeys.join(', ')}`);
await tabG.shot('2-after-erase');
check('no page errors through the erase', tabG.kit.errors.length === 0, tabG.kit.errors.slice(0, 4).join(' | '));
await finish(browser);
