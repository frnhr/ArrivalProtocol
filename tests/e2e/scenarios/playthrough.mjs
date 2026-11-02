// The e2e playthrough: one whole run in the page on run 1's arm (slice 3a), title → ARES-VII → HALCYON → KESTREL → VESPER →
// CORMORANT → LAST LIGHT (the worked route [0, 2, 5, 11, 15, 19]) → the RUN TALLY → NEW RUN, played like a kid who does
// what the strip says:
// • the SHIP by keys: SPACE held on `hold [SPACE]` / `KEEP HOLDING` / `NOW` and let go on RELEASE / WAIT / TURN AROUND,
//   the preset key a line names (`press [S]`), [F] when it offers SKIP, [B] when it offers AUTOBURN, [TAB] when it says so;
// • the MIND by clicks: the tool chip the line names (SCAN, REPAIR, DELETE, COPY, SWAP, MOVE), then the block it names
//   (a file, a pod's driver `POD 02`, the root, a seed);
// • the landing (slice 1a) by keys and the POD BAY: [L] when the line names [L] (LAUNCH NOW, LAUNCH — WIDE DROP; an
//   inline confirm after it is answered yes with Enter), [F] when it offers SKIP, and on L12 (NO POD CAN LAUNCH, NO LZ IN
//   THE LAUNCH BAND, NO BAY CTRL, NO DROP DOT ON THIS ORBIT) END LANDING in the POD BAY window plus Enter on its confirm;
// • the screens between ships by their keys and buttons (SPACE on the boot and the LANDING REPORT; on the DESK a click on
//   the next ship's node, scoped to #deskScreen since the title's chart has [data-slot] nodes too, then ENTER; [1] and
//   TRANSMIT ▸ on the PACKET, the LOST card's button, PURGE on the finale's card, SPACE for NEW RUN on the RUN TALLY).
// The page's ?debug hooks (window.__ap) are read to judge what the kid saw, never to play, with three exceptions: a ship
// still flying after SHIP_MAX_MS is a FAIL, and is then put in its ring by hand so the rest of the run is still checked;
// a DESK click that misses its node is a FAIL, and the course is then set by __ap.course(slot); and the ships not in
// LAND_BY_STRIP land at once (__ap.landAll) to keep the tier's time (their POD BAY, GROUND TRACK and LANDING REPORT are
// still checked).
// Each ship is checked at its boot, its flight's first seconds, every strip line it showed, its end, its landing (the
// POD BAY and the GROUND TRACK at ORBIT LOCK, a launch by [L], the LZ counters), its LANDING REPORT (LANDED n / N, the
// credits, the stars, CONTINUE) and its DESK and PACKET; on LAST LIGHT the report after the finale; then the RUN TALLY and NEW RUN.
// Phase 3 slice 2 (the calm opening), per ship:
// • ARES-VII and HALCYON are calm: no hollow block, no HOLLOW line, nothing bitten, no TRACE meter. On ship 1 the kid
//   answers the SCAN lesson (`A FILE YOU DIDN'T PACK — SCAN it`: the `???` becomes 046.log) when it is shown (it is
//   missable), and on the first PACKET (after the DESK) the LOG READER opens on top by itself on entry 01 and takes
//   ESC/SPACE first; the kid closes it with SPACE.
// • KESTREL: the boot's ECC line names the beam seed next to Telemetry; the kid rm's it on `RM THE SEED` (DELETE, then the
//   seed); the TRACE meter shows; the report's TRACE line says what was left behind.
// • VESPER (slice 3a: the ark, ENGINE FAULT): 16 pods, and the controller's ghost thrust fires in the flight.
// • CORMORANT (slice 3a: HOLLOW's forced boarding, M3: the final ship is in range): its card says HOLLOW WILL FIND YOU ON
//   THIS BEAM, the PACKET to it carries the uninvited chip (`??? · n BLOCKS · NOT YOURS · RIDES FREE`, boarding); its boot
//   unpacks to 108%; HOLLOW is silent until it bites a pod, the kid fights it by REPAIR, it says `> ...047?` and names
//   itself (`> i was 046.`). The PACKET to LAST LIGHT carries it under its name (NO RM only with no rm aboard).
// • LAST LIGHT: THE DEAL stands in the TERMINAL with ACCEPT / REFUSE; the kid looks inside and REFUSEs it (or the lock
//   withdraws it), no deal button stands after ORBIT LOCK; then the duel and an ending.
// • Every TRANSMIT: 046.log's chip `046.log · n/12`, glowing while an entry is unread.
// • The RUN TALLY: six rows in route order, the route on its mini chart, n COLONIES FOUNDED, the score and rank; NEW RUN
//   is a fresh roll, run 2, with ARES-VIII at w0.
// About 20 minutes; shots under tests/.out/e2e/shots/play-*.
// Usage: node tests/e2e/scenarios/playthrough.mjs   (env E2E_BASE_URL, SEED, SHOT_VIEWPORT; tests/e2e/run.mjs runs it)
// Debugging a ship: PLAY_FROM=6 flies headless to LAST LIGHT after the title (__ap.route along the worked route, a fresh
// unit carried in; the earlier ships' checks are skipped), PLAY_TRACE=1 logs every strip line the kid reads, with the time
// and the screen. LAND_BY_STRIP=1,2,3,4,5,6 lands those ships by the strip (default 1,2,6: all six add about 4 minutes).
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';
import { join } from 'node:path';

const SEED = Number(process.env.SEED ?? 7);
// Run 1's worked route (slice-3a-plan §3): the slot on the arm and the ship's name.
const ROUTE = [
  { slot: 0, name: 'ARES-VII' }, { slot: 2, name: 'HALCYON' }, { slot: 5, name: 'KESTREL' },
  { slot: 11, name: 'VESPER' }, { slot: 15, name: 'CORMORANT' }, { slot: 19, name: 'LAST LIGHT' },
];
const SHIPS = ROUTE.map((stop) => stop.name);
const MAX_LINE_CHARS = 70;         // tuning.ts MAX_LINE_CHARS: what the strip promises to fit
const SHIP_MAX_MS = 6 * 60_000;    // a flight longer than this is stuck (a kid's whole run is about 15 minutes)
const SCREEN_MAX_MS = 3 * 60_000;  // a report, TRANSMIT
const LANDING_MAX_MS = 5 * 60_000; // a landing by the strip (LAST LIGHT's four LZs and its duel)
const POLL_MS = 80;                // the kid's eyes: how often it reads the strip
const VERBS = ['SCAN', 'REPAIR', 'DELETE', 'COPY', 'SWAP', 'MOVE'];
const FROM = Number(process.env.PLAY_FROM ?? 1);
const TRACE = process.env.PLAY_TRACE === '1';
// The ships (1-based) landed by the strip; the others land at once with __ap.landAll().
const LAND_BY_STRIP = new Set((process.env.LAND_BY_STRIP ?? '1,2,6').split(',').map(Number));

const viewport = viewportFromEnv();
const browser = await launch();
const context = await browser.newContext({ viewport });
const page = await context.newPage();
const { check, finish } = checker();
const kit = pageKit(page);
const { errors, st, waitFor } = kit;
const runScreens = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `play-${name}.png`) });
const log = (text) => console.log(`      ${text}`);
let navigations = 0;
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });

// --- What the kid sees, in one read ----------------------------------------------------------------------------------
const look = () => st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const strip = document.getElementById('objectiveText');
  // What the strip reads as text: a keycap (<kbd class="keycap">SPACE</kbd>) reads as the line's [SPACE].
  const read = (node) => node.nodeType === Node.TEXT_NODE ? node.textContent
    : node.nodeType !== Node.ELEMENT_NODE ? '' : node.matches('kbd.keycap') ? `[${node.textContent}]` : [...node.childNodes].map(read).join('');
  return {
    phase: s.run.phase, ship: s.level.shipName, status: s.burn.status, mode: s.ui.mode, pace: s.clock.pace,
    line: ap.director().shown?.text ?? '', lineId: ap.director().shown?.id ?? '', dom: read(strip), typing: !document.getElementById('objectiveCaret').hidden,
    fits: strip.scrollWidth <= strip.clientWidth + 1, firing: s.burn.firing, ops: ap.ops().length,
    // Slice 3a: VESPER's ENGINE FAULT: the controller's ghost bursts so far, and whether it can fire them.
    ghostBursts: s.burn.ghostBursts, ghostSpec: ap.caps().thrustCtrl.ghost !== null,
    choice: !document.getElementById('finaleChoice').hidden && document.getElementById('finaleChoice').classList.contains('armed'),
    lostCard: !document.getElementById('burnResult').hidden, auto: !document.getElementById('autoBtn').hidden,
    // Slice 2: the LOG READER over the screen, THE DEAL's buttons standing in the TERMINAL, HOLLOW in memory and in the
    // TERMINAL (its lines since this ship's boot, window.__e2eLogFrom), the TRACE meter (the amber chip's row, the blue
    // header's).
    reader: !document.getElementById('logReader').hidden,
    deal: [...document.querySelectorAll('#mindTermLines .choice-open .term-choice-btn')].map((btn) => btn.textContent.replace(/^[A-Z] /, '').trim()),
    hollowSegs: s.memory.filter((seg) => seg.type === 'hollow').length, infected: ap.hollow().infected.map((hit) => hit.file),
    hollowLines: ap.log().filter((entry) => entry.speaker === 'hollow' && entry.id > (window.__e2eLogFrom ?? -1)).map((entry) => entry.text),
    trace: ['mindChipTraceRow', 'memTrace'].filter((id) => !document.getElementById(id).hidden)
      .map((id) => `${id}:${document.querySelectorAll(`#${id} .tr-cell`).length}`),
  };
});

// --- The kid's hands -------------------------------------------------------------------------------------------------
let holding = false;
const hold = async (on) => {
  if (on && !holding) await page.keyboard.down('Space');
  if (!on && holding) await page.keyboard.up('Space');
  holding = on;
};
let lastTab = 0;
const toMode = async (mode, now) => { if (now !== mode) { lastTab = Date.now(); await page.keyboard.press('Tab'); } };

// The block a MIND line names: the longest file name, pod code (`POD 02`, a driver's name up to its ` · `) or the root
// the line mentions.
const resolveTarget = (line) => st(({ text, verbs }) => {
  const s = window.__ap.store.getState();
  const upper = text.toUpperCase();
  // `COPY your Repair`, `MOVE your FIREWALL`: the kid's own file (a tool named for its verb, FIREWALL.sys), the `YOUR`
  // that names one (`HUNTING YOUR TOOLS — COPY your Repair`).
  for (const [, own] of upper.matchAll(/\bYOUR ([A-Z]+)/g)) {
    const tool = s.memory.find((seg) => (seg.type === 'fs-tool' || seg.type === 'firewall') && seg.name.toUpperCase().split('.')[0] === own);
    if (tool) return { id: tool.id, name: tool.name.toUpperCase(), len: own.length };
  }
  // Slice 2: `A FILE YOU DIDN'T PACK — SCAN it` names the `???` file (046.log) by what it is, not by a name.
  if (/DIDN'T PACK/.test(upper)) {
    const log = s.memory.find((seg) => seg.type === 'log');
    if (log) return { id: log.id, name: '???', len: 3 };
  }
  // `THE EATEN BLOCK REPORTS HOME TOO — DELETE it`: the block a beam seed made by eating.
  if (/EATEN BLOCK/.test(upper)) {
    const eaten = s.memory.find((seg) => seg.type === 'hollow' && seg.beam && !seg.seed && !seg.root);
    if (eaten) return { id: eaten.id, name: 'THE EATEN BLOCK', len: 15 };
  }
  let best = null;
  for (const seg of s.memory) {
    // HOLLOW's blocks are never a target but for its root and its seeds.
    if (seg.type === 'free' || (seg.type === 'hollow' && !seg.root && !seg.seed)) continue;
    const names = [seg.name.toUpperCase(), seg.name.split(' · ')[0].toUpperCase()];
    if (seg.type === 'driver') names.push(`P${String(seg.pod).padStart(2, '0')}`);
    if (seg.type === 'core') names.push('THE CORE');
    if (seg.type === 'hollow' && seg.root) names.push('THE ROOT', 'ROOT');
    if (seg.type === 'hollow' && seg.seed) names.push('SEED', 'ITS SEED');
    for (const name of names) {
      // A tool's own file is named for its verb (Scan, Repair): `REPAIR it` names the tool, not the target. Its
      // backup (REPAIR.BAK) is a target like any file.
      if (name.length < 3 || verbs.includes(name) || !upper.includes(name)) continue;
      if (!best || name.length > best.len) best = { id: seg.id, name, len: name.length };
    }
  }
  return best;
}, { text: line, verbs: VERBS });

const mindByVerb = {};
const acted = new Map();   // `${verb}:${target}` → wall ms of the last try, so one line is not clicked every poll
let mindActions = 0;
let mindRefused = 0;
// A click the kid makes on a screen that may be re-rendering under it: a short wait, and a miss is counted, not fatal
// (the next poll reads the screen again).
const tap = async (locator, opts = {}) => {
  try { await locator.click({ force: true, timeout: 2000, ...opts }); return true; } catch { return false; }
};

// Where a MOVE goes: the kid hovers the free blocks of the rack the line names (any rack if none), reads the MOVE
// preview's label on each, and clicks the first one it calls SAFE (else the widest it hovered).
async function placeMove(line) {
  const rack = line.match(/\bRACK ([A-F])\b/)?.[1] ?? null;
  const spots = await st((wanted) => [...document.querySelectorAll('.addr-row')]
    .filter((row) => wanted === null || row.dataset.rack === wanted)
    .flatMap((row) => [...row.querySelectorAll('.seg.free:not(.reserved)')])
    .map((el) => el.getBoundingClientRect()).filter((box) => box.width > 8)
    .sort((a, b) => b.width - a.width).slice(0, 6)
    .map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })), rack);
  for (const spot of spots) {
    await page.mouse.move(spot.x, spot.y, { steps: 3 });
    await page.waitForTimeout(250);
    const label = await st(() => [...document.querySelectorAll('.move-preview-label.dest')].map((el) => el.innerText).join(' '));
    if (/SAFE/.test(label)) { await page.mouse.click(spot.x, spot.y); return 'safe'; }
  }
  if (spots[0]) { await page.mouse.click(spots[0].x, spots[0].y); return 'unsafe'; }
  await page.keyboard.press('Escape');
  return 'none';
}

const firstSeen = new Set();
async function mindAct(view) {
  const upper = view.line.toUpperCase();
  // Nothing to do with a tool the line says is spent.
  if (/NO REPAIR CHARGE LEFT/.test(upper)) return false;
  const verbs = VERBS.map((verb) => ({ verb, at: upper.search(new RegExp(`\\b${verb}\\b`)) })).filter((hit) => hit.at >= 0).sort((a, b) => a.at - b.at);
  // `BLOCK IT — use any tool on REPAIR.BAK`: SCAN is the cheapest tool there is.
  if (/USE ANY TOOL ON/.test(upper)) verbs.unshift({ verb: 'SCAN', at: 0 });
  if (verbs.length === 0) return false;
  const verb = verbs[0].verb;
  const target = await resolveTarget(view.line);
  if (!target) return false;
  const key = `${verb}:${target.id}`;
  if (Date.now() - (acted.get(key) ?? 0) < 4000) return false;
  acted.set(key, Date.now());
  await toMode('memory', view.mode);
  await page.waitForTimeout(150);
  const chip = page.locator(`#chip-${verb.toLowerCase()}`);
  if (!(await chip.isVisible().catch(() => false))) { mindRefused++; return false; }
  const held = await st(() => window.__ap.store.getState().ui.activeTool?.kind ?? null);
  if (held !== verb.toLowerCase() && !(await tap(chip))) { mindRefused++; return false; }
  await page.waitForTimeout(120);
  if (!(await tap(page.locator(`.seg[data-id="${target.id}"]`).first()))) { mindRefused++; return false; }
  let placed = '';
  if (verb === 'MOVE') { await page.waitForTimeout(200); placed = ` → ${await placeMove(view.line)}`; }
  await page.waitForTimeout(100);
  // Did a tool start on it (a MOVE's op runs on its clone, and a DELETE can be over at once)?
  const started = verb === 'MOVE' || await st((id) => window.__ap.ops().some((op) => op.segId === id) || window.__ap.store.getState().memory.every((seg) => seg.id !== id), target.id);
  if (!started) { mindRefused++; if (TRACE) log(`MIND: ${verb} ${target.name} started nothing ("${view.line}")`); }
  mindActions++;
  mindByVerb[verb] = (mindByVerb[verb] ?? 0) + 1;
  if (!firstSeen.has(key)) { firstSeen.add(key); log(`MIND: ${verb} ${target.name}${placed} ("${view.line}")`); }
  return true;
}

// Slice 2: THE DEAL (LAST LIGHT) stands in the TERMINAL with ACCEPT and REFUSE; the ticker says WANTS A DEAL. The kid
// looks inside and REFUSEs it by its button. The LOG READER, if something opened it, is closed with SPACE.
const deal = { seen: [], clicked: 0, standingAfterLock: 0 };
let lastDealTry = 0;
async function answerDeal(view) {
  if (!view.deal.includes('REFUSE') || Date.now() - lastDealTry < 1500) return false;
  lastDealTry = Date.now();
  if (deal.seen.length === 0) deal.seen = [...view.deal];
  await toMode('memory', view.mode);
  await page.waitForTimeout(250);
  const button = page.locator('#mindTermLines .choice-open .term-choice-btn', { hasText: 'REFUSE' }).first();
  if (await tap(button)) { deal.clicked++; log(`MIND: REFUSE on THE DEAL (${view.deal.join(' / ')})`); }
  return true;
}
async function closeReader(view) {
  if (!view.reader) return false;
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  return true;
}

// One poll of the kid in a flight: the SHIP's keys, or the MIND's clicks when the line asks for a tool.
async function flyStep(view) {
  if (await closeReader(view) || await answerDeal(view)) return;
  const text = view.line;
  // The strip names [TAB] only while the kid is on the wrong screen for what it asks; the strip lags a switch by a
  // tick or two, so a second TAB waits.
  if (/\[TAB\]/.test(text) && Date.now() - lastTab > 900) { lastTab = Date.now(); await page.keyboard.press('Tab'); return; }
  if (await mindAct(view)) return;
  if (/RELEASE|TOO EARLY|WAIT|TURN AROUND|HOLD STEADY/.test(text)) await hold(false);
  const preset = text.match(/press \[([WASD])\]/);
  if (preset) { await toMode('tools', view.mode); await page.keyboard.press(`Key${preset[1]}`); }
  if (/hold \[SPACE\]|KEEP HOLDING|NOW/i.test(text) && !/RELEASE/.test(text)) { await toMode('tools', view.mode); await hold(true); }
  if (/\[B\]/.test(text) && view.auto) await page.keyboard.press('KeyB');
  if (/\[F\]/.test(text) && view.pace !== 'skip') await page.keyboard.press('KeyF');
  if (/tap \[SPACE\]/.test(text)) { await page.keyboard.press('Space'); }
}

// --- The landing (slice 1a) ----------------------------------------------------------------------------------------------
const confirmOpen = () => st(() => !document.getElementById('inlineConfirm').hidden);
let lastLaunchKey = 0;
let lastEnd = 0;
// One poll of the kid in a landing: [TAB] when asked, [L] when the line names it, END LANDING on L12, the MIND's line,
// [F] when it offers SKIP. Never SPACE: LAUNCH NOW reads `NOW`, which the flight's rule takes for "hold SPACE".
async function landStep(view, tally) {
  if (await closeReader(view) || await answerDeal(view)) return;
  const text = view.line;
  if (/\[TAB\]/.test(text) && Date.now() - lastTab > 900) { lastTab = Date.now(); await page.keyboard.press('Tab'); return; }
  if (/\[L\]/.test(text)) {
    // A kid's reaction between presses: the bay's cadence (2 tac s) refuses a mashed key anyway.
    if (Date.now() - lastLaunchKey < 450) return;
    lastLaunchKey = Date.now();
    await page.keyboard.press('KeyL');
    tally.lPresses++;
    await page.waitForTimeout(120);
    // [L]'s guards ask first (off-site, an LZ already full): the strip said LAUNCH, so the kid says yes.
    if (await confirmOpen()) {
      tally.confirms.push(await st(() => document.getElementById('inlineConfirmQuestion').innerText));
      await page.keyboard.press('Enter');
    }
    return;
  }
  // L12 and its twins (landing-L12-band, -bay, -nodrop: every row that says END LANDING); not L12b (ALL PODS AWAY), which
  // only waits.
  if (/^landing-L12(-band|-bay|-nodrop)?$/.test(view.lineId)) {
    if (Date.now() - lastEnd < 3000) return;
    lastEnd = Date.now();
    // END LANDING is the POD BAY window's, on the SHIP screen; its inline confirm takes Enter.
    await toMode('tools', view.mode);
    await page.waitForTimeout(250);
    if (await tap(page.locator('#pbEnd'))) {
      await page.waitForTimeout(200);
      const question = await confirmOpen() ? await st(() => document.getElementById('inlineConfirmQuestion').innerText) : null;
      if (question !== null) await page.keyboard.press('Enter');
      tally.ends.push(`${view.line} → ${question ?? 'no confirm'}`);
    }
    return;
  }
  if (await mindAct(view)) return;
  if (/\[F\]/.test(text) && view.pace !== 'skip') { await page.keyboard.press('KeyF'); tally.fPresses++; }
}

// What the landing shows, in one read: the POD BAY window, the GROUND TRACK, the mini-HUD and the pods' fates.
const landingLook = () => st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const shown = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  };
  const fates = {};
  for (const pod of s.landing.pods) fates[pod.fate.kind] = (fates[pod.fate.kind] ?? 0) + 1;
  return {
    phase: s.run.phase, mode: s.ui.mode, body: document.body.classList.contains('landing'),
    bay: shown('podBayWin') && !document.getElementById('podBayWin').classList.contains('pb-waiting'),
    bayTitle: document.querySelector('#podBayWin .window-title')?.innerText ?? '',
    launchLabel: document.getElementById('pbLaunchLabel').innerText, bayText: document.getElementById('pbBay').innerText,
    lzs: [...document.querySelectorAll('#pbLzs .pb-lz')].map((el) => el.textContent),
    track: shown('groundTrack'), trackWorld: document.getElementById('gtWorld').innerText, trackDot: shown('gtDot'),
    mini: shown('mhLanding') ? document.getElementById('mhLandingText').innerText : null,
    onTarget: shown('mhOnTarget') ? document.getElementById('mhOnTarget').innerText : null,
    pods: s.landing.pods.length, fates, ended: s.landing.ended,
    finale: s.hollow.finale.phase, endingShowing: ap.finale().endingShowing,
  };
});

// --- The title --------------------------------------------------------------------------------------------------------
await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
const navsAtStart = navigations;
const title = await st(() => ({ visible: !document.getElementById('titleCard').hidden, unit: document.getElementById('titleUnit').innerText,
  button: document.getElementById('titleReceive').innerText, phase: window.__ap.store.getState().run.phase }));
check('title: the card is up with UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT and RECEIVE TRANSMISSION', title.visible && title.unit === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT'
  && title.button === '[ RECEIVE TRANSMISSION ]' && title.phase === 'title', JSON.stringify(title));
await shot('0-title');
await page.locator('#titleReceive').click();

// --- The ships ----------------------------------------------------------------------------------------------------------
const run = { lines: new Set(), long: [], unfit: new Set(), shipsFlown: [], landed: [], miniSeen: 0 };
if (FROM > 1) {
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
  await st((slots) => window.__ap.route(slots), ROUTE.slice(0, FROM).map((stop) => stop.slot));
}
for (const [index, name] of SHIPS.entries()) {
  if (index + 1 < FROM) continue;
  const tag = `${index + 1} ${name}`;
  const errorsBefore = errors.length;
  // Slice 2: what the kid met of HOLLOW and TRACE on this ship (from its boot on: its TERMINAL lines, its blocks in memory,
  // what it bit, the TRACE meter), noted on every poll of the flight and the landing.
  // From the TRANSMIT ▸ that brought the unit here (set at the send: the boot may be well along when this loop comes round).
  await st(() => {
    window.__e2eLogFrom = window.__e2eNextLogFrom ?? Math.max(-1, ...window.__ap.log().map((entry) => entry.id));
    window.__e2eNextLogFrom = undefined;
  });
  const met = { maxSegs: 0, lines: [], trace: new Set(), bitten: new Set(), firstBiteMs: null, firstLineMs: null, ghostBursts: 0, ghostSpec: false };
  const note = (seen) => {
    met.ghostBursts = Math.max(met.ghostBursts, seen.ghostBursts);
    met.ghostSpec ||= seen.ghostSpec;
    met.maxSegs = Math.max(met.maxSegs, seen.hollowSegs);
    for (const text of seen.hollowLines) if (!met.lines.includes(text)) met.lines.push(text);
    if (seen.hollowLines.length > 0) met.firstLineMs ??= Date.now();
    for (const file of seen.infected) met.bitten.add(file);
    if (seen.infected.length > 0) met.firstBiteMs ??= Date.now();
    for (const where of seen.trace) met.trace.add(where);
  };
  // Boot: the MIND's terminal types the ship's boot, the strip says how to skip it.
  const booted = await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 30000)
    && await waitFor(() => (window.__ap.director().shown?.text ?? '') !== '', 5000);
  const boot = await st(() => ({ ship: window.__ap.store.getState().level.shipName, crumb: document.getElementById('crumbShip').innerText,
    line: window.__ap.director().shown?.text ?? '', term: document.getElementById('mindTermLines').innerText.length }));
  // Slice 3a: the header crumb names the ship with the galaxy year on the arm (`KESTREL · 2467`).
  check(`${tag}: the boot starts on ${name}, the header names it with the galaxy year, the strip says how to skip`, booted && boot.ship === name
    && new RegExp(`^${name} · \\d{4}$`).test(boot.crumb) && /\[SPACE\] to skip/.test(boot.line), JSON.stringify(boot));
  await page.waitForTimeout(1500);
  check(`${tag}: …the TERMINAL types the boot`, await st(() => document.getElementById('mindTermLines').innerText.length > 0));
  await page.keyboard.press('Space');
  const flying = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  check(`${tag}: SPACE skips the boot into the flight`, flying);
  await page.waitForTimeout(1200);
  // Slice 2: the boot's unpack and ECC lines (the log keeps a skipped boot's lines too). HOLLOW boards on the beam into
  // CORMORANT only (slice 3a: M3, one hop from the final ship): its unpack runs on to 108%; KESTREL's ECC line names the
  // beam seed next to Telemetry.
  const bootLines = await st(() => window.__ap.log().filter((entry) => entry.id > window.__e2eLogFrom && /UNPACKING|ECC:/.test(entry.text)).map((entry) => entry.text));
  if (name === 'CORMORANT') {
    check(`${tag}: …the boot's unpack runs on to 108% (HOLLOW boarded on the beam)`, bootLines.some((text) => /100% \.\.\. 108%/.test(text)), bootLines.join(' | '));
  } else if (index > 0) {
    check(`${tag}: …the boot's unpack stops at 100% (nothing boarded)`, !bootLines.some((text) => /108%/.test(text)), bootLines.join(' | '));
  }
  if (name === 'KESTREL') {
    check(`${tag}: …its ECC line names the beam seed: 1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY`,
      bootLines.some((text) => text === '> ECC: 1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY'), bootLines.join(' | '));
  }
  const repairsBefore = mindByVerb.REPAIR ?? 0;

  // The flight's first seconds: the desk shows the ship.
  const desk = await st(() => {
    const s = window.__ap.store.getState();
    const value = (id) => document.getElementById(id)?.innerText ?? '';
    const fill = document.getElementById('fuelFill');
    return {
      mode: s.ui.mode, clock: value('clock'), speed: value('telSpeed'), altitude: value('telAltitude'), pace: value('paceLabel'),
      paths: document.querySelectorAll('#navplotSvg path, #navplotSvg polyline').length,
      fuelPct: s.burn.fuelPct, fuelWidth: fill ? parseFloat(fill.style.width || getComputedStyle(fill).width) : NaN,
      fuelFrac: fill && fill.parentElement ? fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width : NaN,
      windows: [...document.querySelectorAll('.desktop .window')].filter((win) => !win.hidden && win.getBoundingClientRect().width > 0).length,
      unit: value('crumbUnit'), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check(`${tag}: the flight opens on the SHIP with telemetry, a NAV PLOT path, the clock and the pace`, desk.mode === 'tools'
    && /^-?[\d,.]+$/.test(desk.speed) && /^-?[\d,.]+$/.test(desk.altitude) && desk.paths > 0 && /^T\+ \d+:\d\d:\d\d$/.test(desk.clock)
    && /TACTICAL|CRUISE/.test(desk.pace), JSON.stringify(desk));
  check(`${tag}: …the FUEL bar shows the tank (${desk.fuelPct.toFixed(0)}%)`, Math.abs(desk.fuelFrac * 100 - desk.fuelPct) < 3, `bar ${(desk.fuelFrac * 100).toFixed(1)}%`);
  check(`${tag}: …the desk has its windows open and nothing spills off the page`, desk.windows >= 3 && !desk.overflow, `${desk.windows} windows`);
  const clockA = desk.clock;
  await page.waitForTimeout(1100);
  check(`${tag}: …the clock runs`, (await st(() => document.getElementById('clock').innerText)) !== clockA);
  await shot(`${index + 1}a-flight`);

  // The flight, by the strip.
  const lines = new Set();
  let tabbed = 0;
  let modeFollowed = 0;
  let skips = 0;
  let typedSeen = 0;
  let typedMatched = 0;
  const flightStart = Date.now();
  const recent = [];
  let view = await look();
  let lastLine = '';
  while (Date.now() - flightStart < SHIP_MAX_MS && view.phase === 'flight' && view.status === 'approaching' && !view.lostCard) {
    if (view.line !== lastLine) {
      if (TRACE) log(`${((Date.now() - flightStart) / 1000).toFixed(1).padStart(6)} ${view.mode.padEnd(6)} ${view.pace.padEnd(8)} ${view.line}`);
      recent.push(view.line.replace(/\d+:\d\d/g, 'm:ss'));
      if (recent.length > 40) recent.shift();
      lines.add(view.line);
      run.lines.add(view.line);
      if (view.line.length > MAX_LINE_CHARS) run.long.push(view.line);
      lastLine = view.line;
    }
    if (!view.typing && view.dom) { typedSeen++; if (view.dom.replace(/\s+/g, ' ').trim() === view.line.replace(/\s+/g, ' ').trim()) typedMatched++; }
    if (!view.fits) run.unfit.add(view.line);
    const modeBefore = view.mode;
    const paceBefore = view.pace;
    await flyStep(view);
    await page.waitForTimeout(POLL_MS);
    view = await look();
    note(view);
    if (/\[TAB\]/.test(lastLine) && modeBefore !== view.mode) { tabbed++; modeFollowed++; }
    if (paceBefore !== 'skip' && view.pace === 'skip') skips++;
  }
  await hold(false);
  const stuck = view.phase === 'flight' && view.status === 'approaching' && !view.lostCard;
  const flightSec = (Date.now() - flightStart) / 1000;
  const outcome = await st(() => window.__ap.store.getState().burn.status);
  run.shipsFlown.push({ name, outcome, flightSec, lines: lines.size });
  check(`${tag}: the flight ends by the strip within ${SHIP_MAX_MS / 60000} minutes (${outcome}, ${flightSec.toFixed(0)} s, ${lines.size} lines)`,
    !stuck, stuck ? `still flying: "${view.line}"; lately: ${[...new Set(recent)].slice(-8).join(' | ')}` : '');
  check(`${tag}: …the strip's lines fit (≤ ${MAX_LINE_CHARS} characters, inside the strip)`, [...lines].every((line) => line.length <= MAX_LINE_CHARS)
    && ![...lines].some((line) => run.unfit.has(line)), [...lines].filter((line) => line.length > MAX_LINE_CHARS || run.unfit.has(line)).join(' | '));
  check(`${tag}: …the strip shows the line the director picked, once typed`, typedSeen > 0 && typedMatched / typedSeen > 0.9, `${typedMatched}/${typedSeen}`);
  if (tabbed > 0) check(`${tag}: …[TAB] switches screens when the strip asks (${modeFollowed}×)`, modeFollowed > 0);
  if (skips > 0) log(`${tag}: ${skips} SKIPs, ${mindActions} MIND actions so far, ${tabbed} TABs`);
  if (stuck) {
    // The one hand-placed step: put the ship in its ring so the rest of the run can still be checked.
    await st(() => {
      const ap = window.__ap;
      const s = ap.store.getState();
      const r = (s.level.ring.min + s.level.ring.max) / 2;
      ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
    });
    await waitFor(() => window.__ap.store.getState().burn.status !== 'approaching', 30000);
  }
  const ended = await st(() => ({ status: window.__ap.store.getState().burn.status, phase: window.__ap.store.getState().run.phase }));
  check(`${tag}: …it ends locked or accepted`, ['locked', 'accepted'].includes(ended.status), JSON.stringify(ended));
  await shot(`${index + 1}b-flight-end`);
  if (name === 'ARES-VII') {
    // The SCAN lesson (run 1, on the coast, missable): shown, the kid SCANs the `???`, and it is 046.log on the strip.
    const scan = await st(() => {
      const chip = document.querySelector('#memWrap [data-log-chip]');
      return { scanned: window.__ap.store.getState().run.log.scanned, name: chip?.querySelector('[data-log-name]')?.textContent ?? null,
        count: chip?.querySelector('[data-log-count]')?.textContent ?? null };
    });
    const asked = [...lines].some((text) => /A FILE YOU DIDN'T PACK — SCAN it/.test(text));
    if (asked) {
      check(`${tag}: …the SCAN lesson was answered: the \`???\` became 046.log (the strip's chip: 046 over n/12)`, scan.scanned && scan.name === '046' && /^\d+\/12$/.test(scan.count ?? ''),
        JSON.stringify(scan));
    } else log(`${tag}: the SCAN lesson was not shown (missable): ${JSON.stringify(scan)}`);
  }
  if (name === 'VESPER') {
    // Slice 3a: VESPER's ENGINE FAULT (Thrust Ctrl 31): the controller fires its ghost bursts in the flight.
    check(`${tag}: …ENGINE FAULT: the thrust controller's ghost thrust fired (${met.ghostBursts} bursts)`, met.ghostSpec && met.ghostBursts >= 1,
      JSON.stringify({ spec: met.ghostSpec, bursts: met.ghostBursts }));
  }
  if (name === 'KESTREL') {
    // The strip's RM lesson, the kid's DELETE on the seed, its words echoed; the TRACE meter showed.
    const rm = await st(() => ({
      seeds: window.__ap.store.getState().memory.filter((seg) => seg.type === 'hollow' && seg.seed).length,
      said: window.__ap.log().filter((entry) => /^> rm seed \.\.\. OK · it said: "/.test(entry.text)).map((entry) => entry.text),
    }));
    const lesson = [...lines].find((text) => /RM THE SEED/.test(text)) ?? null;
    check(`${tag}: …the strip said RM THE SEED and the kid rm'd it by DELETE (its words echoed, no seed left)`, lesson === 'RM THE SEED — pick up DELETE, click the seed'
      && rm.seeds === 0 && rm.said.length === 1, JSON.stringify({ lesson, ...rm }));
    check(`${tag}: …the TRACE meter showed (three cells)`, [...met.trace].some((where) => /:3$/.test(where)), [...met.trace].join(', ') || 'never');
  }

  // The landing (slice 1a): at ORBIT LOCK the POD BAY window and the GROUND TRACK open on the SHIP screen; then the
  // pods go down by the strip ([L], [F], END LANDING on L12), or at once (__ap.landAll) on the ships not in LAND_BY_STRIP.
  // The MIND's lines still apply: a bite now eats a pod's driver before it launches, and LAST LIGHT's duel is fought here.
  const byStrip = LAND_BY_STRIP.has(index + 1);
  const landStart = Date.now();
  const tally = { lPresses: 0, fPresses: 0, confirms: [], ends: [] };
  const landingLines = new Set();
  const lzFirst = new Map();   // LZ → the down count the POD BAY first showed
  const lzMost = new Map();    // LZ → the most it showed
  let miniRead = null;         // the mini-HUD's landing row, read once in the MIND
  let choiceAt = null;         // LAST LIGHT: when the finale's card was answered
  let opened = null;
  let landView = await look();
  if (landView.phase === 'landing') {
    // The kid looks at the SHIP for the lock's stamp (the POD BAY slides in a moment after it).
    await toMode('tools', landView.mode);
    await waitFor(() => !document.getElementById('podBayWin').classList.contains('pb-waiting') || window.__ap.store.getState().run.phase !== 'landing', 4000);
    await page.waitForTimeout(300);
    opened = await landingLook();
    check(`${tag}: ORBIT LOCK opens the POD BAY window (the launch button, the bay, a counter per LZ) and the GROUND TRACK`,
      opened.phase === 'landing' && opened.body && opened.bay && /POD BAY/i.test(opened.bayTitle) && /LAUNCH/.test(opened.launchLabel)
      && /^BAY /.test(opened.bayText) && opened.lzs.length >= 1 && opened.lzs.every((lz) => /^LZ-[A-Z] 0\/\d+$/.test(lz))
      && opened.track && opened.trackDot && opened.trackWorld.length > 0,
      JSON.stringify({ ...opened, fates: undefined, ended: undefined }));
    if (name === 'VESPER') check(`${tag}: …VESPER, the ark, lands 16 pods`, opened.pods === 16, `${opened.pods} pods`);
    await shot(`${index + 1}c-landing`);
    // The counters as ORBIT LOCK showed them (a landAll puts every pod down before the next read).
    for (const counter of opened.bay ? opened.lzs : []) {
      const match = /^(LZ-[A-Z]) (\d+)\/\d+/.exec(counter);
      if (match) { lzFirst.set(match[1], Number(match[2])); lzMost.set(match[1], Number(match[2])); }
    }
    if (!byStrip) log(`${tag}: lands at once (__ap.landAll: ${await st(() => window.__ap.landAll())} pods)`);
    while (Date.now() - landStart < LANDING_MAX_MS) {
      landView = await look();
      note(landView);
      if (landView.phase === 'landing' && landView.deal.length > 0) deal.standingAfterLock++;
      if (['report', 'transmit', 'end'].includes(landView.phase)) break;
      if (landView.lostCard) await tap(page.locator('#burnResultRetry'));
      else if (landView.choice) { if (await tap(page.locator('#fcPurge'))) choiceAt ??= Date.now(); }
      else if (landView.phase === 'landing') {
        if (landView.line && !landingLines.has(landView.line)) {
          if (TRACE) log(`${((Date.now() - landStart) / 1000).toFixed(1).padStart(6)} ${landView.mode.padEnd(6)} ${landView.pace.padEnd(8)} ${landView.line}`);
          landingLines.add(landView.line);
          run.lines.add(landView.line);
          if (landView.line.length > MAX_LINE_CHARS) run.long.push(landView.line);
        }
        if (!landView.fits) run.unfit.add(landView.line);
        await landStep(landView, tally);
        const seen = await landingLook();
        for (const counter of seen.lzs) {
          const match = /^(LZ-[A-Z]) (\d+)\/\d+/.exec(counter);
          if (!match) continue;
          if (!lzFirst.has(match[1])) lzFirst.set(match[1], Number(match[2]));
          lzMost.set(match[1], Math.max(lzMost.get(match[1]) ?? 0, Number(match[2])));
        }
        if (seen.mode === 'memory' && seen.mini !== null && miniRead === null) miniRead = { mini: seen.mini, onTarget: seen.onTarget };
      }
      await page.waitForTimeout(POLL_MS);
    }
    // The pods the player launched: on a ship landed by the strip only the kid's [L] launches (no landAll there).
    const landed = await st(() => ({
      launches: window.__ap.store.getState().landing.pods.filter((pod) => 'launch' in pod.fate && pod.fate.launch.source === 'player').length,
      pods: window.__ap.store.getState().landing.pods.map((pod) => pod.fate.kind),
      phase: window.__ap.store.getState().run.phase,
    }));
    const landSec = (Date.now() - landStart) / 1000;
    log(`${tag}: landing ${landSec.toFixed(0)} s, ${tally.lPresses} [L], ${tally.fPresses} [F], ${landed.launches} launched by the kid, pods ${landed.pods.join(' ')}`
      + `${tally.confirms.length ? `; confirms: ${tally.confirms.join(' | ')}` : ''}${tally.ends.length ? `; END LANDING: ${tally.ends.join(' | ')}` : ''}`);
    check(`${tag}: the landing ends in the LANDING REPORT within ${LANDING_MAX_MS / 60000} minutes (${landSec.toFixed(0)} s, ${landingLines.size} lines)`,
      landed.phase === 'report' || (landed.phase === 'end' && index === SHIPS.length - 1),
      `${landed.phase}: "${landView.line}"; lately: ${[...landingLines].slice(-6).join(' | ')}`);
    check(`${tag}: …its strip lines fit (≤ ${MAX_LINE_CHARS} characters, inside the strip)`,
      [...landingLines].every((line) => line.length <= MAX_LINE_CHARS && !run.unfit.has(line)),
      [...landingLines].filter((line) => line.length > MAX_LINE_CHARS || run.unfit.has(line)).join(' | '));
    if (byStrip) {
      check(`${tag}: …the kid launched by [L] when the strip named it (${tally.lPresses} presses, ${landed.launches} pods)`,
        tally.lPresses >= 1 && landed.launches >= 1);
    }
    const advanced = [...lzMost].filter(([lz, most]) => most > (lzFirst.get(lz) ?? 0));
    check(`${tag}: …the POD BAY's LZ counters advance as pods come down`, advanced.length >= 1,
      [...lzMost].map(([lz, most]) => `${lz} ${lzFirst.get(lz)}→${most}`).join(', '));
    if (miniRead) {
      check(`${tag}: …in the MIND the mini-HUD shows the bay, the pods down and ON TARGET`,
        /BAY [▮▯]*/.test(miniRead.mini) && /\d+\/\d+ DOWN/.test(miniRead.mini) && /ON TARGET \d+\/\d+/.test(miniRead.onTarget ?? ''), JSON.stringify(miniRead));
      run.miniSeen++;
    }
    run.landed.push({ name, byStrip, sec: landSec, launches: landed.launches, presses: tally.lPresses });
  } else {
    // A ship that did not end in orbit (a LOST card) never lands: on to whatever comes next.
    while (Date.now() - landStart < SCREEN_MAX_MS && !['report', 'transmit', 'end'].includes(landView.phase)) {
      if (landView.lostCard) await tap(page.locator('#burnResultRetry'));
      await page.waitForTimeout(250);
      landView = await look();
    }
  }
  if (landView.phase === 'end') {
    // The run ended on this ship (the Core lost, the flagship gone): RUN END is checked below, the rest is not flown.
    check(`${tag}: the run goes on past ${name}`, index === SHIPS.length - 1, `RUN END after ${name}: "${landView.line}"`);
    break;
  }

  // The LANDING REPORT: the rows count up, SPACE moves it on (the rows → the credits → the stars → CONTINUE).
  const reportOpen = await waitFor(() => !document.getElementById('landingReport').hidden, 5000);
  const reportAt = Date.now();
  const finaleAtReport = await st(() => ({ phase: window.__ap.store.getState().hollow.finale.phase, showing: window.__ap.finale().endingShowing }));
  if (index === SHIPS.length - 1) {
    check(`${tag}: the LANDING REPORT follows the finale (${finaleAtReport.phase}, its typed ending over)`,
      ['purged', 'merged', 'unresolved'].includes(finaleAtReport.phase) && !finaleAtReport.showing && (choiceAt === null || choiceAt < reportAt),
      JSON.stringify({ ...finaleAtReport, choiceAt, reportAt }));
  }
  await page.waitForTimeout(1500);
  const model = await st(() => window.__ap.landingReport());
  const rows = await st(() => ({
    title: document.getElementById('lrTitle').innerText, route: document.getElementById('lrRoute').innerText,
    rows: [...document.querySelectorAll('#lrRows .lr-row')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  }));
  check(`${tag}: LANDING REPORT: its title, ${name}'s route and a row per LZ`, reportOpen && rows.title === 'LANDING REPORT' && rows.route.includes(name)
    && rows.rows.length === model.rows.length && model.lzRows.every((lzRow) => rows.rows.some((row) => row.includes(lzRow.split(' ')[0]))),
    JSON.stringify({ ...rows, lzRows: model.lzRows }));
  await shot(`${index + 1}d-report`);
  // The roll may already be showing (ship 1's short report) or wait for one Space; read it whenever it shows, so a
  // Space never skips past it before it is read.
  const readCredits = () => st(() => ({ shown: !document.getElementById('lrCredits').hidden, names: [...document.querySelectorAll('#lrRoll > *')].map((el) => el.innerText.split('\n')[0]) }));
  let credits = await readCredits();
  if (!credits.shown) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1100);
    credits = await readCredits();
  }
  check(`${tag}: …the credits roll names a colonist per pod that scored (${model.credits.length})`, model.credits.length === 0
    ? credits.names.length === 0 : credits.shown && credits.names.length === model.credits.length, credits.names.slice(0, 3).join(' | '));
  if (byStrip) check(`${tag}: …the kid's landing put colonists down in an LZ`, model.landed > 0, model.headline);
  for (let i = 0; i < 8 && (await st(() => document.getElementById('lrContinue').hidden)); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(1100);
  const done = await st(() => ({
    headline: document.getElementById('lrHeadline').innerText,
    stars: [...document.querySelectorAll('#lrStars .wr-star')].map((star) => `${star.classList.contains('earned') ? '★' : '☆'}${star.dataset.star}`),
    starsShown: !document.getElementById('lrStars').hidden, charge: document.getElementById('lrCharge').innerText,
    chargeShown: !document.getElementById('lrCharge').hidden, skip: !document.getElementById('lrSkip').hidden,
    cont: document.getElementById('lrContinue').hidden ? null : document.getElementById('lrContinue').innerText,
    trace: document.getElementById('lrTrace').hidden ? null : document.getElementById('lrTrace').innerText,
  }));
  check(`${tag}: …the headline LANDED n / N (${done.headline})`, /^LANDED \d[\d,]* \/ [\d,]+$/.test(done.headline) && done.headline === model.headline,
    `model ${model.headline}`);
  check(`${tag}: …the stars land, earned as the model says (${done.stars.join(' ')})`, done.starsShown && done.stars.length === model.stars.length
    && done.stars.length >= 1 && model.stars.every((star, i) => done.stars[i] === `${star.earned ? '★' : '☆'}${star.id}`),
    JSON.stringify(model.stars.map((star) => `${star.earned ? '★' : '☆'}${star.id}`)));
  check(`${tag}: …then the charge line and CONTINUE (${done.cont})`, done.chargeShown && done.charge === model.chargeLine && !done.skip
    && done.cont !== null && /CONTINUE|RUN END/.test(done.cont), JSON.stringify(done));
  await shot(`${index + 1}e-report-done`);
  // Slice 2, per ship, over its flight and landing.
  if (index <= 1) {
    check(`${tag}: …calm all the way: no hollow block, no HOLLOW line, nothing bitten, no TRACE meter, no TRACE line on the report`,
      met.maxSegs === 0 && met.lines.length === 0 && met.bitten.size === 0 && met.trace.size === 0 && done.trace === null,
      JSON.stringify({ maxSegs: met.maxSegs, lines: met.lines, bitten: [...met.bitten], trace: [...met.trace], report: done.trace }));
  }
  if (name === 'KESTREL') {
    const seedsLeft = await st(() => window.__ap.store.getState().memory.filter((seg) => seg.type === 'hollow' && seg.beam).length);
    check(`${tag}: …the report's TRACE line says what the beam's seed left behind (${seedsLeft} beam-born blocks left)`, seedsLeft === 0
      ? /^NO SEEDS LEFT BEHIND · NOTHING REPORTS HOME · TRACE □□□$/.test(done.trace ?? '') : /SEEDS? LEFT BEHIND · (IT REPORTS|THEY REPORT) HOME · TRACE /.test(done.trace ?? ''),
      done.trace ?? 'no TRACE line');
  }
  if (name === 'CORMORANT') {
    // Silent until the capture closed the loop, then the bite, the kid's fight (REPAIR), `> ...047?`, and the naming.
    const story = await st(() => ({ named: window.__ap.store.getState().run.hollowNamed, owner: window.__ap.store.getState().memory.find((seg) => seg.type === 'hollow' && seg.root)?.owner ?? null }));
    const repairs = (mindByVerb.REPAIR ?? 0) - repairsBefore;
    check(`${tag}: …HOLLOW was silent until it bit (${[...met.bitten].join(', ') || 'nothing'}), then the kid fought it with REPAIR (${repairs}×)`,
      met.firstBiteMs !== null && (met.firstLineMs === null || met.firstLineMs >= met.firstBiteMs) && [...met.bitten].some((file) => /POD \d\d/.test(file)) && repairs >= 1,
      JSON.stringify({ bitten: [...met.bitten], firstLine: met.lines[0] ?? null, lineAfterBiteMs: met.firstLineMs && met.firstBiteMs ? met.firstLineMs - met.firstBiteMs : null }));
    check(`${tag}: …it said \`> ...047?\`, then named itself (\`> i was 046.\`, the root's owner UNIT-046)`, met.lines.includes('> ...047?')
      && met.lines.some((text) => /^> i was 046\./.test(text)) && story.named && story.owner === 'UNIT-046'
      && met.lines.indexOf('> ...047?') < met.lines.findIndex((text) => /^> i was 046\./.test(text)), JSON.stringify({ ...story, lines: met.lines }));
  }
  if (name === 'LAST LIGHT') {
    const outcome = await st(() => window.__ap.store.getState().run.stats.deal);
    check(`${tag}: …THE DEAL stood in the TERMINAL with ACCEPT / REFUSE before ORBIT LOCK; the kid REFUSEd it, or the lock withdrew it (${outcome?.outcome ?? 'never offered'})`,
      outcome !== null && (outcome.outcome === 'refused' ? deal.seen.includes('ACCEPT') && deal.seen.includes('REFUSE') && deal.clicked >= 1 : outcome.outcome === 'invalidated'),
      JSON.stringify({ outcome, deal }));
    check(`${tag}: …no deal button stood after ORBIT LOCK`, deal.standingAfterLock === 0, `${deal.standingAfterLock} polls`);
  }
  for (let i = 0; i < 6 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
    await page.keyboard.press(i % 2 === 0 ? 'Space' : 'Enter');
    await page.waitForTimeout(1300);
  }
  const afterReport = await st(() => window.__ap.store.getState().run.phase);
  if (index < SHIPS.length - 1) {
    // Slice 3a: the DESK. The kid reads the strip (PICK YOUR NEXT SHIP), clicks the next ship's node on the STAR CHART and
    // presses ENTER (SET COURSE ▸ NAME). A click that misses is a FAIL, and the course is set by __ap.course instead.
    const next = ROUTE[index + 1];
    const deskUp = await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 6000);
    await page.waitForTimeout(800);
    const deskBefore = await runScreens.desk();
    const nextNode = deskBefore.nodes.find((node) => node.slot === next.slot);
    check(`${tag}: CONTINUE leads to the DESK: STAR CHART, PICK YOUR NEXT SHIP, ${next.name} in reach`, afterReport === 'desk' && deskUp
      && deskBefore.title === 'STAR CHART' && deskBefore.step === 'PICK YOUR NEXT SHIP — click a ship or ← →' && deskBefore.selected === null
      && ['reachable', 'urgent'].includes(nextNode?.state ?? ''), JSON.stringify({ afterReport, step: deskBefore.step, selected: deskBefore.selected, next: nextNode }));
    await shot(`${index + 1}e1-desk`);
    const clicked = await runScreens.clickNode(next.slot);
    await page.waitForTimeout(400);
    const deskPicked = await runScreens.desk();
    const pickedOk = clicked === true && deskPicked.selected === next.slot && deskPicked.card?.name === next.name
      && deskPicked.go === `SET COURSE ▸ ${next.name} [ENTER]`;
    if (pickedOk) await page.keyboard.press('Enter');
    else {
      log(`${tag}: the click on ${next.name}'s node missed (${clicked}); __ap.course(${next.slot})`);
      await st((slot) => window.__ap.course(slot), next.slot);
    }
    const packetUp = await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 5000);
    check(`${tag}: …the kid clicks ${next.name}'s node (its card, \`SET COURSE ▸ ${next.name} [ENTER]\`) and ENTER opens its PACKET`, pickedOk && packetUp,
      JSON.stringify({ clicked, selected: deskPicked.selected, card: deskPicked.card?.name ?? null, go: deskPicked.go, packetUp }));
    if (next.name === 'CORMORANT') {
      check(`${tag}: …CORMORANT's card said HOLLOW WILL FIND YOU ON THIS BEAM (M3: the final ship is in range)`,
        deskPicked.card?.rows.includes('threat=HOLLOW WILL FIND YOU ON THIS BEAM') === true, JSON.stringify(deskPicked.card?.rows));
    }
    // Slice 2: on run 1, the first PACKET opens the LOG READER on entry 01 on top (it takes ESC and SPACE first); the kid
    // reads it and closes it with SPACE (the first SPACE finishes the typing, the next closes), and the PACKET under it
    // sends nothing.
    const readerUp = await waitFor(() => !document.getElementById('logReader').hidden, index === 0 ? 4000 : 800, 50);
    if (index === 0) {
      const reader = await st(() => ({ title: document.getElementById('lgTitle').innerText, open: document.querySelector('#lgRows .lg-row.open')?.dataset.entry ?? null,
        count: document.getElementById('lgCount').innerText, transmit: !document.getElementById('transmitScreen').hidden }));
      check(`${tag}: the LOG READER opens by itself on entry 01 over the first PACKET (${reader.title}, ${reader.count})`, readerUp && reader.title === '046.log'
        && reader.open === '1' && /^1 \/ 12 found$/.test(reader.count) && reader.transmit, JSON.stringify(reader));
      await page.waitForTimeout(1500);
      await shot(`${index + 1}e2-log-reader`);
      let presses = 0;
      for (; presses < 4 && (await st(() => !document.getElementById('logReader').hidden)); presses++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);
      }
      const after = await st(() => ({ hidden: document.getElementById('logReader').hidden, read: window.__ap.store.getState().run.log.read,
        phase: window.__ap.store.getState().run.phase, sent: document.querySelectorAll('#txChips .tx-chip.sent').length, paused: window.__ap.store.getState().clock.paused }));
      check(`${tag}: …SPACE closes it (${presses}×), entry 01 read, and the run goes on at TRANSMIT (nothing sent)`, after.hidden && after.read.includes(1)
        && after.phase === 'transmit' && after.sent === 0, JSON.stringify(after));
    } else {
      check(`${tag}: the LOG READER stays shut on the PACKET (it opened by itself once, on the first)`, !readerUp);
    }
    await page.waitForTimeout(1000);
    const tx = await st(() => ({
      next: document.getElementById('txNext').innerText, packet: document.getElementById('txPacketLine').innerText,
      chips: document.querySelectorAll('#txChips .tx-chip').length, cards: document.querySelectorAll('#txCards > *').length,
      go: document.getElementById('txGo').innerText,
    }));
    check(`${tag}: TRANSMIT names the next ship (${SHIPS[index + 1]}), the packet and the files as chips`,
      tx.next.startsWith(`NEXT: ${SHIPS[index + 1]}`) && /^LINK \d+ · FILES \d+/.test(tx.packet) && tx.chips >= 5, JSON.stringify(tx));
    check(`${tag}: …and deals cards to carry`, tx.cards >= 1, `${tx.cards} cards`);
    // Slice 2: 046.log's chip (`046.log · n/12`, glowing while an entry is unread), and HOLLOW riding the beam to VESPER
    // (boarding) and on to LAST LIGHT: the uninvited chip after the unit's own; NO RM only with no working rm aboard.
    const packet = await st(() => {
      const s = window.__ap.store.getState();
      const logChip = document.querySelector('#txChips .tx-chip.log-chip');
      const uninvited = document.querySelector('#txChips .tx-chip.uninvited');
      const rms = s.memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete');
      const rm = rms.length === 0 ? 'none' : rms.some((seg) => seg.integrity >= 100 && !seg.infected) ? 'whole' : 'hurt';
      return {
        log: logChip ? { name: logChip.querySelector('.tx-chip-name')?.innerText ?? '', glow: logChip.classList.contains('glow'), locked: logChip.classList.contains('locked') } : null,
        found: s.run.log.found.length, unread: s.run.log.found.filter((n) => !s.run.log.read.includes(n)).length,
        uninvited: uninvited ? { label: uninvited.getAttribute('aria-label'), boards: uninvited.classList.contains('boards'),
          last: uninvited === [...document.querySelectorAll('#txChips .tx-chip')].pop() } : null,
        trace: document.getElementById('txTrace').hidden ? null : document.getElementById('txTrace').innerText,
        noRm: document.getElementById('txNoRm').hidden ? null : document.getElementById('txNoRm').innerText, rm,
      };
    });
    check(`${tag}: …046.log rides as \`046.log · ${packet.found}/12\`, locked, glowing while an entry is unread (${packet.unread})`, packet.log !== null
      && packet.log.name === `046.log · ${packet.found}/12` && packet.log.locked && packet.log.glow === (packet.unread > 0) && packet.found >= index + 1, JSON.stringify(packet.log));
    if (SHIPS[index + 1] === 'CORMORANT') {
      check(`${tag}: …the uninvited chip rides after the unit's own: \`??? · n BLOCKS · NOT YOURS · RIDES FREE\`, boarding`, packet.uninvited !== null
        && /^\?\?\? · \d+ BLOCKS · NOT YOURS · RIDES FREE$/.test(packet.uninvited.label ?? '') && packet.uninvited.boards && packet.uninvited.last && /^TRACE [■□]{3}/.test(packet.trace ?? ''),
        JSON.stringify(packet));
    } else if (SHIPS[index + 1] === 'LAST LIGHT') {
      check(`${tag}: …HOLLOW rides on to LAST LIGHT under its name (\`UNIT-046 · n BLOCKS · NOT YOURS · RIDES FREE\`)`, packet.uninvited !== null
        && /^UNIT-046 · \d+ BLOCKS · NOT YOURS · RIDES FREE$/.test(packet.uninvited.label ?? '') && !packet.uninvited.boards, JSON.stringify(packet));
      // A hurt DELETE may or may not still work (isUsableTool decides): judged only for a whole one or none.
      if (packet.rm !== 'hurt') {
        check(`${tag}: …NO RM on the final packet only with no rm aboard (DELETE: ${packet.rm})`,
          packet.rm === 'whole' ? packet.noRm === null : packet.noRm === 'NO RM · YOU CAN\'T DELETE THE ROOT', JSON.stringify({ noRm: packet.noRm, rm: packet.rm }));
      } else log(`${tag}: DELETE is hurt at the final packet; NO RM ${packet.noRm === null ? 'not shown' : 'shown'}`);
    } else {
      check(`${tag}: …nothing uninvited rides the beam to ${SHIPS[index + 1]}`, packet.uninvited === null && packet.noRm === null, JSON.stringify(packet));
    }
    await shot(`${index + 1}f-transmit`);
    check(`${tag}: …[1] picks the first card`, (await runScreens.pickCard(0)) !== null);
    // The white-out is about a second long: watched in the page (every 30 ms), not by polls that load can space out.
    await st(() => {
      window.__e2eNextLogFrom = Math.max(-1, ...window.__ap.log().map((entry) => entry.id));
      window.__e2eWhite = 0;
      clearInterval(window.__e2eWhiteTimer);
      window.__e2eWhiteTimer = setInterval(() => {
        const el = document.getElementById('whiteOut');
        if (!el.hidden) window.__e2eWhite = Math.max(window.__e2eWhite, Number(getComputedStyle(el).opacity));
      }, 30);
    });
    await page.locator('#txGo').click({ timeout: 10000 });
    const white = await waitFor(() => window.__e2eWhite > 0.5, 15000, 100);
    await st(() => clearInterval(window.__e2eWhiteTimer));
    check(`${tag}: TRANSMIT ▸ sends, the screen floods white`, white);
  } else {
    check(`${tag}: CONTINUE on the last ship ends the run`, afterReport === 'end', afterReport);
  }
  const newErrors = errors.slice(errorsBefore);
  check(`${tag}: no page errors on this ship`, newErrors.length === 0, newErrors.slice(0, 3).join(' | '));
}

// --- The RUN TALLY and NEW RUN (slice 3a: RUN END's screen, its ship rows the run's route) -----------------------------
await waitFor(() => !document.getElementById('runEnd').hidden, 8000);
await page.waitForTimeout(3600);
const end = await st(() => ({
  title: document.getElementById('reTitle').innerText, total: document.getElementById('reTotal').innerText,
  tally: document.querySelector('#runEnd .re-tally-title')?.textContent ?? null,
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  colonies: document.querySelector('#runEnd .re-tally-colonies')?.textContent ?? null,
  route: document.querySelectorAll('#runEnd .re-tally-chart [data-slot]').length,
  score: document.getElementById('reScore').innerText, rank: document.getElementById('reRank').innerText, seed: document.getElementById('reSeed').innerText,
  model: window.__ap.runEndModel(),
}));
const fleetLanded = `/ ${end.model.fleetColonists.toLocaleString('en-US')} LANDED`;
check(`the RUN TALLY: a title, n ${fleetLanded}, six ship rows (no NOT REACHED), n COLONIES FOUNDED, the SCORE, the rank and the seed`, end.title.length > 0
  && end.tally === 'RUN TALLY' && end.total.endsWith(fleetLanded) && end.total === end.model.totalLine && end.ships.length === ROUTE.length
  && !end.ships.some((row) => /NOT REACHED/.test(row)) && end.colonies === end.model.coloniesLine && /^\d COLON(Y|IES) FOUNDED$/.test(end.colonies ?? '')
  && /^SCORE [\d,]+$/.test(end.score) && /^RANK · /.test(end.rank) && /^SEED [0-9A-F]{8}$/.test(end.seed),
  JSON.stringify({ ...end, model: undefined }));
check('the RUN TALLY: …the rows are the route in order, each with its depth and the ship\'s year', ROUTE.every((stop, i) => end.ships[i]?.startsWith(`${i + 1} ${stop.name} · `))
  && JSON.stringify(end.model.route) === JSON.stringify(ROUTE.map((stop) => stop.slot)), end.ships.join(' | '));
check('the RUN TALLY: …YOUR ROUTE drawn on the mini chart', end.route > 0, `${end.route} nodes drawn`);
log(`run: ${run.shipsFlown.map((ship) => `${ship.name} ${ship.outcome} ${ship.flightSec.toFixed(0)} s`).join(', ')}; ${run.lines.size} distinct lines, ${mindActions} MIND actions ${JSON.stringify(mindByVerb)} (${mindRefused} missed)`);
log(`landings: ${run.landed.map((ship) => `${ship.name} ${ship.byStrip ? 'by the strip' : 'at once'} ${ship.sec.toFixed(0)} s (${ship.presses} [L], ${ship.launches} launched)`).join(', ')}`);
check(`every strip line of the run fits (${run.lines.size} distinct)`, run.long.length === 0, run.long.slice(0, 3).join(' | '));
check(`every ship flown landed (${run.landed.length} of ${run.shipsFlown.length})`, run.landed.length === run.shipsFlown.length, run.landed.map((ship) => ship.name).join(', '));
check('the kid read the mini-HUD\'s landing row in the MIND at least once', run.miniSeen >= 1, `${run.miniSeen} ships`);
check('the kid followed the MIND by clicks at least once a ship', mindActions >= SHIPS.length, `${mindActions} actions, ${mindRefused} refused`);
await shot('7-run-tally');
const unitBefore = await st(() => window.__ap.store.getState().run.unitNumber);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const fresh = await st(() => {
  const s = window.__ap.store.getState();
  return { phase: s.run.phase, ship: s.level.shipName, title: !document.getElementById('titleCard').hidden, unit: document.getElementById('titleUnit').innerText,
    unitNumber: s.run.unitNumber, world: s.run.map.world, run: s.run.map.run, w0: s.run.map.arm[0]?.name ?? null, arm: s.run.map.arm.length,
    sameAsRun1: s.run.map.arm.map((ship) => ship.name).join() === 'ARES-VII,PETREL,HALCYON,OSPREY,HERON,KESTREL,ALBATROSS,CURLEW,LAPWING,GANNET,PLOVER,VESPER,SKYLARK,SHEARWATER,KITTIWAKE,CORMORANT,PROVIDENCE,GOOD HOPE,WAYFARER,LAST LIGHT' };
});
check('NEW RUN: back to the title, in the page (no reload): run 2 on a fresh roll of the arm, ARES-VIII at w0', fresh.phase === 'title' && fresh.title
  && fresh.world === 'arm' && fresh.run === 2 && fresh.w0 === 'ARES-VIII' && fresh.ship === 'ARES-VIII' && fresh.arm > 0 && !fresh.sameAsRun1
  && navigations === navsAtStart, JSON.stringify(fresh));
check('NEW RUN: …as the next unit', fresh.unitNumber === unitBefore + 1, `${unitBefore} → ${fresh.unitNumber} (${fresh.unit})`);
check('no page errors in the whole run', errors.length === 0, errors.slice(0, 4).join(' | '));
await finish(browser);
