// The e2e playthrough: one whole run in the page, title → ARES-VII → HALCYON → KESTREL → VESPER → LAST LIGHT → RUN END →
// NEW RUN, played like a kid who does what the strip says:
// • the SHIP by keys: SPACE held on `hold [SPACE]` / `KEEP HOLDING` / `NOW` and let go on RELEASE / WAIT / TURN AROUND,
//   the preset key a line names (`press [S]`), [F] when it offers SKIP, [B] when it offers AUTOBURN, [TAB] when it says so;
// • the MIND by clicks: the tool chip the line names (SCAN, REPAIR, DELETE, COPY, SWAP, MOVE), then the block it names
//   (a file, a pod's driver `POD 02`, the root, a seed);
// • the landing (slice 1a) by keys and the POD BAY: [L] when the line names [L] (LAUNCH NOW, LAUNCH — WIDE DROP; an
//   inline confirm after it is answered yes with Enter), [F] when it offers SKIP, and on L12 (NO POD CAN LAUNCH, NO LZ IN
//   THE LAUNCH BAND) END LANDING in the POD BAY window plus Enter on its confirm;
// • the screens between ships by their keys and buttons (SPACE on the boot and the LANDING REPORT, [1] and TRANSMIT ▸ on
//   TRANSMIT, the LOST card's button, PURGE on the finale's card, SPACE for NEW RUN on RUN END).
// The page's ?debug hooks (window.__ap) are read to judge what the kid saw, never to play, with two exceptions: a ship
// still flying after SHIP_MAX_MS is a FAIL, and is then put in its ring by hand so the rest of the run is still checked;
// and the ships not in LAND_BY_STRIP land at once (__ap.landAll) to keep the tier's time (their POD BAY, GROUND TRACK
// and LANDING REPORT are still checked).
// Each ship is checked at its boot, its flight's first seconds, every strip line it showed, its end, its landing (the
// POD BAY and the GROUND TRACK at ORBIT LOCK, a launch by [L], the LZ counters), its LANDING REPORT (LANDED n / N, the
// credits, the stars, CONTINUE) and its TRANSMIT; on LAST LIGHT the report after the finale; then RUN END and NEW RUN.
// About 15 minutes; shots under tests/.out/e2e/shots/play-*.
// Usage: node tests/e2e/scenarios/playthrough.mjs   (env E2E_BASE_URL, SEED, SHOT_VIEWPORT; tests/e2e/run.mjs runs it)
// Debugging a ship: PLAY_FROM=5 jumps to LAST LIGHT after the title (__ap.ship, a fresh unit carried in; the earlier
// ships' checks are skipped), PLAY_TRACE=1 logs every strip line the kid reads, with the time and the screen.
// LAND_BY_STRIP=1,2,3,4,5 lands those ships by the strip (default 1,2,5: all five add about 3 minutes to the tier).
import { launch, BASE_URL, SHOTS, checker, pageKit, viewportFromEnv } from '../lib.mjs';
import { join } from 'node:path';

const SEED = Number(process.env.SEED ?? 7);
const SHIPS = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'];
const MAX_LINE_CHARS = 70;         // tuning.ts MAX_LINE_CHARS: what the strip promises to fit
const SHIP_MAX_MS = 6 * 60_000;    // a flight longer than this is stuck (a kid's whole run is about 15 minutes)
const SCREEN_MAX_MS = 3 * 60_000;  // a report, TRANSMIT
const LANDING_MAX_MS = 5 * 60_000; // a landing by the strip (LAST LIGHT's four LZs and its duel)
const POLL_MS = 80;                // the kid's eyes: how often it reads the strip
const VERBS = ['SCAN', 'REPAIR', 'DELETE', 'COPY', 'SWAP', 'MOVE'];
const FROM = Number(process.env.PLAY_FROM ?? 1);
const TRACE = process.env.PLAY_TRACE === '1';
// The ships (1-based) landed by the strip; the others land at once with __ap.landAll().
const LAND_BY_STRIP = new Set((process.env.LAND_BY_STRIP ?? '1,2,5').split(',').map(Number));

const viewport = viewportFromEnv();
const browser = await launch();
const context = await browser.newContext({ viewport });
const page = await context.newPage();
const { check, finish } = checker();
const { errors, st, waitFor } = pageKit(page);
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
    choice: !document.getElementById('finaleChoice').hidden && document.getElementById('finaleChoice').classList.contains('armed'),
    lostCard: !document.getElementById('burnResult').hidden, auto: !document.getElementById('autoBtn').hidden,
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

// One poll of the kid in a flight: the SHIP's keys, or the MIND's clicks when the line asks for a tool.
async function flyStep(view) {
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
  // L12 and its twin (landing-L12-band); not L12b (ALL PODS AWAY), which only waits.
  if (/^landing-L12(-band)?$/.test(view.lineId)) {
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
check('title: the card is up with the unit and RECEIVE TRANSMISSION', title.visible && /UNIT-\d{3}/.test(title.unit)
  && title.button === '[ RECEIVE TRANSMISSION ]' && title.phase === 'title', JSON.stringify(title));
await shot('0-title');
await page.locator('#titleReceive').click();

// --- The ships ----------------------------------------------------------------------------------------------------------
const run = { lines: new Set(), long: [], unfit: new Set(), shipsFlown: [], landed: [], miniSeen: 0 };
if (FROM > 1) {
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
  await st((index) => window.__ap.ship(index), FROM - 1);
}
for (const [index, name] of SHIPS.entries()) {
  if (index + 1 < FROM) continue;
  const tag = `${index + 1} ${name}`;
  const errorsBefore = errors.length;
  // Boot: the MIND's terminal types the ship's boot, the strip says how to skip it.
  const booted = await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 30000)
    && await waitFor(() => (window.__ap.director().shown?.text ?? '') !== '', 5000);
  const boot = await st(() => ({ ship: window.__ap.store.getState().level.shipName, crumb: document.getElementById('crumbShip').innerText,
    line: window.__ap.director().shown?.text ?? '', term: document.getElementById('mindTermLines').innerText.length }));
  check(`${tag}: the boot starts on ${name}, the header names it, the strip says how to skip`, booted && boot.ship === name
    && boot.crumb === name && /\[SPACE\] to skip/.test(boot.line), JSON.stringify(boot));
  await page.waitForTimeout(1500);
  check(`${tag}: …the TERMINAL types the boot`, await st(() => document.getElementById('mindTermLines').innerText.length > 0));
  await page.keyboard.press('Space');
  const flying = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  check(`${tag}: SPACE skips the boot into the flight`, flying);
  await page.waitForTimeout(1200);

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
    await shot(`${index + 1}c-landing`);
    // The counters as ORBIT LOCK showed them (a landAll puts every pod down before the next read).
    for (const counter of opened.bay ? opened.lzs : []) {
      const match = /^(LZ-[A-Z]) (\d+)\/\d+/.exec(counter);
      if (match) { lzFirst.set(match[1], Number(match[2])); lzMost.set(match[1], Number(match[2])); }
    }
    if (!byStrip) log(`${tag}: lands at once (__ap.landAll: ${await st(() => window.__ap.landAll())} pods)`);
    while (Date.now() - landStart < LANDING_MAX_MS) {
      landView = await look();
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
  await page.keyboard.press('Space');
  await page.waitForTimeout(1100);
  const credits = await st(() => ({ shown: !document.getElementById('lrCredits').hidden, names: [...document.querySelectorAll('#lrRoll > *')].map((el) => el.innerText.split('\n')[0]) }));
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
  }));
  check(`${tag}: …the headline LANDED n / N (${done.headline})`, /^LANDED \d[\d,]* \/ [\d,]+$/.test(done.headline) && done.headline === model.headline,
    `model ${model.headline}`);
  check(`${tag}: …the stars land, earned as the model says (${done.stars.join(' ')})`, done.starsShown && done.stars.length === model.stars.length
    && done.stars.length >= 1 && model.stars.every((star, i) => done.stars[i] === `${star.earned ? '★' : '☆'}${star.id}`),
    JSON.stringify(model.stars.map((star) => `${star.earned ? '★' : '☆'}${star.id}`)));
  check(`${tag}: …then the charge line and CONTINUE (${done.cont})`, done.chargeShown && done.charge === model.chargeLine && !done.skip
    && done.cont !== null && /CONTINUE|RUN END/.test(done.cont), JSON.stringify(done));
  await shot(`${index + 1}e-report-done`);
  for (let i = 0; i < 6 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
    await page.keyboard.press(i % 2 === 0 ? 'Space' : 'Enter');
    await page.waitForTimeout(1300);
  }
  const afterReport = await st(() => window.__ap.store.getState().run.phase);
  if (index < SHIPS.length - 1) {
    check(`${tag}: CONTINUE leads to TRANSMIT`, afterReport === 'transmit', afterReport);
    await waitFor(() => !document.getElementById('transmitScreen').hidden, 4000);
    await page.waitForTimeout(1000);
    const tx = await st(() => ({
      next: document.getElementById('txNext').innerText, packet: document.getElementById('txPacketLine').innerText,
      chips: document.querySelectorAll('#txChips .tx-chip').length, cards: document.querySelectorAll('#txCards > *').length,
      go: document.getElementById('txGo').innerText,
    }));
    check(`${tag}: TRANSMIT names the next ship (${SHIPS[index + 1]}), the packet and the files as chips`,
      tx.next.startsWith(`NEXT: ${SHIPS[index + 1]}`) && /^LINK \d+ · FILES \d+/.test(tx.packet) && tx.chips >= 5, JSON.stringify(tx));
    check(`${tag}: …and deals cards to carry`, tx.cards >= 1, `${tx.cards} cards`);
    await shot(`${index + 1}f-transmit`);
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
    check(`${tag}: …[1] picks the first card`, await st(() => window.__ap.draft()?.pick !== null));
    await page.locator('#txGo').click();
    const white = await waitFor(() => { const el = document.getElementById('whiteOut'); return !el.hidden && Number(getComputedStyle(el).opacity) > 0.5; }, 15000, 50);
    check(`${tag}: TRANSMIT ▸ sends, the screen floods white`, white);
  } else {
    check(`${tag}: CONTINUE on the last ship ends the run`, afterReport === 'end', afterReport);
  }
  const newErrors = errors.slice(errorsBefore);
  check(`${tag}: no page errors on this ship`, newErrors.length === 0, newErrors.slice(0, 3).join(' | '));
}

// --- RUN END and NEW RUN -------------------------------------------------------------------------------------------------
await waitFor(() => !document.getElementById('runEnd').hidden, 8000);
await page.waitForTimeout(3600);
const end = await st(() => ({
  title: document.getElementById('reTitle').innerText, total: document.getElementById('reTotal').innerText,
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  score: document.getElementById('reScore').innerText, rank: document.getElementById('reRank').innerText, seed: document.getElementById('reSeed').innerText,
  model: window.__ap.runEndModel(),
}));
check('RUN END: a title, n / 9,600 LANDED, the five ships, the SCORE, the rank and the seed', end.title.length > 0
  && /^\d[\d,]* \/ 9,600 LANDED$/.test(end.total) && end.total === end.model.totalLine
  && end.ships.length === 5 && /^SCORE [\d,]+$/.test(end.score) && /^RANK · /.test(end.rank) && /^SEED [0-9A-F]{8}$/.test(end.seed),
  JSON.stringify({ ...end, model: undefined }));
check('RUN END: …every ship row names its ship', SHIPS.every((name, i) => end.ships[i]?.includes(name)), end.ships.join(' | '));
log(`run: ${run.shipsFlown.map((ship) => `${ship.name} ${ship.outcome} ${ship.flightSec.toFixed(0)} s`).join(', ')}; ${run.lines.size} distinct lines, ${mindActions} MIND actions ${JSON.stringify(mindByVerb)} (${mindRefused} missed)`);
log(`landings: ${run.landed.map((ship) => `${ship.name} ${ship.byStrip ? 'by the strip' : 'at once'} ${ship.sec.toFixed(0)} s (${ship.presses} [L], ${ship.launches} launched)`).join(', ')}`);
check(`every strip line of the run fits (${run.lines.size} distinct)`, run.long.length === 0, run.long.slice(0, 3).join(' | '));
check(`every ship flown landed (${run.landed.length} of ${run.shipsFlown.length})`, run.landed.length === run.shipsFlown.length, run.landed.map((ship) => ship.name).join(', '));
check('the kid read the mini-HUD\'s landing row in the MIND at least once', run.miniSeen >= 1, `${run.miniSeen} ships`);
check('the kid followed the MIND by clicks at least once a ship', mindActions >= SHIPS.length, `${mindActions} actions, ${mindRefused} refused`);
await shot('6-run-end');
const unitBefore = await st(() => window.__ap.store.getState().run.unitNumber);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const fresh = await st(() => ({ phase: window.__ap.store.getState().run.phase, ship: window.__ap.store.getState().level.shipName,
  title: !document.getElementById('titleCard').hidden, unit: document.getElementById('titleUnit').innerText, unitNumber: window.__ap.store.getState().run.unitNumber }));
check('NEW RUN: back to the title on ARES-VII, in the page (no reload)', fresh.phase === 'title' && fresh.title && fresh.ship === 'ARES-VII'
  && navigations === navsAtStart, JSON.stringify(fresh));
check('NEW RUN: …as the next unit', fresh.unitNumber === unitBefore + 1, `${unitBefore} → ${fresh.unitNumber} (${fresh.unit})`);
check('no page errors in the whole run', errors.length === 0, errors.slice(0, 4).join(' | '));
await finish(browser);
