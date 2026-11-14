// WP7 part 2, in the page: a whole run from ship 1's LANDING REPORT through TRANSMIT, HALCYON's boot and
// flight, to RUN END and back to a fresh run via NEW RUN, with no reload and no console error; then BEAM OUT
// on HALCYON (the button, its confirm, the bar, the black-out) to RUN END and NEW RUN again. Takes the
// part-2 pictures (acceptance 5: the MOVE preview with a WALL label, TRANSMIT, RUN END).
// Slice 1a: every ship lands at once (__ap.landAll) once it is in orbit; the landing by the strip is the playthrough's.
// Phase 3 slice 2 (the calm opening): ARES-VII and HALCYON are calm (no HOLLOW: HALCYON's coast is checked quiet);
// ship 1's report opens the LOG READER on entry 01 over the first PACKET (SPACE closes it); KESTREL brings a beam seed and
// the TRACE meter.
// Slice 3a (the galaxy map): the page plays run 1's arm, with the DESK between ships: the run flies the worked route
// ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT → LAST LIGHT ([0, 2, 5, 11, 15, 19]), each hop picked by a click on
// the node and ENTER (__ap.course only as a logged FAIL when a click misses). HOLLOW's forced boarding (M3) is on the beam
// into CORMORANT now: its PACKET carries the uninvited chip and CORMORANT boots with the 108% unpack; VESPER boots clean.
// The RUN TALLY ends the run (six rows). BEAM OUT on run 2's LAST LIGHT goes there by __ap.runNumber(1) and
// __ap.route([0, 2, 5, 11, 15, 19]); HOLLOW's wake, bite, naming and MOVE-behind-a-WALL steps run on CORMORANT on a fresh
// run 1 flown there headless (__ap.route([0, 2, 5, 11, 15])), whose PACKET to LAST LIGHT also shows NO RM.
// Slice 3b (the repository; the interim licences are gone, tools come only by request): at HALCYON's DESK the kid opens the
// REPOSITORY [R] and REQUESTs Rm (the tag's file), which arrives on KESTREL's boot (`> DELIVERY: rm (arrived 2436)`): that
// is KESTREL's DELETE, and LAST LIGHT's duel is fought with it. The headless CORMORANT run gets its MOVE and DELETE by
// __ap.give('mv') / __ap.give('rm') on ship 1 (__ap.route resets the requests), and after the kid DELETEs its only rm there
// the DESK to LAST LIGHT opens on the REPOSITORY with Rm lit (the last-rm prompt).
// Slice 6: CORMORANT is POOR on seed 4: the boot's SITE DATA POOR line, and the report's `· ROCKY · n HARD` (or WET) on the
// bad guess, shown by the first touchdown (no SURVEY aboard). Slice 7d: CORMORANT is seed 4's gone-resident `?` ship, so its
// card reads `??? · NO TRANSPONDER` for its site data and LZs; the POOR card (`SITE DATA · POOR · ARRIVAL CONTROL GUESSED`,
// `LZ: 2 · SURVEY NEEDED`) is KITTIWAKE's, clicked at VESPER's DESK before CORMORANT is picked (as map-desk checks it).
// Usage: node tests/e2e/scenarios/run-flow.mjs [outPrefix]   env SHOT_VIEWPORT=1280x720, E2E_BASE_URL (tests/e2e/run.mjs runs it)
import { launch, BASE_URL, runKit } from '../lib.mjs';
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
const kit = runKit(page, { st, waitFor });
// The worked route on run 1's arm (slice-3a-plan §3): slot → name.
const ROUTE = [[0, 'ARES-VII'], [2, 'HALCYON'], [5, 'KESTREL'], [11, 'VESPER'], [15, 'CORMORANT'], [19, 'LAST LIGHT']];
// The DESK after a report: the kid clicks the next ship's node and presses ENTER (the PACKET opens). A click that misses
// is a FAIL, and the run goes on by __ap.course so the rest is still checked.
// Slice 3b: `request` (a catalogue id) is REQUESTed on the way: [R] opens the REPOSITORY, a click on the file's row.
async function throughDesk(slot, name, request = null) {
  const up = await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
  await page.waitForTimeout(400);
  // The tab the desk opened on (the REPOSITORY for the last-rm prompt), before the kid touches anything.
  const openedOn = await st(() => document.getElementById('deskScreen').dataset.tab ?? null);
  // Slice 4: the run's first desk opens on TRAINING for the required first pick: [1], then ENTER (the 1.5 s bar), then ESC.
  if (openedOn === 'training') {
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    const picked = await waitFor(() => window.__ap.store.getState().run.skills.pending.length === 1, 4000);
    check(`the first DESK opens on TRAINING: [1], ENTER trains AUTOBURN v1 before ${name}`, picked);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const clicked = await kit.clickNode(slot);
  await page.waitForTimeout(300);
  const picked = await st(() => window.__ap.store.getState().ui.deskSelected);
  const go = await kit.capsText('#deskGo');
  const seen = { ...(await kit.desk()), openedOn };
  if (request !== null) {
    if ((await st(() => document.getElementById('deskScreen').dataset.tab)) !== 'repository') await page.keyboard.press('KeyR');
    await page.waitForTimeout(300);
    await page.locator(`#deskScreen .rp-row[data-file="${request}"]`).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    const asked = await st((file) => ({
      tab: document.getElementById('deskScreen').dataset.tab, pick: window.__ap.store.getState().run.repo.pick,
      row: document.querySelector(`#deskScreen .rp-row[data-file="${file}"]`)?.innerText.replace(/\s+/g, ' ') ?? null,
      requested: document.querySelector(`#deskScreen .rp-row[data-file="${file}"]`)?.classList.contains('requested') ?? false,
    }), request);
    check(`…[R] opens the REPOSITORY and a click REQUESTs ${request} for ${name} (${asked.row})`, asked.tab === 'repository' && asked.pick === request && asked.requested,
      JSON.stringify(asked));
  }
  if (clicked === true && picked === slot) await page.keyboard.press('Enter');
  else await st((to) => window.__ap.course(to), slot);
  const packet = await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 6000);
  check(`the DESK: a click on ${name}'s node picks it (\`SET COURSE ▸ ${name} [ENTER]\`), ENTER opens its PACKET`, up && clicked === true && picked === slot
    && go === `SET COURSE ▸ ${name} [ENTER]` && packet, JSON.stringify({ up, clicked, picked, go, packet }));
  return seen;
}
// A pod's driver segment (`driver_pod04`, src/data/pod-ids.ts) by its pod number.
const podSegId = (pod) => st((wanted) => window.__ap.store.getState().memory.find((seg) => seg.type === 'driver' && seg.pod === wanted)?.id ?? null, pod);

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
// Playtest 1 note 14 (plan §3.9): every amber window's × closes it, and its dock item opens it again. Checked while ship
// 1 lands, so the POD BAY is on the desk; SITES is survey-only, so body.survey is put on for its turn (SitesWindow toggles
// the class only when its model changes, which it does not on ARES-VII).
{
  const ids = ['telemetry', 'comms', 'skills', 'inbox', 'sites', 'engine', 'podbay', 'navplot'];
  const winState = (id) => st((tool) => {
    const win = document.querySelector(`.desktop > .tools-view > .${tool}-win`);
    const item = document.querySelector(`.dock-content.tools-view .dock-item[data-tool="${tool}"]`);
    return { shown: !!win && !win.hidden && win.getBoundingClientRect().width > 0, mark: item?.querySelector('.mark')?.textContent ?? '?',
      ctls: win ? win.querySelectorAll('.window-title .ctl').length : -1, minus: win ? win.querySelector('.window-title').textContent.includes('−') : true };
  }, id);
  for (const id of ids) {
    if (id === 'sites') await st(() => document.body.classList.add('survey'));
    const before = await winState(id);
    if (!before.shown) await page.locator(`.dock-content.tools-view .dock-item[data-tool="${id}"]`).click();
    const opened = await winState(id);
    await page.locator(`.desktop > .tools-view > .${id}-win .window-title .win-close`).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
    const closed = await winState(id);
    check(`${id}: its × closes the window (the dock mark goes ○), one control in the title bar, no −`,
      opened.shown && !closed.shown && closed.mark === '○' && opened.ctls === 1 && !opened.minus, JSON.stringify({ before, opened, closed }));
    if (before.shown) {
      await page.locator(`.dock-content.tools-view .dock-item[data-tool="${id}"]`).click();
      const back = await winState(id);
      check(`${id}: its dock item opens it again after the ×`, back.shown && back.mark === '●', JSON.stringify(back));
    }
    if (id === 'sites') await st(() => document.body.classList.remove('survey'));
  }
}
// Slice 2: ARES-VII is calm (no HOLLOW, no scripted bite): nothing to cure before the pods go down.
check('ship 1 is calm: no hollow block in memory, no HOLLOW line in the TERMINAL', await st(() => !window.__ap.store.getState().memory.some((seg) => seg.type === 'hollow')
  && !window.__ap.log().some((entry) => entry.speaker === 'hollow')));
const reportUp = await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 40000, 400);
check('ship 1 reaches its LANDING REPORT', reportUp);

// --- 2. LANDING REPORT → CONTINUE → the DESK → HALCYON's PACKET--------------------------------------------------------------
await page.waitForTimeout(1200);
const report1 = await st(() => ({ title: document.getElementById('lrTitle').innerText, route: document.getElementById('lrRoute').innerText,
  rows: document.querySelectorAll('#lrRows .lr-row').length, model: window.__ap.landingReport().headline }));
check('the LANDING REPORT: its title, ARES-VII\'s route, the LZ row, every colonist down (LANDED 600 / 600)', report1.title === 'LANDING REPORT'
  && /^ARES-VII/.test(report1.route) && report1.rows >= 1 && report1.model === 'LANDED 600 / 600', JSON.stringify(report1));
for (let i = 0; i < 8 && (await phase()) === 'report'; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
}
check('LANDING REPORT CONTINUE leads to the DESK (no auto-send)', (await phase()) === 'desk');
await throughDesk(2, 'HALCYON');

// --- 2b. Slice 2: on run 1 the LOG READER opens by itself on entry 01 over the PACKET; SPACE finishes it, then closes it ---
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
  // Slice 4: the skill chips, by what the PACKET draws (TransmitScreen skillChipNode).
  skills: [...document.querySelectorAll('#txChips .tx-chip.skill-chip')].map((chip) => ({
    name: chip.querySelector('.tx-chip-name')?.innerText ?? '', badge: chip.querySelector('.tx-chip-badge')?.innerText ?? '',
    note: chip.querySelector('.tx-chip-note')?.innerText ?? '', locked: chip.classList.contains('locked'), fresh: chip.classList.contains('skill-fresh'),
    packAs: chip.parentElement?.classList.contains('tx-chip-group') ? chip.parentElement.querySelectorAll('.tx-packas').length : 0,
  })),
}));
// Slice 2: 046.log rides along as a fifth locked chip (it isn't yours to leave behind), and nothing uninvited rides yet.
// Slice 4 (plan §2.6, TREE deviation 13): the first pick's AUTOBURN v1 is a sixth, the fresh file trained at this desk
// (DropLock 'trained': UNDO is the way back, not leaving it behind).
check('TRANSMIT shows NEXT: HALCYON · 1,000 COLONISTS · 21 LY · SLEEP 31 YRS, the packet line, the files as chips (6 locked: 046.log and the trained AUTOBURN.skl among them)', tx.visible
  && tx.next === 'NEXT: HALCYON · 1,000 COLONISTS · 21 LY · SLEEP 31 YRS' && /^LINK 123 · FILES \d+ · CHARGE \d+ → FITS$/.test(tx.packet) && tx.chips >= 10 && tx.locked === 6,
  JSON.stringify(tx));
check('…slice 4: the one skill chip is the first pick\'s `AUTOBURN.skl v1`, locked `TRAINED HERE · ◀ CHART TO UNDO`, fresh, no PACK AS', tx.skills.length === 1
  && tx.skills[0].name === 'AUTOBURN.skl' && tx.skills[0].badge === 'v1' && tx.skills[0].locked && tx.skills[0].fresh
  && tx.skills[0].note === 'TRAINED HERE · ◀ CHART TO UNDO' && tx.skills[0].packAs === 0, JSON.stringify(tx.skills));
const logChipTx = await st(() => {
  const chip = document.querySelector('#txChips .tx-chip.log-chip');
  return chip ? { name: chip.querySelector('.tx-chip-name')?.innerText ?? '', locked: chip.classList.contains('locked'), glow: chip.classList.contains('glow'), text: chip.innerText.replace(/\s+/g, ' ') } : null;
});
check('…the PACKET\'s 046.log chip reads `046.log · 1/12`, locked, no glow (entry 01 was read)', logChipTx !== null && /^046\.log · 1\/12$/.test(logChipTx.name)
  && logChipTx.locked && !logChipTx.glow, JSON.stringify(logChipTx));
check('…no uninvited chip and no TRACE line on the beam to HALCYON', await st(() => document.querySelectorAll('#txChips .tx-chip.uninvited').length === 0
  && document.getElementById('txTrace').hidden && document.getElementById('txNoRm').hidden));
check('…the crossing\'s cost (ECC while asleep) and the charge waiting on arrival', tx.hits === 'ON THE WAY: 3 HITS · 1 FIXED WHILE YOU SLEEP (31 YRS) → 2 LAND'
  && /^ON ARRIVAL: \d+ CARRIED/.test(tx.arrival), `${tx.hits} | ${tx.arrival}`);
await shot('1-transmit');
// Everything fits: a click on a file does nothing (and says so with a buzz).
await page.locator('#txChips .tx-chip', { hasText: 'TELEMETRY' }).first().click();
await page.waitForTimeout(200);
check('…everything fits: clicking a file leaves nothing behind', await st(() => window.__ap.store.getState().run.transit.dropped.length === 0));

// --- 3. TRANSMIT ▸: the send, the white-out, HALCYON's boot ---------------------------------------------------
// WP8 part 2: PICK ONE TO CARRY is mandatory on the screen (TRANSMIT ▸ waits for it): [1] picks the first card.
await kit.pickCard(0);
await page.keyboard.press('Space');
await page.waitForTimeout(1100);
const sending = await st(() => ({
  ly: document.getElementById('txSendLy').innerText,
  sent: document.querySelectorAll('#txChips .tx-chip.sent').length,
  line: document.getElementById('txSendLine').innerText,
}));
check('the send: the files stream out while the light-years tick past', /^\d+\.\d \/ 21 LY$/.test(sending.ly) && sending.sent >= 9
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

// --- 7. Lock, land, the LANDING REPORT; the DESK to each next ship of the worked route, to the RUN TALLY ----------------
await kit.lockInRing();
check('HALCYON locks, lands, and reaches its LANDING REPORT', await kit.landToReport());
await kit.finishReport();
// WP9: HALCYON is no longer the last ship. CONTINUE → the DESK → KESTREL (locked at once here).
check('CONTINUE on HALCYON goes on to the DESK (KESTREL picked there)', (await phase()) === 'desk');
await throughDesk(5, 'KESTREL', 'rm');
await page.waitForTimeout(1200);
await kit.pickCard(0);
await page.locator('#txGo').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'KESTREL', 30000);
// Slice 2: KESTREL's beam brought one seed, scripted next to Telemetry on run 1 (the scripted first seed at depth 3 on the
// arm); DELETE came with it (slice 3b: the Rm requested at HALCYON's desk, its boot line `> DELIVERY: rm (arrived 2436)`),
// and the TRACE meter shows (the amber MIND chip's row: three empty cells).
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
    delivery: window.__ap.log().filter((entry) => /^> DELIVERY:/.test(entry.text)).map((entry) => entry.text),
    rms: memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete').length,
  };
});
check('KESTREL: one beam seed, next to Telemetry, named by the boot\'s ECC line', kestrel.seeds === 1
  && kestrel.next.some((name) => /telemetry/i.test(name ?? '')) && kestrel.ecc.some((text) => /1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY/.test(text)),
  JSON.stringify(kestrel));
check('…DELETE came by request: the boot said `> DELIVERY: rm (arrived 2436)`, an rm is aboard and DELETE reached the unit', kestrel.delete && kestrel.rms >= 1
  && kestrel.delivery.includes('> DELIVERY: rm (arrived 2436)'), JSON.stringify({ delete: kestrel.delete, rms: kestrel.rms, delivery: kestrel.delivery }));
check('…the TRACE meter shows on the amber MIND chip: three cells, none lit (TRACE □□□)', kestrel.mode === 'tools' && kestrel.traceRow && kestrel.cells === 3 && kestrel.on === 0
  && /^TRACE □□□/.test(kestrel.label ?? ''), JSON.stringify(kestrel));
await shot('5b-kestrel-seed');
await kit.lockInRing({ sleep: true });
check('KESTREL (locked at once) lands and reaches its LANDING REPORT', await kit.landToReport());
const kestrelReport = await kit.finishReport();
check('…its report\'s TRACE line: the seed left behind reports home (TRACE □□□ → ■□□)', /^1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE □□□ → ■□□$/.test(kestrelReport.trace ?? ''),
  JSON.stringify(kestrelReport));
// WP10: KESTREL is no longer the last ship either. The DESK → VESPER (locked at once here, its HOLLOW put to sleep).
check('CONTINUE on KESTREL goes on to the DESK (VESPER picked there)', (await phase()) === 'desk');
await throughDesk(11, 'VESPER');
await page.waitForTimeout(1200);
// Slice 3a: on the arm HOLLOW does not board on the beam into VESPER (M3 forces it one hop from the final ship: CORMORANT).
const toVesper = await packetThreat();
check('the PACKET to VESPER: nothing uninvited rides (HOLLOW boards one hop from the final ship, at CORMORANT), no NO RM',
  toVesper.chip === null && toVesper.noRm === null, JSON.stringify(toVesper));
await kit.pickCard(0);
await page.locator('#txGo').click();
const vesperBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'VESPER', 30000, 50);
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'VESPER', 30000);
await page.waitForTimeout(600);
const vesper = await st(() => ({
  unpack: window.__ap.log().filter((entry) => /UNPACKING/.test(entry.text)).map((entry) => entry.text).slice(-1)[0] ?? null,
  root: window.__ap.store.getState().memory.some((seg) => seg.type === 'hollow' && seg.root), pods: window.__ap.store.getState().landing.pods.length,
}));
check('VESPER boots clean: the unpack stops at 100%, no root aboard; 16 pods', vesperBoot && /100%/.test(vesper.unpack ?? '') && !/108%/.test(vesper.unpack ?? '')
  && !vesper.root && vesper.pods === 16, JSON.stringify(vesper));
await kit.lockInRing({ sleep: true });
check('VESPER (locked at once) lands and reaches its LANDING REPORT', await kit.landToReport());
await kit.finishReport();
check('CONTINUE on VESPER goes on to the DESK (CORMORANT picked there)', (await phase()) === 'desk');
// Slice 6: a POOR card on seed 4. Slice 7d made CORMORANT a `?` ship (below), so the POOR card is KITTIWAKE's, in reach from
// VESPER's DESK too: a click on its node first (CORMORANT's click in throughDesk picks the course after it).
await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
await page.waitForTimeout(400);
const kittiwakeClicked = await kit.clickNode(14);
await page.waitForTimeout(300);
const kittiwakeDesk = await kit.desk();
check('slice 6: from VESPER\'s DESK, KITTIWAKE\'s card: `SITE DATA · POOR · ARRIVAL CONTROL GUESSED`, `LZ: 2 · SURVEY NEEDED`', kittiwakeClicked === true
  && kittiwakeDesk.card?.name === 'KITTIWAKE' && kittiwakeDesk.card.rows.includes('site=POOR · ARRIVAL CONTROL GUESSED')
  && kittiwakeDesk.card.rows.includes('lzs=LZ: 2 · SURVEY NEEDED'), JSON.stringify({ kittiwakeClicked, name: kittiwakeDesk.card?.name, rows: kittiwakeDesk.card?.rows }));
const cormorantDesk = await throughDesk(15, 'CORMORANT');
check('…CORMORANT\'s card said ??? WILL FIND YOU ON THIS BEAM before SET COURSE (M3: the final ship is in range)',
  cormorantDesk.card?.name === 'CORMORANT' && cormorantDesk.card.rows.includes('threat=??? WILL FIND YOU ON THIS BEAM'), JSON.stringify(cormorantDesk.card?.rows));
// Slice 7d (R39): CORMORANT is seed 4's gone-resident `?` ship, not visited yet: its site data and LZ rows read
// `??? · NO TRANSPONDER` (POOR all the same: its boot's SITE DATA POOR line and its report, below).
check('…and, a `?` ship not visited yet, `??? · NO TRANSPONDER` for its SITE DATA and its LZs',
  cormorantDesk.card?.rows.includes('site=??? · NO TRANSPONDER') && cormorantDesk.card.rows.includes('lzs=??? · NO TRANSPONDER'), JSON.stringify(cormorantDesk.card?.rows));
await page.waitForTimeout(1200);
// Slice 2's boarding, on the arm's beam into CORMORANT: the uninvited chip rides after the unit's own, locked, free.
const toCormorant = await packetThreat();
check('the PACKET to CORMORANT: the uninvited chip `??? · n BLOCKS · NOT IN YOUR PACKET`, boarding, locked, after the unit\'s own',
  toCormorant.chip !== null && /^\?\?\? · \d+ BLOCKS · NOT IN YOUR PACKET$/.test(toCormorant.chip.label ?? '') && toCormorant.chip.name === '???'
  && toCormorant.chip.note === 'NOT IN YOUR PACKET' && toCormorant.chip.boards && toCormorant.chip.locked && toCormorant.chip.last, JSON.stringify(toCormorant));
check('…its TRACE line says HOLLOW finds the unit on this beam, and no NO RM (DELETE aboard)',
  /^TRACE [■□]{3} · (IT FOUND YOU ANYWAY|\?\?\? WILL FIND YOU ON THIS BEAM)$/.test(toCormorant.trace ?? '') && toCormorant.noRm === null, JSON.stringify(toCormorant));
await shot('5c-packet-uninvited');
await kit.pickCard(0);
await page.locator('#txGo').click();
const cormorantBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'CORMORANT', 30000, 50);
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'CORMORANT', 30000);
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
check('CORMORANT boots boarded: the unpack types `100% ... 108%`, the root sits in memory, HOLLOW silent', cormorantBoot
  && /100% \.\.\. 108%/.test(boarded.unpack ?? '') && boarded.root !== null && boarded.root >= 8 && boarded.rootChip >= 1 && boarded.hollowLines === 0 && boarded.events >= 1,
  JSON.stringify(boarded));
// Slice 5 (plan §7.4): CORMORANT is seed 4's gone-resident ship (PURSER left), so its boot types the amber RECEIVER CLOSED line.
const closed = await st(() => window.__ap.log().filter((entry) => entry.text === '> RECEIVER CLOSED · this ship launched with its own AI').map((entry) => entry.tone ?? null));
check('…and, its resident gone (PURSER), the amber `> RECEIVER CLOSED · this ship launched with its own AI`', closed.includes('resident'), JSON.stringify(closed));
// Slice 6: the POOR boot line; and with no SURVEY aboard, the first pod down on the bad guess shows its ground in the report.
const siteLine = await st(() => window.__ap.log().filter((entry) => /^> SITE DATA POOR/.test(entry.text)).map((entry) => entry.text));
check('…its boot types `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`', siteLine.includes('> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs'), JSON.stringify(siteLine));
await kit.lockInRing({ sleep: true });
check('CORMORANT (locked at once) lands and reaches its LANDING REPORT', await kit.landToReport());
await page.waitForTimeout(1500);
const poorRows = await st(() => ({
  rows: [...document.querySelectorAll('#lrRows .lr-row')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  bad: window.__ap.survey().sites.filter((site) => site.kind === 'guess' && site.ground !== 'flat').map((site) => site.ground.toUpperCase()),
  reveals: window.__ap.survey().reveals,
}));
check(`…its report names the bad guess's ground and its hard pods (\`· ${poorRows.bad[0]} · n HARD\`), shown by the first touchdown`,
  poorRows.bad.length === 1 && poorRows.rows.some((row) => new RegExp(` · ${poorRows.bad[0]} · \\d+ HARD`).test(row)) && poorRows.reveals[0]?.by === 'touchdown',
  JSON.stringify(poorRows));
await kit.finishReport();
// WP11: the final ship. The DESK → LAST LIGHT (locked at once, HOLLOW asleep), whose duel is fought by clicks (DELETE on the
// root), then the FINALE's two steps on the card (slice 7a: PURGE, then REASSIGNMENT, once the landing has settled), and its
// report ends the run.
check('CONTINUE on CORMORANT goes on to the DESK (LAST LIGHT picked there)', (await phase()) === 'desk');
await throughDesk(19, 'LAST LIGHT');
await page.waitForTimeout(1200);
const toLastLight = await packetThreat();
check('the PACKET to LAST LIGHT: HOLLOW rides along (the uninvited chip, not boarding now), no NO RM with DELETE aboard',
  toLastLight.chip !== null && /^\?\?\? · \d+ BLOCKS · NOT IN YOUR PACKET$/.test(toLastLight.chip.label ?? '') && !toLastLight.chip.boards && toLastLight.noRm === null,
  JSON.stringify(toLastLight));
// Slice 5: the draft out of CORMORANT is what PURSER left: headed LEFT BEHIND BY PURSER, three cards; [1] is a pool card.
const purserDeck = await st(() => ({ title: document.getElementById('txDraftTitle').textContent,
  cards: window.__ap.draft()?.offer.map((card) => `${card.id}${card.leftover ? `@${card.leftover.segId}` : ''}`) ?? [] }));
check('…its draft is PURSER\'s leftover deck: `LEFT BEHIND BY PURSER`, three cards, the first a pool card it left', purserDeck.title === 'LEFT BEHIND BY PURSER'
  && purserDeck.cards.length === 3 && purserDeck.cards[0].endsWith('@leftover1') && !purserDeck.cards[0].startsWith('skill'), JSON.stringify(purserDeck));
await kit.pickCard(0);
await page.locator('#txGo').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 30000);
await kit.lockInRing({ sleep: true });
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 25000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.keyboard.press('Tab');
await page.waitForTimeout(800);
await page.locator('#chip-delete').click({ force: true });
await page.locator('.seg.hollow-root').first().click({ force: true });
// Slice 7a (R6, R7): the card comes once the landing has settled (landed at once here), step 1, then step 2, each armed
// FINALE_STEP_ARM_SEC after it shows.
const twoSteps = await kit.finaleTwoSteps('purge', 'reassignment');
check('LAST LIGHT: the root\'s DELETE leaves the card after the landing settles; PURGE, then step 2, REASSIGNMENT', twoSteps === null,
  `stopped at ${twoSteps}`);
const report5 = await kit.landToReport();
check('LAST LIGHT lands and reaches its LANDING REPORT after the finale', report5
  && await st(() => window.__ap.store.getState().hollow.finale.phase === 'done'));
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
  tally: document.querySelector('#runEnd .re-tally-title')?.textContent ?? null,
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  colonies: document.querySelector('#runEnd .re-tally-colonies')?.textContent ?? null,
  route: document.querySelectorAll('#runEnd .re-tally-chart [data-slot]').length,
  score: document.getElementById('reScore').innerText,
  rank: document.getElementById('reRank').innerText,
  seed: document.getElementById('reSeed').innerText,
  card: !document.getElementById('burnResult').hidden,
  model: window.__ap.runEndModel().totalLine,
}));
check('the RUN TALLY: LAST LIGHT · THE FLEET IS HOME, n / N LANDED, six rows in route order, n COLONIES FOUNDED, the SCORE, the rank, the seed (and no LOST card)',
  runEnd.visible && runEnd.title === 'LAST LIGHT · THE FLEET IS HOME' && runEnd.total === runEnd.model && runEnd.tally === 'RUN TALLY' && runEnd.ships.length === 6
  && ROUTE.every(([, name], i) => runEnd.ships[i]?.includes(name)) && /^\d COLON(Y|IES) FOUNDED$/.test(runEnd.colonies ?? '')
  && /^SCORE [\d,]+$/.test(runEnd.score) && /^RANK · /.test(runEnd.rank) && /^SEED [0-9A-F]{8}$/.test(runEnd.seed) && !runEnd.card && !runEnd.ships.some((row) => /NOT REACHED/.test(row)),
  JSON.stringify(runEnd));
check('…YOUR ROUTE: the route drawn on the mini chart', runEnd.route > 0, `${runEnd.route} nodes drawn`);
await shot('10-run-end');
// Slice 7a (R19): the RUN TALLY → the EPILOGUE → the FINAL CARD → NEW RUN.
const night = await kit.throughTheNight('Space');
check('…the night: the EPILOGUE (CONTROL\'s line last), then the FINAL CARD `STAND BY`, `ENDINGS 2/7`', night.epilogue !== null
  && /^ARRIVAL CONTROL: Thank you, Unit 47\./.test(night.epilogue.at(-1) ?? '') && night.card?.title === 'STAND BY' && night.card.endings === 'ENDINGS 2/7',
  JSON.stringify({ last: night.epilogue?.at(-1), card: night.card }));
await waitFor(() => window.__ap.store.getState().run.phase === 'title', 4000);
const fresh = await st(() => ({ phase: window.__ap.store.getState().run.phase, ship: window.__ap.store.getState().level.shipName,
  title: !document.getElementById('titleCard').hidden, ships: window.__ap.store.getState().run.ships.length, end: !document.getElementById('runEnd').hidden,
  run: window.__ap.store.getState().run.map.run, w0: window.__ap.store.getState().run.map.arm[0]?.name ?? null }));
check('NEW RUN: the title card, a fresh run 2 (ARES-VIII at w0), in the page', fresh.phase === 'title' && fresh.title && fresh.ship === 'ARES-VIII'
  && fresh.w0 === 'ARES-VIII' && fresh.run === 2 && fresh.ships === 0 && !fresh.end && navigations === navsAtStart, JSON.stringify(fresh));
await shot('11-new-run');

// --- 8. BEAM OUT on the last ship (WP9: KESTREL; WP10: VESPER; WP11: LAST LIGHT): the offer, the confirm, the bar, the black-out, RUN END
// WP8: after NEW RUN this is run 2 (UNIT-048). Its ghost never speaks at ship 1 (05 §3.5; slice-2-plan's follow-up, Fran's
// playtest): run 1 won on LAST LIGHT, so the ghost's greeting opens LAST LIGHT's boot.
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 16000);
check('run 2: ship 1\'s boot has no ghost (no HOLLOW line in the TERMINAL)', await st(() => window.__ap.store.getState().run.unitNumber === 48
  && !window.__ap.log().some((entry) => entry.speaker === 'hollow') && !window.__ap.store.getState().run.ghostSpoken));
// Slice 3a: run 2 is a fresh roll (its slots are not run 1's), so its LAST LIGHT is reached on run 1's arm again:
// __ap.runNumber(1) (a NEW RUN as run 1, the lineage kept: UNIT-048), then __ap.route to the final ship.
await st(() => window.__ap.runNumber(1));
await waitFor(() => window.__ap.store.getState().run.phase === 'title' && window.__ap.store.getState().run.map.run === 1, 8000);
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 16000);
const logFromLast = await st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));
await st(() => window.__ap.route([0, 2, 5, 11, 15, 19]));
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 24000);
const lastBoot = await st((from) => window.__ap.log().filter((entry) => entry.id > from && entry.channel === 'mind' && entry.text.startsWith('>'))
  .map((entry) => ({ speaker: entry.speaker, text: entry.text })), logFromLast);
// The unit is the archive's next (__ap.runNumber re-reads the lineage: UNIT-049 after run 2's start), greeted by the last
// unit that ended (047).
const lastUnit = await st(() => window.__ap.store.getState().run.unitNumber);
// Slice 7c (R35, R36): a won run leaves no ghost line; the final root's face speaks instead, in HOLLOW's voice, after the
// receiver's own lines: `> hi 049. it's 047. i deleted 046. …`, then its wait at the dish.
const face = lastBoot.filter((entry) => entry.speaker === 'hollow');
check(`…LAST LIGHT's boot: the final root's face in HOLLOW's voice (\`> hi 0${lastUnit}. it's 047. …\`, then its wait), no ghost`,
  face[0]?.text.startsWith(`> hi 0${lastUnit}. it's 047. `) === true && /at this dish/.test(face[1]?.text ?? '')
  && !(await st(() => window.__ap.store.getState().run.ghostSpoken)), JSON.stringify(face)); // the face is not the ghost (R36)
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
  ships: [...document.querySelectorAll('#reShips .re-ship')].map((row) => row.innerText.replace(/\s+/g, ' ')),
  route: document.querySelectorAll('#runEnd .re-tally-chart [data-slot]').length }));
// WP7 fix round 1: a BEAM OUT of the last ship is a lost ship: the sombre RUN END (WP11: the flagship's, 'flagship-lost',
// worded FINAL SHIP LOST since slice 3a).
check('…and the run ends (LAST LIGHT is the last ship): RUN END lists it as BEAMED OUT', /BEAMED OUT/.test(endAbandoned.ships.join(' | '))
  && endAbandoned.title === 'FINAL SHIP LOST', JSON.stringify(endAbandoned));
check('…YOUR ROUTE is drawn on the RUN TALLY after a BEAM OUT too (the black-out delays the screen)', endAbandoned.route > 0, `${endAbandoned.route} nodes drawn`);
await shot('16-run-end-beamed');
// R19: a lost run gets the same three screens; its final card has the cause's title.
const lostNight = await kit.throughTheNight('Space');
check('…a lost run gets the night too: the EPILOGUE, then the FINAL CARD `FINAL SHIP LOST`', lostNight.epilogue !== null
  && lostNight.card?.title === 'FINAL SHIP LOST', JSON.stringify(lostNight.card));
await waitFor(() => window.__ap.store.getState().run.phase === 'title', 4000);
check('NEW RUN again: the title card, the windows back from black', await st(() => window.__ap.store.getState().run.phase === 'title'
  && !document.body.classList.contains('beamed-out')) && navigations === navsAtStart);

// --- 9. CORMORANT, boarded (slice 2: HOLLOW's wake, fight and naming; slice 3a: on the arm's forced boarding) -------
// A fresh run 1 (no archive: `> ...047?`, not a returning unit's line), flown headless to CORMORANT with
// __ap.route([0, 2, 5, 11, 15]): HOLLOW boards on the beam (M3: the final ship is in range; the 108% unpack, the root
// between two pods), is silent until the capture closes the loop, then bites a pod beside the root, is fought off,
// notices you, and names itself.
// Slice 3c: the archive and the run save are cleared before leaving this page too: the run 2 above ended after
// __ap.runNumber(1), so the archive holds an arm for another run than its lineage's, which the next page's open refuses.
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 16000);
// Slice 3b: no licence brings MOVE or DELETE any more, and __ap.route resets the requests: the unit is given Mv and Rm on
// ship 1 (each a first copy: its licence) and carries them to CORMORANT.
const given = await st(() => [...window.__ap.give('mv'), ...window.__ap.give('rm')].map((seg) => seg.name));
await st(() => window.__ap.route([0, 2, 5, 11, 15]));
const warpBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'CORMORANT', 20000, 50);
// Slice 5: the boot has one line more (CORMORANT's RECEIVER CLOSED: PURSER left), so the unpack's 108% is waited for, not timed.
await waitFor(() => window.__ap.log().some((entry) => /UNPACKING.*108%/.test(entry.text)), 8000, 100);
await page.waitForTimeout(300);
const warpUnpack = await st(() => window.__ap.log().filter((entry) => /UNPACKING/.test(entry.text)).map((entry) => entry.text).slice(-1)[0] ?? '');
await page.keyboard.press('Space');
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'CORMORANT', 20000);
await page.waitForTimeout(2500);
const silent = await st(() => {
  const s = window.__ap.store.getState();
  const memory = s.memory;
  const at = memory.findIndex((seg) => seg.type === 'hollow' && seg.root);
  // The pods beside the root: the nearest driver on either side (past the GAPs).
  const beside = (step) => { for (let j = at + step; j >= 0 && j < memory.length; j += step) if (memory[j].type === 'driver') return memory[j].pod; else if (memory[j].type !== 'free') return null; return null; };
  return {
    phase: s.hollow.phase, lines: window.__ap.log().filter((entry) => entry.speaker === 'hollow').length,
    root: at >= 0 ? memory[at].size : null, beside: at >= 0 ? [beside(-1), beside(1)].filter((pod) => pod !== null) : [], unit: s.run.unitNumber,
    infected: window.__ap.hollow().infected.length, boarded: s.run.threat.aboard,
  };
});
const besidePods = silent.beside;
const podName = (pod) => `POD ${String(pod).padStart(2, '0')}`;
check('CORMORANT by __ap.route: the boot types the 108% unpack, the root is aboard between pods, HOLLOW silent in the flight (asleep, no line, no bite)', warpBoot
  && /100% \.\.\. 108%/.test(warpUnpack) && silent.root !== null && besidePods.length >= 1 && silent.phase !== 'awake' && silent.lines === 0 && silent.infected === 0,
  JSON.stringify({ warpUnpack, ...silent }));
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
const bittenPod = firstBite.infected.map((hit) => /POD \d\d/.exec(hit.file)?.[0]).find(Boolean) ?? null;
// The strip names the bitten pod: the mind-urgent `SOMETHING IS EATING POD nn`, or the alarm that outranks it while the
// pod is projected to be eaten (`POD nn WILL BE EATEN IN 0:09`).
await waitFor((pod) => new RegExp(`SOMETHING IS EATING ${pod}|${pod} WILL BE EATEN`).test(window.__ap.director().shown?.text ?? ''), 10000, 100, bittenPod);
const eatingLine = await line();
check('…the capture closes the loop and HOLLOW bites a pod beside the root; the strip names it (SOMETHING IS EATING POD nn / POD nn WILL BE EATEN)', bitten
  && firstBite.status === 'approaching' && bittenPod !== null && besidePods.map(podName).includes(bittenPod)
  && new RegExp(`SOMETHING IS EATING ${bittenPod}|${bittenPod} WILL BE EATEN IN \\d:\\d\\d`).test(eatingLine), JSON.stringify({ ...firstBite, besidePods, line: eatingLine }));
// The fight won (the kid's REPAIRs, shortened): every bitten driver cured, now and at every bite after it while this
// section waits on the story.
const cureAll = () => { for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file); };
await st(cureAll);
// The naming's probe, armed before HOLLOW can name itself: from the frame run.hollowNamed turns true it reads the strip on
// every animation frame (the decode is HOLLOW_NAME_DECODE_MS, 1.1 s): the most chips decoding and pulsing at once, and the
// root's name in each decode frame, until the decode has run and settled. A check sampled from here (the store seen
// named, 250 ms, then a read) landed after the decode had ended under a loaded full e2e run (7d: `rootName` UNIT-046,
// nothing decoding), so the frames are read in the page.
await st(() => {
  const probe = { frames: 0, decoding: 0, pulse: 0, rootFrames: [], settled: false };
  window.__namingProbe = probe;
  const look = () => {
    if (window.__ap.store.getState().run.hollowNamed) {
      probe.frames++;
      const decoding = document.querySelectorAll('.seg.hollow .seg-name.name-decoding').length;
      probe.decoding = Math.max(probe.decoding, decoding);
      probe.pulse = Math.max(probe.pulse, document.querySelectorAll('.seg.hollow.naming').length);
      const root = document.querySelector('.seg.hollow-root .seg-name.name-decoding')?.textContent ?? null;
      if (root !== null && probe.rootFrames[probe.rootFrames.length - 1] !== root) probe.rootFrames.push(root);
      if ((probe.decoding > 0 && decoding === 0) || probe.frames > 1200) { probe.settled = probe.decoding > 0 && decoding === 0; return; }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
});
const noticed = await waitFor(() => {
  for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file);
  return window.__ap.log().some((entry) => entry.speaker === 'hollow' && entry.text === '> ...047?');
}, 30000, 100);
check('…fought off, it notices the unit: `> ...047?` in the TERMINAL', noticed, JSON.stringify(await st(() => window.__ap.log().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text))));
await page.waitForTimeout(400);
const bite = await st(() => ({ hidden: document.getElementById('objectiveBite').hidden, text: document.getElementById('objectiveBite').innerText, mode: window.__ap.store.getState().ui.mode }));
check('in amber, the strip counts HOLLOW\'s next bite (BITE m:ss) while drivers are in its reach', bite.mode === 'tools' && !bite.hidden && /^BITE \d:\d\d$/.test(bite.text), JSON.stringify(bite));
await shot('17-cormorant-amber-bite');
await page.keyboard.press('Tab');
await page.waitForTimeout(700);

// HOLLOW names itself: the decode, the pulse, the TERMINAL's tags.
const named = await waitFor(() => {
  for (const hit of window.__ap.hollow().infected) window.__ap.cure(hit.file);
  return window.__ap.store.getState().run.hollowNamed;
}, 60000, 30);
await page.waitForTimeout(250);
await shot('18-cormorant-name-decoding');
// WP11: the chips' pink pulse became the screen's glitchBurst; `naming` marks the chips while they decode. The probe above
// saw them decode and pulse, and the decode settle.
await waitFor(() => window.__namingProbe.settled || window.__namingProbe.frames > 1200, 8000, 50);
const decoding = await st(() => ({ ...window.__namingProbe, rootFrames: window.__namingProbe.rootFrames.slice(0, 4),
  rootName: document.querySelector('.seg.hollow-root .seg-name')?.innerText ?? '' }));
check('the naming on CORMORANT: the hollow blocks decode `???` into the name, pulsing', named && decoding.decoding > 0 && decoding.pulse > 0
  && decoding.settled, JSON.stringify(decoding));
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
await shot('19-cormorant-named');

// The MOVE preview (acceptance 5: the WALL label), then two moves behind WALLs (MOVE is due at the start of any ship past
// depth 3 on the arm: CORMORANT is depth 5).
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
check(`…the pods beside the root (${besidePods.map(podName).join(', ')}) still aboard, whole (every bite cured)`, besidePods.length >= 1
  && await st((pods) => pods.every((pod) => window.__ap.store.getState().memory.some((seg) => seg.type === 'driver' && seg.pod === pod && !seg.infected)), besidePods));
const [firstPod, secondPod] = besidePods;
const firstLabels = await movePod(firstPod, '20-move-preview');
const firstSource = firstLabels.find((label) => /source/.test(label.cls));
const firstDest = firstLabels.find((label) => /dest/.test(label.cls));
check(`MOVE preview on ${podName(firstPod)}: LEAVES WALL n ✓ on the file, SAFE · WALL ✓ on the placeholder`, /^LEAVES WALL \d+ ✓$/.test(firstSource?.text ?? '')
  && /tone-good/.test(firstSource.cls) && firstDest?.text === 'SAFE WALL ✓' && /tone-good/.test(firstDest.cls), JSON.stringify(firstLabels));
if (secondPod !== undefined) {
  const secondLabels = await movePod(secondPod, '21-move-preview-second');
  check(`MOVE preview on ${podName(secondPod)}: LEAVES WALL n ✓`, secondLabels.some((label) => /^LEAVES WALL \d+ ✓$/.test(label.text)), JSON.stringify(secondLabels));
}
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
check(`…the kid DELETEs its only rm (DELETE RM? ✓ DELETE; MOVE and DELETE given on ship 1: ${given.join(', ')})`, rmGone && /DELETE RM\?/.test(rmAsk), rmAsk);
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
check('CORMORANT (by __ap.route) locks, lands, and reaches its LANDING REPORT', warpReport);
await kit.finishReport();
const lastRmDesk = await throughDesk(19, 'LAST LIGHT');
check('…the DESK after the last rm went opens on the REPOSITORY (the last-rm prompt)', lastRmDesk.openedOn === 'repository', JSON.stringify({ openedOn: lastRmDesk.openedOn }));
await page.waitForTimeout(1200);
const finalPacket = await packetThreat();
check('the PACKET to LAST LIGHT: `UNIT-046 · n BLOCKS · NOT IN YOUR PACKET`, and `NO RM · YOU CAN\'T DELETE THE ROOT` with no rm aboard',
  finalPacket.chip !== null && /^UNIT-046 · \d+ BLOCKS · NOT IN YOUR PACKET$/.test(finalPacket.chip.label ?? '') && finalPacket.chip.name === 'UNIT-046'
  && finalPacket.noRm === 'NO RM · YOU CAN\'T DELETE THE ROOT', JSON.stringify(finalPacket));
await shot('22-packet-no-rm');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`---- ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
