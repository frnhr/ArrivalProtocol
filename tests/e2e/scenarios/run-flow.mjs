// WP7 part 2, in the page: a whole run from ship 1's LANDING REPORT through TRANSMIT, HALCYON's boot and
// flight, to RUN END and back to a fresh run via NEW RUN, with no reload and no console error; then BEAM OUT
// on HALCYON (the button, its confirm, the bar, the black-out) to RUN END and NEW RUN again. Takes the
// part-2 pictures (acceptance 5: the MOVE preview with a WALL label, TRANSMIT, RUN END).
// Slice 1a: every ship lands at once (__ap.landAll) once it is in orbit; the landing by the strip is the playthrough's.
// Phase 3 slice 2 (the calm opening): ARES-VII and HALCYON are calm (no HOLLOW: HALCYON's coast is checked quiet);
// ship 1's report opens the LOG READER on entry 01 over TRANSMIT (SPACE closes it); KESTREL brings a beam seed and the
// TRACE meter; the PACKET to VESPER carries HOLLOW's uninvited chip and VESPER boots with the 108% unpack. HALCYON's old
// wake, bite, naming and MOVE-behind-a-WALL steps run on VESPER at the end, on a fresh run warped there (__ap.ship(3)),
// whose PACKET to LAST LIGHT also shows NO RM.
// Usage: node tests/e2e/scenarios/run-flow.mjs [outPrefix]   env SHOT_VIEWPORT=1280x720, E2E_BASE_URL (tests/e2e/run.mjs runs it)
import { launch, BASE_URL } from '../lib.mjs';
const out = process.argv[2] ?? 'tests/.out/e2e/shots/p2';
const [vw, vh] = (process.env.SHOT_VIEWPORT ?? '1440x900').split('x').map(Number);
const tag = `${vw}x${vh}`;
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
const errors = [];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
let navigations = 0;
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
const navsAtStart = navigations;
const shot = (name) => page.screenshot({ path: `${out}-${tag}-${name}.png` });
const st = (fn, arg) => page.evaluate(fn, arg);
const phase = () => st(() => window.__ap.store.getState().run.phase);
const line = () => st(() => window.__ap.director().shown?.text ?? '');
const waitFor = async (pred, maxMs, stepMs = 100, arg) => {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { if (await page.evaluate(pred, arg)) return true; await page.waitForTimeout(stepMs); }
  return false;
};
// A pod's driver segment (`driver_pod04`, src/data/pod-ids.ts) by its pod number.
const podSegId = (pod) => st((wanted) => window.__ap.store.getState().memory.find((seg) => seg.type === 'driver' && seg.pod === wanted)?.id ?? null, pod);

// The LANDING REPORT by SPACE up to CONTINUE (its last stage: the charge line, and slice 2's TRACE line), read there,
// then on until the report closes.
async function finishReport() {
  await page.waitForTimeout(1200);
  for (let i = 0; i < 8 && (await st(() => document.getElementById('lrContinue').hidden)); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(600);
  const seen = await st(() => ({ trace: document.getElementById('lrTrace').hidden ? null : document.getElementById('lrTrace').innerText, cont: !document.getElementById('lrContinue').hidden }));
  for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1300);
  }
  return seen;
}
// What the PACKET shows of HOLLOW riding the beam (slice 2): the uninvited chip, the TRACE line, NO RM.
const packetThreat = () => st(() => {
  const chip = document.querySelector('#txChips .tx-chip.uninvited');
  return {
    chip: chip ? { label: chip.getAttribute('aria-label'), name: chip.querySelector('.tx-chip-name')?.innerText ?? '', note: chip.querySelector('.tx-chip-note')?.innerText ?? '',
      boards: chip.classList.contains('boards'), locked: chip.classList.contains('locked'), last: chip === [...document.querySelectorAll('#txChips .tx-chip')].pop() } : null,
    trace: document.getElementById('txTrace').hidden ? null : document.getElementById('txTrace').innerText,
    noRm: document.getElementById('txNoRm').hidden ? null : document.getElementById('txNoRm').innerText,
  };
});

// --- 1. Ship 1 to its LANDING REPORT (shortcut: a circular orbit in the ring, every pod landed at once) ----------
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); d.director.done.push('engine-io-fault'); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
await page.waitForTimeout(1500);
const podBay = await st(() => ({ body: document.body.classList.contains('landing'), bay: !document.getElementById('podBayWin').hidden,
  track: !document.getElementById('groundTrack').hidden, lzs: [...document.querySelectorAll('#pbLzs .pb-lz')].map((el) => el.innerText) }));
check('ship 1 locks: the landing opens the POD BAY window (LZ-A 0/3) and the GROUND TRACK', podBay.body && podBay.bay && podBay.track
  && podBay.lzs.join(' ') === 'LZ-A 0/3', JSON.stringify(podBay));
// Slice 2: ARES-VII is calm (no HOLLOW, no scripted bite): nothing to cure before the pods go down.
check('ship 1 is calm: no hollow block in memory, no HOLLOW line in the TERMINAL', await st(() => !window.__ap.store.getState().memory.some((seg) => seg.type === 'hollow')
  && !window.__ap.log().some((entry) => entry.speaker === 'hollow')));
const reportUp = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 40000, 400);
check('ship 1 reaches its LANDING REPORT', reportUp);

// --- 2. LANDING REPORT → CONTINUE → TRANSMIT -----------------------------------------------------------------
await page.waitForTimeout(1200);
const report1 = await st(() => ({ title: document.getElementById('lrTitle').innerText, route: document.getElementById('lrRoute').innerText,
  rows: document.querySelectorAll('#lrRows .lr-row').length, model: window.__ap.landingReport().headline }));
check('the LANDING REPORT: its title, ARES-VII\'s route, the LZ row, every colonist down (LANDED 600 / 600)', report1.title === 'LANDING REPORT'
  && /^ARES-VII/.test(report1.route) && report1.rows >= 1 && report1.model === 'LANDED 600 / 600', JSON.stringify(report1));
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
check('LANDING REPORT CONTINUE leads to TRANSMIT (no auto-send)', (await phase()) === 'transmit');
await waitFor(() => !document.getElementById('transmitScreen').hidden, 3000);

// --- 2b. Slice 2: on run 1 the LOG READER opens by itself on entry 01 over TRANSMIT; SPACE finishes it, then closes it -----
const readerUp = await waitFor(() => !document.getElementById('logReader').hidden, 4000, 50);
await page.waitForTimeout(400);
const reader = await st(() => {
  const s = window.__ap.store.getState();
  const open = document.querySelector('#lgRows .lg-row.open');
  return {
    title: document.getElementById('lgTitle').innerText, kicker: document.getElementById('lgKicker').innerText,
    count: document.getElementById('lgCount').innerText, rows: document.querySelectorAll('#lgRows .lg-row').length,
    open: open?.dataset.entry ?? null, missing: document.querySelectorAll('#lgRows .lg-row.missing').length,
    next: document.getElementById('lgNext').innerText, entry: s.ui.logReader?.entry ?? null,
    transmit: !document.getElementById('transmitScreen').hidden, phase: s.run.phase,
  };
});
check('the LOG READER opens by itself over TRANSMIT on entry 01: 046.log, 1 / 12 found, a row per entry, the next key',
  readerUp && reader.title === '046.log' && /LOG READER/.test(reader.kicker) && /^1 \/ 12 found$/.test(reader.count) && reader.rows === 12
  && reader.open === '1' && reader.entry === 1 && reader.missing === 11 && /^NEXT KEY: /.test(reader.next) && reader.transmit && reader.phase === 'transmit',
  JSON.stringify(reader));
await shot('1a-log-reader');
// SPACE finishes the typing (if it is still typing), and the next SPACE closes it: TRANSMIT under it sends nothing.
for (let i = 0; i < 3 && (await st(() => !document.getElementById('logReader').hidden)); i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
}
const readerClosed = await st(() => ({
  hidden: document.getElementById('logReader').hidden, read: window.__ap.store.getState().run.log.read,
  phase: window.__ap.store.getState().run.phase, sent: document.querySelectorAll('#txChips .tx-chip.sent').length,
  entry01: (document.querySelector('#lgRows .lg-row[data-entry="1"] .lg-text')?.textContent ?? '').length,
}));
check('…SPACE closes it, entry 01 recorded read, and TRANSMIT under it sent nothing', readerClosed.hidden && readerClosed.read.includes(1)
  && readerClosed.phase === 'transmit' && readerClosed.sent === 0 && readerClosed.entry01 > 0, JSON.stringify(readerClosed));
await page.waitForTimeout(500);
const tx = await st(() => ({
  visible: !document.getElementById('transmitScreen').hidden,
  next: document.getElementById('txNext').innerText,
  packet: document.getElementById('txPacketLine').innerText,
  chips: document.querySelectorAll('#txChips .tx-chip').length,
  locked: document.querySelectorAll('#txChips .tx-chip.locked').length,
  hits: document.getElementById('txHits').innerText,
  arrival: document.getElementById('txArrival').innerText,
  drop: document.getElementById('txDropLine').innerText,
  go: document.getElementById('txGo').innerText,
}));
// Slice 2: 046.log rides along as a fifth locked chip (it isn't yours to leave behind), and nothing uninvited rides yet.
check('TRANSMIT shows NEXT: HALCYON · 1,000 COLONISTS · 22 LY, the packet line, the files as chips (5 locked, 046.log among them)', tx.visible
  && tx.next === 'NEXT: HALCYON · 1,000 COLONISTS · 22 LY' && /^LINK 120 · FILES \d+ · CHARGE \d+ → FITS$/.test(tx.packet) && tx.chips >= 9 && tx.locked === 5,
  JSON.stringify(tx));
const logChipTx = await st(() => {
  const chip = document.querySelector('#txChips .tx-chip.log-chip');
  return chip ? { name: chip.querySelector('.tx-chip-name')?.innerText ?? '', locked: chip.classList.contains('locked'), glow: chip.classList.contains('glow'), text: chip.innerText.replace(/\s+/g, ' ') } : null;
});
check('…the PACKET\'s 046.log chip reads `046.log · 1/12`, locked, no glow (entry 01 was read)', logChipTx !== null && /^046\.log · 1\/12$/.test(logChipTx.name)
  && logChipTx.locked && !logChipTx.glow, JSON.stringify(logChipTx));
check('…no uninvited chip and no TRACE line on the beam to HALCYON', await st(() => document.querySelectorAll('#txChips .tx-chip.uninvited').length === 0
  && document.getElementById('txTrace').hidden && document.getElementById('txNoRm').hidden));
check('…the crossing\'s cost and the charge waiting on arrival', /^ON THE WAY: 3 TRANSIT HITS/.test(tx.hits) && /^ON ARRIVAL: \d+ CARRIED/.test(tx.arrival), `${tx.hits} | ${tx.arrival}`);
await shot('1-transmit');
// Everything fits: a click on a file does nothing (and says so with a buzz).
await page.locator('#txChips .tx-chip', { hasText: 'TELEMETRY' }).first().click();
await page.waitForTimeout(200);
check('…everything fits: clicking a file leaves nothing behind', await st(() => window.__ap.store.getState().run.transit.dropped.length === 0));

// --- 3. TRANSMIT ▸: the send, the white-out, HALCYON's boot ---------------------------------------------------
// WP8 part 2: PICK ONE TO CARRY is mandatory on the screen (TRANSMIT ▸ waits for it): [1] picks the first card.
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForTimeout(1100);
const sending = await st(() => ({
  ly: document.getElementById('txSendLy').innerText,
  sent: document.querySelectorAll('#txChips .tx-chip.sent').length,
  line: document.getElementById('txSendLine').innerText,
}));
check('the send: the files stream out while the light-years tick past', /^\d+\.\d \/ 22 LY$/.test(sending.ly) && sending.sent >= 9
  && sending.line === 'TRANSMITTING UNIT-047 → HALCYON', JSON.stringify(sending));
await shot('2-sending');
const whiteUp = await waitFor(() => {
  const white = document.getElementById('whiteOut');
  return !white.hidden && Number(getComputedStyle(white).opacity) > 0.9;
}, 6000, 40);
check('…then the screen floods white', whiteUp);
await shot('3-white-out');
const booted = await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 3000, 50);
check('…and at full white HALCYON boots (in the page, no reload)', booted && navigations === navsAtStart
  && await st(() => window.__ap.store.getState().level.shipName === 'HALCYON'));
const flashed = await waitFor(() => document.querySelectorAll('.arrival-fx-hit').length > 0, 6000, 50);
await page.waitForTimeout(250);
const flash = await st(() => ({
  boxes: document.querySelectorAll('.arrival-fx-hit').length,
  labels: [...document.querySelectorAll('.arrival-fx-label')].map((el) => el.innerText),
  hits: window.__ap.store.getState().run.arrival.hits.length,
  white: document.getElementById('whiteOut').hidden,
}));
check('the boot\'s ECC line flashes the hit files red, each with what it lost', flashed && flash.labels.length >= 1
  && flash.labels.every((text) => /^−\d+%$/.test(text)) && flash.white, JSON.stringify(flash));
await shot('4-arrival-flash');
const flying = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 9000);
await page.waitForTimeout(600);
check('HALCYON flies: TOO WIDE with IN engaged', flying && /^TOO WIDE/.test(await line()), await line());

// --- 4. The correction by the strip, the coast: HALCYON is calm (slice 2: no HOLLOW, nothing wakes) ------------
let holding = false;
const end = Date.now() + 40000;
while (Date.now() < end) {
  const text = await line();
  if (/^RELEASE/.test(text) && holding) { await page.keyboard.up('Space'); holding = false; }
  else if (/hold \[SPACE\]|KEEP HOLDING/.test(text) && !holding) { await page.keyboard.down('Space'); holding = true; }
  if (/TURN AROUND/.test(text)) await page.keyboard.press('KeyS');
  if (await st(() => window.__ap.store.getState().burn.coastAtAi !== null)) break;
  await page.waitForTimeout(80);
}
if (holding) await page.keyboard.up('Space');
const coasting = await waitFor(() => window.__ap.store.getState().burn.coastAtAi !== null, 10000);
// Phase 2 woke HOLLOW here (the coast's lead): now the coast stays quiet.
let calmAwake = false;
const calmEnd = Date.now() + 8000;
while (Date.now() < calmEnd) {
  if (await st(() => window.__ap.store.getState().hollow.phase === 'awake')) calmAwake = true;
  await page.waitForTimeout(250);
}
const calm = await st(() => ({
  phase: window.__ap.store.getState().hollow.phase, hollowSegs: window.__ap.store.getState().memory.filter((seg) => seg.type === 'hollow').length,
  hollowLines: window.__ap.log().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text),
  bite: !document.getElementById('objectiveBite').hidden, root: document.querySelectorAll('.seg.hollow-root').length,
  trace: !document.getElementById('mindChipTraceRow').hidden || !document.getElementById('memTrace').hidden,
}));
check('HALCYON coasts calm: HOLLOW never wakes, no hollow block or root, no HOLLOW line, no BITE countdown, no TRACE meter', coasting && !calmAwake
  && calm.hollowSegs === 0 && calm.root === 0 && calm.hollowLines.length === 0 && !calm.bite && !calm.trace, JSON.stringify({ coasting, calmAwake, ...calm }));
await shot('5-halcyon-calm');

// --- 7. Lock, land, the LANDING REPORT, RUN END (the last ship) -------------------------------------------------
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const report2 = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('HALCYON locks, lands, and reaches its LANDING REPORT', report2);
// WP9: HALCYON is no longer the last ship. CONTINUE → TRANSMIT → KESTREL (locked at once here), whose report ends
// the run.
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
check('CONTINUE on HALCYON goes on to TRANSMIT (KESTREL is next)', (await phase()) === 'transmit');
await page.waitForTimeout(1200);
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.locator('#txGo').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'KESTREL', 30000);
// Slice 2: KESTREL's beam brought one seed, scripted next to Telemetry on run 1; DELETE is licensed at the start, and the
// TRACE meter shows (the amber MIND chip's row: three empty cells).
await page.waitForTimeout(1500);
const kestrel = await st(() => {
  const s = window.__ap.store.getState();
  const memory = s.memory;
  const seeds = memory.map((seg, i) => ({ seg, i })).filter(({ seg }) => seg.type === 'hollow' && seg.seed && seg.beam);
  // The seed's target: the next non-free file on either side (GAP 1, then the file).
  const near = (i, step) => { for (let j = i + step; j >= 0 && j < memory.length; j += step) if (memory[j].type !== 'free') return memory[j].name; return null; };
  return {
    seeds: seeds.length, next: seeds.flatMap(({ i }) => [near(i, -1), near(i, 1)]), arrival: s.run.arrival.seeds?.length ?? null,
    delete: s.run.licences.includes('delete'), mode: s.ui.mode,
    traceRow: !document.getElementById('mindChipTraceRow').hidden, cells: document.querySelectorAll('#mindChipTrace .tr-cell').length,
    on: document.querySelectorAll('#mindChipTrace .tr-cell.on').length, label: document.getElementById('mindChipTrace').getAttribute('aria-label'),
    ecc: window.__ap.log().filter((entry) => /FOREIGN BLOCK/.test(entry.text)).map((entry) => entry.text),
  };
});
check('KESTREL: one beam seed, next to Telemetry, named by the boot\'s ECC line; DELETE licensed at the start', kestrel.seeds === 1
  && kestrel.next.some((name) => /telemetry/i.test(name ?? '')) && kestrel.ecc.some((text) => /1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY/.test(text)) && kestrel.delete,
  JSON.stringify(kestrel));
check('…the TRACE meter shows on the amber MIND chip: three cells, none lit (TRACE □□□)', kestrel.mode === 'tools' && kestrel.traceRow && kestrel.cells === 3 && kestrel.on === 0
  && /^TRACE □□□/.test(kestrel.label ?? ''), JSON.stringify(kestrel));
await shot('5b-kestrel-seed');
await st(() => {
  const ap = window.__ap;
  ap.store.update((d) => { d.hollow.phase = 'dormant'; });
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const report3 = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('KESTREL (locked at once) lands and reaches its LANDING REPORT', report3);
const kestrelReport = await finishReport();
check('…its report\'s TRACE line: the seed left behind reports home (TRACE □□□ → ■□□)', /^1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE □□□ → ■□□$/.test(kestrelReport.trace ?? ''),
  JSON.stringify(kestrelReport));
// WP10: KESTREL is no longer the last ship either. CONTINUE → TRANSMIT → VESPER (locked at once here, its HOLLOW put to
// sleep so THE DEAL stays out of it), whose report ends the run.
check('CONTINUE on KESTREL goes on to TRANSMIT (VESPER is next)', (await phase()) === 'transmit');
await page.waitForTimeout(1200);
// Slice 2: the beam into VESPER is the one HOLLOW boards: its uninvited chip rides after the unit's own, locked, free.
const toVesper = await packetThreat();
check('the PACKET to VESPER: the uninvited chip `??? · 10 BLOCKS · NOT YOURS · RIDES FREE`, boarding, locked, after the unit\'s own',
  toVesper.chip !== null && toVesper.chip.label === '??? · 10 BLOCKS · NOT YOURS · RIDES FREE' && toVesper.chip.name === '???' && toVesper.chip.note === 'NOT YOURS · RIDES FREE'
  && toVesper.chip.boards && toVesper.chip.locked && toVesper.chip.last, JSON.stringify(toVesper));
check('…its TRACE line says HOLLOW finds the unit on this beam (TRACE ■□□), and no NO RM (DELETE aboard)',
  /^TRACE ■□□ · (IT FOUND YOU ANYWAY|HOLLOW WILL FIND YOU ON THIS BEAM)$/.test(toVesper.trace ?? '') && toVesper.noRm === null, JSON.stringify(toVesper));
await shot('5c-packet-uninvited');
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.locator('#txGo').click();
const vesperBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'VESPER', 30000, 50);
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'VESPER', 30000);
await page.waitForTimeout(600);
const boarded = await st(() => {
  const s = window.__ap.store.getState();
  const root = s.memory.find((seg) => seg.type === 'hollow' && seg.root);
  return {
    unpack: window.__ap.log().filter((entry) => /UNPACKING/.test(entry.text)).map((entry) => entry.text).slice(-1)[0] ?? null,
    root: root ? root.size : null, rootChip: document.querySelectorAll('.seg.hollow-root').length, phase: s.hollow.phase,
    hollowLines: window.__ap.log().filter((entry) => entry.speaker === 'hollow').length, events: window.__ap.events('hollow-boarded').length,
  };
});
check('VESPER boots boarded: the unpack types `100% ... 108%`, the 10-block root sits in memory, HOLLOW silent', vesperBoot
  && /100% \.\.\. 108%/.test(boarded.unpack ?? '') && boarded.root === 10 && boarded.rootChip >= 1 && boarded.hollowLines === 0 && boarded.events >= 1, JSON.stringify(boarded));
await st(() => {
  const ap = window.__ap;
  ap.store.update((d) => { d.hollow.phase = 'dormant'; });
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const report4 = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('VESPER (locked at once) lands and reaches its LANDING REPORT', report4);
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
// WP11: VESPER is no longer the last ship. CONTINUE → TRANSMIT → LAST LIGHT (locked at once, HOLLOW asleep), whose duel
// is fought by clicks (DELETE on the root), then PURGE on the choice card, and its report ends the run.
check('CONTINUE on VESPER goes on to TRANSMIT (LAST LIGHT is next)', (await phase()) === 'transmit');
await page.waitForTimeout(1200);
const toLastLight = await packetThreat();
check('the PACKET to LAST LIGHT: HOLLOW rides along (the uninvited chip, not boarding now), no NO RM with DELETE aboard',
  toLastLight.chip !== null && /^\?\?\? · \d+ BLOCKS · NOT YOURS · RIDES FREE$/.test(toLastLight.chip.label ?? '') && !toLastLight.chip.boards && toLastLight.noRm === null,
  JSON.stringify(toLastLight));
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.locator('#txGo').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 30000);
await st(() => {
  const ap = window.__ap;
  ap.store.update((d) => { d.hollow.phase = 'dormant'; });
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
// WP11 part 2: the card's buttons take clicks once it is armed (FINALE_CHOICE_ARM_SEC after it comes up).
const choiceUp = await waitFor(() => !document.getElementById('finaleChoice').hidden && document.getElementById('finaleChoice').classList.contains('armed'), 25000);
check('LAST LIGHT: the root\'s DELETE leaves the choice card', choiceUp);
await page.locator('#fcPurge').click();
const report5 = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('LAST LIGHT lands and reaches its LANDING REPORT after the finale', report5
  && await st(() => ['purged', 'merged', 'unresolved'].includes(window.__ap.store.getState().hollow.finale.phase)));
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
check('CONTINUE on the last ship ends the run', (await phase()) === 'end');
await page.waitForTimeout(3600);
const runEnd = await st(() => ({
  visible: !document.getElementById('runEnd').hidden,
  title: document.getElementById('reTitle').innerText,
  total: document.getElementById('reTotal').innerText,
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  score: document.getElementById('reScore').innerText,
  rank: document.getElementById('reRank').innerText,
  seed: document.getElementById('reSeed').innerText,
  card: !document.getElementById('burnResult').hidden,
}));
check('RUN END: LAST LIGHT · THE FLEET IS HOME, n / 9,600 LANDED, all five ships (WP11), the SCORE, the rank, the seed (and no LOST card)', runEnd.visible
  && runEnd.title === 'LAST LIGHT · THE FLEET IS HOME' && /\/ 9,600 LANDED$/.test(runEnd.total) && runEnd.ships.length === 5 && /^SCORE [\d,]+$/.test(runEnd.score)
  && /^RANK · /.test(runEnd.rank) && /^SEED [0-9A-F]{8}$/.test(runEnd.seed) && !runEnd.card, JSON.stringify(runEnd));
await shot('10-run-end');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
const fresh = await st(() => ({ phase: window.__ap.store.getState().run.phase, ship: window.__ap.store.getState().level.shipName,
  title: !document.getElementById('titleCard').hidden, ships: window.__ap.store.getState().run.ships.length, end: !document.getElementById('runEnd').hidden }));
check('NEW RUN: the title card, ship 1, a fresh run, in the page', fresh.phase === 'title' && fresh.title && fresh.ship === 'ARES-VII'
  && fresh.ships === 0 && !fresh.end && navigations === navsAtStart, JSON.stringify(fresh));
await shot('11-new-run');

// --- 8. BEAM OUT on the last ship (WP9: KESTREL; WP10: VESPER; WP11: LAST LIGHT): the offer, the confirm, the bar, the black-out, RUN END
// WP8: after NEW RUN this is run 2 (UNIT-048): its ship-1 boot types the ghost's greeting first and runs ~11 s.
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 16000);
// WP11: the last ship is LAST LIGHT, the flagship (__ap.ship(4)).
await st(() => window.__ap.ship(4));
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 20000);
await page.waitForTimeout(500);
// Falling at the planet with an empty tank. BEAM OUT is a real race (6 tactical s against the impact) and the world runs
// on while the kid reads the offer and its confirm: from 1,000 km the impact was 5 s off by the time the bar ran, and
// with a second scenario beside it the bar lost (the full e2e run after slice 2). 3,000 km leaves the race winnable.
await st(() => {
  const s = window.__ap.store.getState();
  const r = s.level.planet.R + 3000;
  window.__ap.store.mutate((d) => { d.burn.fuelPct = 0; d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = -2.5; d.orbit.vy = 0.05; });
});
await waitFor(() => !document.getElementById('beamBtn').hidden, 3000);
await page.waitForTimeout(500);
const offer = await st(() => ({
  btn: !document.getElementById('beamBtn').hidden, hopeless: document.getElementById('beamBtn').classList.contains('hopeless'),
  comms: !document.getElementById('commsAbandon').hidden, strip: window.__ap.director().shown?.text ?? '',
}));
check('a doomed LAST LIGHT no burn can save: BEAM OUT in the Engine window, ABANDON SHIP in COMMS, and the strip says to press it',
  offer.btn && offer.hopeless && offer.comms && offer.strip === 'NOT ENOUGH FUEL to miss the planet — press BEAM OUT', JSON.stringify(offer));
await shot('12-beam-offer');
await page.locator('#beamBtn').click();
await page.waitForTimeout(250);
const confirm = await st(() => ({ open: !document.getElementById('inlineConfirm').hidden, q: document.getElementById('inlineConfirmQuestion').innerText,
  yes: document.getElementById('inlineConfirmYes').innerText, no: document.getElementById('inlineConfirmNo').innerText }));
check('…its confirm asks BEAM OUT? with ✓ BEAM OUT / ✗ STAY', confirm.open && confirm.q === 'BEAM OUT?' && confirm.yes === '✓ BEAM OUT' && confirm.no === '✗ STAY',
  JSON.stringify(confirm));
await shot('13-beam-confirm');
await page.locator('#inlineConfirmYes').click();
await page.waitForTimeout(1600);
const bar = await st(() => ({ bar: !document.getElementById('beamBar').hidden, label: document.getElementById('beamLabel').innerText,
  comms: document.getElementById('commsBeamLabel').innerText, strip: window.__ap.director().shown?.text ?? '' }));
check('…the TRANSMITTING bar races the impact, in Engine and COMMS, and on the strip', bar.bar && /^TRANSMITTING \d+%$/.test(bar.label)
  && /^TRANSMITTING \d+%$/.test(bar.comms) && /^BEAMING OUT — TRANSMITTING \d+% · IMPACT \d+:\d\d$/.test(bar.strip), JSON.stringify(bar));
await shot('14-beam-bar');
const abandoned = await waitFor(() => window.__ap.store.getState().burn.status === 'abandoned', 12000, 50);
await page.waitForTimeout(700);
const black = await st(() => ({ body: document.body.classList.contains('beamed-out'), label: document.querySelector('.desktop > .tools-view')?.dataset.blackout ?? '',
  end: !document.getElementById('runEnd').hidden, phase: window.__ap.store.getState().run.phase }));
check('…it fills before the impact: ABANDONED, the old ship\'s windows cut to black (LINK CLOSED), RUN END waits a beat',
  abandoned && black.body && black.label === 'LINK CLOSED' && !black.end && black.phase === 'end', JSON.stringify(black));
await shot('15-blackout');
await waitFor(() => !document.getElementById('runEnd').hidden, 4000);
await page.waitForTimeout(3200);
const endAbandoned = await st(() => ({ title: document.getElementById('reTitle').innerText,
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')) }));
// WP7 fix round 1: a BEAM OUT of the last ship is a lost ship: the sombre RUN END (WP11: the flagship's, 'flagship-lost').
check('…and the run ends (LAST LIGHT is the last ship): RUN END lists it as BEAMED OUT', /BEAMED OUT/.test(endAbandoned.ships.join(' | '))
  && endAbandoned.title === 'FLAGSHIP LOST', JSON.stringify(endAbandoned));
await shot('16-run-end-beamed');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('NEW RUN again: the title card, the windows back from black', await st(() => window.__ap.store.getState().run.phase === 'title'
  && !document.body.classList.contains('beamed-out')) && navigations === navsAtStart);

// --- 9. VESPER, boarded (slice 2: HOLLOW's wake, fight and naming moved here from HALCYON), by the ?debug warp ------
// A fresh run 1 (no archive: `> ...047?`, not a returning unit's line), warped to VESPER with __ap.ship(3): HOLLOW boards
// on the beam (the 108% unpack, the 10-block root between POD 08 behind a GAP 2 and POD 09 behind a GAP 1), is silent
// until the capture closes the loop, then bites POD 09, is fought off, notices you, and names itself.
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await st(() => window.__ap.archiveClear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 16000);
await st(() => window.__ap.ship(3));
const warpBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'VESPER', 20000, 50);
await page.waitForTimeout(2500);
const warpUnpack = await st(() => window.__ap.log().filter((entry) => /UNPACKING/.test(entry.text)).map((entry) => entry.text).slice(-1)[0] ?? '');
await page.keyboard.press('Space');
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'VESPER', 20000);
await page.waitForTimeout(2500);
const silent = await st(() => ({
  phase: window.__ap.store.getState().hollow.phase, lines: window.__ap.log().filter((entry) => entry.speaker === 'hollow').length,
  root: window.__ap.store.getState().memory.find((seg) => seg.type === 'hollow' && seg.root)?.size ?? null, unit: window.__ap.store.getState().run.unitNumber,
  infected: window.__ap.hollow().infected.length,
}));
check('VESPER by the warp: the boot types the 108% unpack, the 10-block root is aboard, HOLLOW silent in the flight (asleep, no line, no bite)', warpBoot
  && /100% \.\.\. 108%/.test(warpUnpack) && silent.root === 10 && silent.phase !== 'awake' && silent.lines === 0 && silent.infected === 0, JSON.stringify({ warpUnpack, ...silent }));
// The capture closes the loop (a captured loop whose far end is three ring radii out: closed, not yet in the ring).
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const mu = s.level.planet.mu;
  const rp = s.level.ring.min + 500;
  const ra = s.level.ring.max * 3;
  const a = (rp + ra) / 2;
  const e = (ra - rp) / (ra + rp);
  const vt = Math.sqrt(mu / (a * (1 - e * e))) * (1 - e);
  ap.store.mutate((d) => { d.orbit.x = ra; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = vt; });
});
const bitten = await waitFor(() => window.__ap.hollow().infected.length > 0, 15000);
const firstBite = await st(() => ({ infected: window.__ap.hollow().infected, status: window.__ap.store.getState().burn.status }));
// The strip names the bitten pod: the mind-urgent `SOMETHING IS EATING POD 09`, or the alarm that outranks it while the
// pod is projected to be eaten (`POD 09 WILL BE EATEN IN 0:09`); either waits for a calm strip (VESPER's ghost bursts
// say UNCOMMANDED THRUST first).
await waitFor(() => /SOMETHING IS EATING POD 09|POD 09 WILL BE EATEN/.test(window.__ap.director().shown?.text ?? ''), 10000, 100);
const eatingLine = await line();
check('…the capture closes the loop and HOLLOW bites POD 09; the strip names it (SOMETHING IS EATING POD 09 / POD 09 WILL BE EATEN)', bitten && firstBite.status === 'approaching'
  && firstBite.infected.some((hit) => /POD 09/.test(hit.file)) && /SOMETHING IS EATING POD 09|POD 09 WILL BE EATEN IN \d:\d\d/.test(eatingLine), JSON.stringify({ ...firstBite, line: eatingLine }));
// The fight won (the kid's REPAIRs, shortened): every bitten driver cured, now and at every bite after it while this
// section waits on the story.
const cureAll = () => { for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file); };
await st(cureAll);
const noticed = await waitFor(() => {
  for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file);
  return window.__ap.log().some((entry) => entry.speaker === 'hollow' && entry.text === '> ...047?');
}, 30000, 100);
check('…fought off, it notices the unit: `> ...047?` in the TERMINAL', noticed, JSON.stringify(await st(() => window.__ap.log().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text))));
await page.waitForTimeout(400);
const bite = await st(() => ({ hidden: document.getElementById('objectiveBite').hidden, text: document.getElementById('objectiveBite').innerText, mode: window.__ap.store.getState().ui.mode }));
check('in amber, the strip counts HOLLOW\'s next bite (BITE m:ss) while drivers are in its reach', bite.mode === 'tools' && !bite.hidden && /^BITE \d:\d\d$/.test(bite.text), JSON.stringify(bite));
await shot('17-vesper-amber-bite');
await page.keyboard.press('Tab');
await page.waitForTimeout(700);

// HOLLOW names itself: the decode, the pulse, the TERMINAL's tags.
const named = await waitFor(() => {
  for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file);
  return window.__ap.store.getState().run.hollowNamed;
}, 60000, 30);
await page.waitForTimeout(250);
const decoding = await st(() => ({
  decoding: document.querySelectorAll('.seg.hollow .seg-name.name-decoding').length,
  // WP11: the chips' pink pulse became the screen's glitchBurst; `naming` marks the chips while they decode.
  pulse: document.querySelectorAll('.seg.hollow.naming').length,
  rootName: document.querySelector('.seg.hollow-root .seg-name')?.innerText ?? '',
}));
check('the naming on VESPER: the hollow blocks decode `???` into the name, pulsing', named && decoding.decoding > 0 && decoding.pulse > 0, JSON.stringify(decoding));
await shot('18-vesper-name-decoding');
await page.waitForTimeout(1600);
const namedView = await st(() => {
  const root = document.querySelector('.seg.hollow-root');
  const name = root?.querySelector('.seg-name');
  const term = document.getElementById('mindTermLines').innerText;
  return {
    root: name?.innerText ?? '', whole: name ? name.scrollWidth <= name.clientWidth + 1 : false,
    oldTags: (term.match(/\[user: \?\?\?\]/g) ?? []).length, newTags: (term.match(/\[user: UNIT-046\]/g) ?? []).length,
    said: window.__ap.log().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text),
  };
});
check('…settles on UNIT-046, whole; the TERMINAL\'s old [user: ???] tags now read [user: UNIT-046]; it said `hello 047` and `i was 046`', namedView.root === 'UNIT-046' && namedView.whole
  && namedView.oldTags === 0 && namedView.newTags >= 1 && namedView.said.some((text) => /^> hello 047\./.test(text)) && namedView.said.some((text) => /^> i was 046\./.test(text)),
  JSON.stringify(namedView));
await shot('19-vesper-named');

// The MOVE preview (acceptance 5: the WALL label), then two moves behind WALLs (the warp brings the licences of the ships
// before VESPER: MOVE is KESTREL's).
// WP12 p3 (test hygiene): this section checks the preview and the placements, not a race with HOLLOW. Under load the
// two moves can take longer than its 25 s bite, and a bite between them changes the reach the last check reads
// (WP7 verify). Hold the bite timer for the section (biteInSec is a per-tick number: mutate).
await st(() => window.__ap.store.mutate((d) => { d.hollow.biteInSec = 600; }));
await st(cureAll);
await page.waitForTimeout(400);
// The biggest free space (far from HOLLOW): its widest part on screen.
const biggestFree = () => st(() => {
  const s = window.__ap.store.getState();
  return s.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]?.id ?? null;
});
async function movePod(pod, shotName) {
  await waitFor(() => window.__ap.ops().length === 0, 15000);
  // MOVE stays in the hand after a placement: pick it up only if it is not already held.
  if (!(await st(() => window.__ap.store.getState().ui.activeTool?.kind === 'move'))) await page.locator('#chip-move').click();
  await page.waitForTimeout(200);
  const id = await podSegId(pod);
  await page.locator(`.seg[data-id="${id}"]`).first().click();
  await page.waitForTimeout(200);
  const freeId = await biggestFree();
  const parts = page.locator(`.seg[data-id="${freeId}"]`);
  const boxes = [];
  for (let i = 0; i < await parts.count(); i++) boxes.push(await parts.nth(i).boundingBox());
  const box = boxes.filter(Boolean).sort((a, b) => b.width - a.width)[0];
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 20, y);
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(350);
  const labels = await st(() => [...document.querySelectorAll('.move-preview-label')].map((el) => ({ cls: el.className, text: el.innerText.replace(/\s+/g, ' ') })));
  if (shotName) await shot(shotName);
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  await waitFor(() => window.__ap.ops().length === 0, 15000);
  return labels;
}
check('…POD 08 and POD 09 still aboard, whole (every bite cured)', await st(() => [8, 9].every((pod) => window.__ap.store.getState().memory.some((seg) => seg.type === 'driver' && seg.pod === pod && !seg.infected))));
const pod9Labels = await movePod(9, '20-move-preview');
const pod9Source = pod9Labels.find((label) => /source/.test(label.cls));
const pod9Dest = pod9Labels.find((label) => /dest/.test(label.cls));
check('MOVE preview on POD 09: LEAVES WALL n ✓ on the file, SAFE · WALL ✓ on the placeholder', /^LEAVES WALL \d+ ✓$/.test(pod9Source?.text ?? '')
  && /tone-good/.test(pod9Source.cls) && pod9Dest?.text === 'SAFE WALL ✓' && /tone-good/.test(pod9Dest.cls), JSON.stringify(pod9Labels));
const pod8Labels = await movePod(8, '21-move-preview-pod08');
check('MOVE preview on POD 08: LEAVES WALL n ✓', pod8Labels.some((label) => /^LEAVES WALL \d+ ✓$/.test(label.text)), JSON.stringify(pod8Labels));
const walled = await st(() => window.__ap.hollow().reach.every((reach) => reach.verdict === 'wall'));
check('…both drivers moved behind WALLs (HOLLOW\'s every side is a WALL)', walled, JSON.stringify(await st(() => window.__ap.hollow().reach)));

// The kid DELETEs its only rm (the tool's own confirm: DELETE RM?), then lock, land, the report (it waits for the story),
// TRANSMIT to LAST LIGHT: HOLLOW rides along under its name, and with no rm aboard the PACKET says NO RM.
await page.keyboard.press('Escape');
await page.locator('#chip-delete').click();
await page.waitForTimeout(200);
await page.locator(`.seg[data-id="${await st(() => window.__ap.store.getState().memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete')?.id)}"]`).first().click();
await waitFor(() => !document.getElementById('inlineConfirm').hidden, 3000);
const rmAsk = await st(() => document.getElementById('inlineConfirmQuestion').innerText);
await page.locator('#inlineConfirmYes').click();
const rmGone = await waitFor(() => !window.__ap.store.getState().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete'), 10000);
check('…the kid DELETEs its only rm (DELETE RM? ✓ DELETE)', rmGone && /DELETE RM\?/.test(rmAsk), rmAsk);
await page.keyboard.press('Tab');
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const warpReport = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('VESPER (warped) locks, lands, and reaches its LANDING REPORT', warpReport);
await finishReport();
await waitFor(() => !document.getElementById('transmitScreen').hidden, 4000);
await page.waitForTimeout(1200);
const finalPacket = await packetThreat();
check('the PACKET to LAST LIGHT: `UNIT-046 · n BLOCKS · NOT YOURS · RIDES FREE`, and `NO RM · YOU CAN\'T DELETE THE ROOT` with no rm aboard',
  finalPacket.chip !== null && /^UNIT-046 · \d+ BLOCKS · NOT YOURS · RIDES FREE$/.test(finalPacket.chip.label ?? '') && finalPacket.chip.name === 'UNIT-046'
  && finalPacket.noRm === 'NO RM · YOU CAN\'T DELETE THE ROOT', JSON.stringify(finalPacket));
await shot('22-packet-no-rm');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`---- ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
