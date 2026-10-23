// The e2e playthrough: one whole run in the page, title → ARES-VII → HALCYON → KESTREL → VESPER → LAST LIGHT → RUN END →
// NEW RUN, played like a kid who does what the strip says:
// • the SHIP by keys: SPACE held on `hold [SPACE]` / `KEEP HOLDING` / `NOW` and let go on RELEASE / WAIT / TURN AROUND,
//   the preset key a line names (`press [S]`), [F] when it offers SKIP, [B] when it offers AUTOBURN, [TAB] when it says so;
// • the MIND by clicks: the tool chip the line names (SCAN, REPAIR, DELETE, COPY, SWAP, MOVE), then the block it names
//   (a file, a cluster code, the root, a seed);
// • the screens between ships by their keys and buttons (SPACE on the boot and the WAKE REPORT, [1] and TRANSMIT ▸ on
//   TRANSMIT, the LOST card's button, PURGE on the finale's card, SPACE for NEW RUN on RUN END).
// The page's ?debug hooks (window.__ap) are read to judge what the kid saw, never to play, with one exception: a ship
// still flying after SHIP_MAX_MS is a FAIL, and is then put in its ring by hand so the rest of the run is still checked.
// Each ship is checked at its boot, its flight's first seconds, every strip line it showed, its end, its printing, its
// WAKE REPORT and its TRANSMIT; then RUN END and NEW RUN. About 15 minutes; shots under tests/.out/e2e/shots/play-*.
// Usage: node tests/e2e/scenarios/playthrough.mjs   (env E2E_BASE_URL, SEED, SHOT_VIEWPORT; tests/e2e/run.mjs runs it)
import { launch, BASE_URL, SHOTS, checker, pageKit, viewportFromEnv } from '../lib.mjs';
import { join } from 'node:path';

const SEED = Number(process.env.SEED ?? 7);
const SHIPS = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'];
const MAX_LINE_CHARS = 70;         // tuning.ts MAX_LINE_CHARS: what the strip promises to fit
const SHIP_MAX_MS = 6 * 60_000;    // a flight longer than this is stuck (a kid's whole run is about 15 minutes)
const SCREEN_MAX_MS = 3 * 60_000;  // printing, a report, TRANSMIT
const POLL_MS = 80;                // the kid's eyes: how often it reads the strip
const VERBS = ['SCAN', 'REPAIR', 'DELETE', 'COPY', 'SWAP', 'MOVE'];

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
    line: ap.director().shown?.text ?? '', dom: read(strip), typing: !document.getElementById('objectiveCaret').hidden,
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
const toMode = async (mode, now) => { if (now !== mode) await page.keyboard.press('Tab'); };

// The block a MIND line names: the longest file name, cluster code or the root the line mentions. `IT` after a cluster
// code (`C12 WILL BE EATEN … — REPAIR IT`) is that cluster.
const resolveTarget = (line) => st(({ text, verbs }) => {
  const s = window.__ap.store.getState();
  const upper = text.toUpperCase();
  let best = null;
  for (const seg of s.memory) {
    if (seg.type === 'free') continue;
    const names = [seg.name.toUpperCase(), seg.name.split(' · ')[0].toUpperCase()];
    if (seg.type === 'soul') names.push(seg.cluster);
    if (seg.type === 'hollow' && seg.id === 'root') names.push('THE ROOT', 'ROOT');
    if (seg.type === 'seed') names.push('SEED', 'ITS SEED');
    for (const name of names) {
      // A tool's own file is named for its verb (Scan, Repair.bak): `REPAIR it` names the tool, not the target.
      if (name.length < 3 || verbs.some((verb) => name.startsWith(verb)) || !upper.includes(name)) continue;
      if (!best || name.length > best.len) best = { id: seg.id, name, len: name.length };
    }
  }
  return best;
}, { text: line, verbs: VERBS });

const acted = new Map();   // `${verb}:${target}` → wall ms of the last try, so one line is not clicked every poll
let mindActions = 0;
let mindRefused = 0;
async function mindAct(view) {
  const upper = view.line.toUpperCase();
  const verbs = VERBS.map((verb) => ({ verb, at: upper.search(new RegExp(`\\b${verb}\\b`)) })).filter((hit) => hit.at >= 0).sort((a, b) => a.at - b.at);
  if (verbs.length === 0) return false;
  const target = await resolveTarget(view.line);
  if (!target) return false;
  const key = `${verbs[0].verb}:${target.id}`;
  if (Date.now() - (acted.get(key) ?? 0) < 4000) return false;
  acted.set(key, Date.now());
  await toMode('memory', view.mode);
  await page.waitForTimeout(150);
  const chip = page.locator(`#chip-${verbs[0].verb.toLowerCase()}`);
  if (!(await chip.isVisible().catch(() => false))) { mindRefused++; log(`no ${verbs[0].verb} chip for "${view.line}"`); return false; }
  const held = await st(() => window.__ap.store.getState().ui.activeTool?.kind ?? null);
  if (held !== verbs[0].verb.toLowerCase()) await chip.click({ force: true });
  await page.waitForTimeout(120);
  const block = page.locator(`.seg[data-id="${target.id}"]`).first();
  if (!(await block.count())) { mindRefused++; log(`no block ${target.id} on screen for "${view.line}"`); return false; }
  await block.click({ force: true });
  mindActions++;
  log(`MIND: ${verbs[0].verb} ${target.name} ("${view.line}")`);
  return true;
}

// One poll of the kid in a flight: the SHIP's keys, or the MIND's clicks when the line asks for a tool.
async function flyStep(view) {
  const text = view.line;
  if (/\[TAB\] BACK/.test(text)) { await toMode('tools', view.mode); }
  else if (/\[TAB\]/.test(text) && view.mode === 'tools' && !/BACK/.test(text)) { await page.keyboard.press('Tab'); return; }
  if (await mindAct(view)) return;
  if (/RELEASE|TOO EARLY|WAIT|TURN AROUND|HOLD STEADY/.test(text)) await hold(false);
  const preset = text.match(/press \[([WASD])\]/);
  if (preset) { await toMode('tools', view.mode); await page.keyboard.press(`Key${preset[1]}`); }
  if (/hold \[SPACE\]|KEEP HOLDING|NOW/i.test(text) && !/RELEASE/.test(text)) { await toMode('tools', view.mode); await hold(true); }
  if (/\[B\]/.test(text) && view.auto) await page.keyboard.press('KeyB');
  if (/\[F\]/.test(text) && view.pace !== 'skip') await page.keyboard.press('KeyF');
  if (/tap \[SPACE\]/.test(text)) { await page.keyboard.press('Space'); }
}

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
const run = { lines: new Set(), long: [], unfit: new Set(), shipsFlown: [] };
for (const [index, name] of SHIPS.entries()) {
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
  let view = await look();
  let lastLine = '';
  while (Date.now() - flightStart < SHIP_MAX_MS && view.phase === 'flight' && view.status === 'approaching' && !view.lostCard) {
    if (view.line !== lastLine) {
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
    !stuck, stuck ? `still flying: "${view.line}"` : '');
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

  // Printing, by the strip (the MIND's lines still apply: a bite now eats a cluster before it prints).
  const printStart = Date.now();
  let printView = await look();
  while (Date.now() - printStart < SCREEN_MAX_MS && !['report', 'transmit', 'end'].includes(printView.phase)) {
    if (printView.lostCard) { await page.locator('#burnResultRetry').click({ force: true }); }
    else if (printView.choice) { await page.locator('#fcPurge').click(); }
    else if (printView.phase === 'printing' || printView.phase === 'flight') {
      if (!(await mindAct(printView)) && /\[F\]/.test(printView.line)) await page.keyboard.press('KeyF');
      if (printView.line && printView.line.length > MAX_LINE_CHARS) run.long.push(printView.line);
      run.lines.add(printView.line);
    }
    await page.waitForTimeout(250);
    printView = await look();
  }
  check(`${tag}: printing ends in the WAKE REPORT`, printView.phase === 'report', `${printView.phase}: "${printView.line}"`);

  // The WAKE REPORT.
  await waitFor(() => !document.getElementById('wakeReport').hidden, 5000);
  await page.waitForTimeout(1500);
  const report = await st(() => ({
    title: document.getElementById('wrTitle').innerText, route: document.getElementById('wrRoute').innerText,
    total: document.getElementById('wrTotal').innerText, credits: document.querySelectorAll('#wrRoll > *').length,
    stars: document.getElementById('wrStars').innerText, model: window.__ap.wakeReport(),
  }));
  check(`${tag}: WAKE REPORT: the ship, its route, n / N WOKE`, report.title.includes(name) || report.route.includes(name)
    ? /\d[\d,]* \/ [\d,]+ WOKE/.test(report.total) : false, `${report.title} | ${report.route} | ${report.total}`);
  check(`${tag}: …the credits roll names the colonists who woke`, report.credits >= 1, `${report.credits} credits`);
  await shot(`${index + 1}c-report`);
  // CONTINUE: SPACE (twice: the first finishes the roll).
  for (let i = 0; i < 10 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
    await page.keyboard.press('Space');
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
    await shot(`${index + 1}d-transmit`);
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
check('RUN END: a title, n / 12,400 WOKE, the five ships, the SCORE, the rank and the seed', end.title.length > 0 && /\/ 12,400 WOKE$/.test(end.total)
  && end.ships.length === 5 && /^SCORE [\d,]+$/.test(end.score) && /^RANK · /.test(end.rank) && /^SEED [0-9A-F]{8}$/.test(end.seed),
  JSON.stringify({ ...end, model: undefined }));
check('RUN END: …every ship row names its ship', SHIPS.every((name, i) => end.ships[i]?.includes(name)), end.ships.join(' | '));
log(`run: ${run.shipsFlown.map((ship) => `${ship.name} ${ship.outcome} ${ship.flightSec.toFixed(0)} s`).join(', ')}; ${run.lines.size} distinct lines, ${mindActions} MIND clicks (${mindRefused} refused)`);
check(`every strip line of the run fits (${run.lines.size} distinct)`, run.long.length === 0, run.long.slice(0, 3).join(' | '));
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
