// WP7 part 2, in the page: a whole run from ship 1's WAKE REPORT through TRANSMIT, HALCYON's boot and
// flight, to RUN END and back to a fresh run via NEW RUN, with no reload and no console error; then BEAM OUT
// on HALCYON (the button, its confirm, the bar, the black-out) to RUN END and NEW RUN again. Takes the
// part-2 pictures (acceptance 5: the MOVE preview with a WALL label, TRANSMIT, RUN END).
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
const segId = (code) => st((cluster) => window.__ap.store.getState().memory.find((seg) => seg.type === 'driver' && seg.cluster === cluster)?.id ?? null, code);

// --- 1. Ship 1 to its WAKE REPORT (shortcut: a circular orbit in the ring, every cluster printed) ------------
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => {
  const ap = window.__ap;
  ap.revealSouls('debug');
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); d.director.done.push('engine-io-fault'); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const reportUp = await waitFor(() => {
  const ap = window.__ap;
  const c12 = ap.store.getState().memory.find((seg) => seg.type === 'driver' && seg.cluster === 'C12');
  if (c12?.infected) ap.cure('C12');
  if (ap.store.getState().run.phase === 'landing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 40000, 400);
check('ship 1 reaches its WAKE REPORT', reportUp);

// --- 2. WAKE REPORT → CONTINUE → TRANSMIT --------------------------------------------------------------------
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
check('WAKE REPORT CONTINUE leads to TRANSMIT (no auto-send)', (await phase()) === 'transmit');
await waitFor(() => !document.getElementById('transmitScreen').hidden, 3000);
await page.waitForTimeout(900);
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
check('TRANSMIT shows NEXT: HALCYON · 2,000 SOULS · 22 LY, the packet line, the files as chips (4 locked)', tx.visible
  && tx.next === 'NEXT: HALCYON · 2,000 SOULS · 22 LY' && /^LINK 120 · FILES \d+ · CHARGE \d+ → FITS$/.test(tx.packet) && tx.chips >= 9 && tx.locked === 4,
  JSON.stringify(tx));
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
}, 3000, 40);
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

// --- 4. The correction by the strip, the coast, the wake --------------------------------------------------------
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
const woke = await waitFor(() => window.__ap.store.getState().hollow.phase === 'awake', 14000);
check('the coast begins and HOLLOW wakes', woke);
// Both cures won (the kid's REPAIRs, shortened): clean clusters still within a GAP of it.
await page.waitForTimeout(1500);
await st(() => { for (const code of ['C08', 'C09']) { const seg = window.__ap.store.getState().memory.find((s) => s.type === 'driver' && s.cluster === code); if (seg?.infected) window.__ap.cure(code); } });
await page.waitForTimeout(400);
const bite = await st(() => ({ hidden: document.getElementById('objectiveBite').hidden, text: document.getElementById('objectiveBite').innerText, mode: window.__ap.store.getState().ui.mode }));
check('in amber, the strip counts HOLLOW\'s next bite (BITE m:ss) while clusters are in its reach', bite.mode === 'tools' && !bite.hidden && /^BITE \d:\d\d$/.test(bite.text), JSON.stringify(bite));
await shot('5-amber-bite');
await page.keyboard.press('Tab');
await page.waitForTimeout(700);

// --- 5. HOLLOW names itself: the decode, the pulse, the TERMINAL's tags ------------------------------------------
const named = await waitFor(() => window.__ap.store.getState().run.hollowNamed, 40000, 30);
await page.waitForTimeout(250);
const decoding = await st(() => ({
  decoding: document.querySelectorAll('.seg.hollow .seg-name.name-decoding').length,
  // WP11: the chips' pink pulse became the screen's glitchBurst; `naming` marks the chips while they decode.
  pulse: document.querySelectorAll('.seg.hollow.naming').length,
  rootName: document.querySelector('.seg.hollow-root .seg-name')?.innerText ?? '',
}));
check('the naming: the hollow blocks decode `???` into the name, pulsing', named && decoding.decoding > 0 && decoding.pulse > 0, JSON.stringify(decoding));
await shot('6-name-decoding');
await page.waitForTimeout(1600);
const namedView = await st(() => {
  const root = document.querySelector('.seg.hollow-root');
  const name = root?.querySelector('.seg-name');
  const term = document.getElementById('mindTermLines').innerText;
  return {
    root: name?.innerText ?? '', whole: name ? name.scrollWidth <= name.clientWidth + 1 : false,
    oldTags: (term.match(/\[user: \?\?\?\]/g) ?? []).length, newTags: (term.match(/\[user: UNIT-046\]/g) ?? []).length,
    cues: window.__ap.audio.cues().slice(-12),
  };
});
check('…settles on UNIT-046, whole; the TERMINAL\'s old [user: ???] tags now read [user: UNIT-046]', namedView.root === 'UNIT-046' && namedView.whole
  && namedView.oldTags === 0 && namedView.newTags >= 1, JSON.stringify({ ...namedView, cues: undefined }));
await shot('7-named');

// --- 6. The MOVE preview (acceptance 5: the WALL label), then two moves behind WALLs -----------------------------
// WP12 p3 (test hygiene): this section checks the preview and the placements, not a race with HOLLOW. Under load the
// two moves can take longer than HALCYON's 25 s bite, and a bite between them changes the reach the last check reads
// (WP7 verify). Hold the bite timer for the section (biteInSec is a per-tick number: mutate).
await st(() => window.__ap.store.mutate((d) => { d.hollow.biteInSec = 600; }));
// The biggest free space (rack C's tail and rack D, far from HOLLOW): its widest part on screen.
const biggestFree = () => st(() => {
  const s = window.__ap.store.getState();
  return s.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]?.id ?? null;
});
async function moveCluster(code, shotName) {
  await waitFor(() => window.__ap.ops().length === 0, 15000);
  // MOVE stays in the hand after a placement: pick it up only if it is not already held.
  if (!(await st(() => window.__ap.store.getState().ui.activeTool?.kind === 'move'))) await page.locator('#chip-move').click();
  await page.waitForTimeout(200);
  const id = await segId(code);
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
const c09Labels = await moveCluster('C09', '8-move-preview');
const c09Source = c09Labels.find((label) => /source/.test(label.cls));
const c09Dest = c09Labels.find((label) => /dest/.test(label.cls));
check('MOVE preview on C09: LEAVES WALL 9 ✓ on the file, SAFE · WALL ✓ on the placeholder', c09Source?.text === 'LEAVES WALL 9 ✓'
  && /tone-good/.test(c09Source.cls) && c09Dest?.text === 'SAFE WALL ✓' && /tone-good/.test(c09Dest.cls), JSON.stringify(c09Labels));
const c08Labels = await moveCluster('C08', '9-move-preview-c08');
check('MOVE preview on C08: LEAVES WALL 10 ✓', c08Labels.some((label) => label.text === 'LEAVES WALL 10 ✓'), JSON.stringify(c08Labels));
const walled = await st(() => window.__ap.hollow().reach.every((reach) => reach.verdict === 'wall'));
check('…both clusters moved behind WALLs (HOLLOW\'s every side is a WALL)', walled);

// --- 7. Lock, print, the WAKE REPORT, RUN END (the last ship) --------------------------------------------------
await page.keyboard.press('Tab');
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 25000);
const report2 = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('HALCYON locks, prints, and reaches its WAKE REPORT', report2);
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
  if (ap.store.getState().run.phase === 'landing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('KESTREL (locked at once) prints and reaches its WAKE REPORT', report3);
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
// WP10: KESTREL is no longer the last ship either. CONTINUE → TRANSMIT → VESPER (locked at once here, its HOLLOW put to
// sleep so THE DEAL stays out of it), whose report ends the run.
check('CONTINUE on KESTREL goes on to TRANSMIT (VESPER is next)', (await phase()) === 'transmit');
await page.waitForTimeout(1200);
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.locator('#txGo').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'VESPER', 30000);
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
  if (ap.store.getState().run.phase === 'landing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('VESPER (locked at once) prints and reaches its WAKE REPORT', report4);
await page.waitForTimeout(1200);
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
// WP11: VESPER is no longer the last ship. CONTINUE → TRANSMIT → LAST LIGHT (locked at once, HOLLOW asleep), whose duel
// is fought by clicks (DELETE on the root), then PURGE on the choice card, and its report ends the run.
check('CONTINUE on VESPER goes on to TRANSMIT (LAST LIGHT is next)', (await phase()) === 'transmit');
await page.waitForTimeout(1200);
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
  if (ap.store.getState().run.phase === 'landing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 60000, 500);
check('LAST LIGHT prints and reaches its WAKE REPORT', report5);
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
check('RUN END: LAST LIGHT · THE FLEET IS HOME, n / 12,400 WOKE, all five ships (WP11), the SCORE, the rank, the seed (and no LOST card)', runEnd.visible
  && runEnd.title === 'LAST LIGHT · THE FLEET IS HOME' && /\/ 12,400 WOKE$/.test(runEnd.total) && runEnd.ships.length === 5 && /^SCORE [\d,]+$/.test(runEnd.score)
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
await st(() => {
  const s = window.__ap.store.getState();
  const r = s.level.planet.R + 1000;
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

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`---- ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
