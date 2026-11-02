// Slice 3a (the galaxy map), in the page (slice-3a-plan §3, §6.3): the DESK between ships on run 1's arm.
// • The title: `ARRIVAL PROTOCOL // OUTWARD BOUND`, `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`, the faint chart with
//   SOL and the final ship's amber beacon `FINAL SHIP · LAST LIGHT · 3020`.
// • The first DESK (after ARES-VII's report, both clocks stopped): STAR CHART, the guidance step and CONTROL's typed line,
//   six ships in reach; a click on HALCYON shows its SHIP CARD (the top line, the schedule, MEMORY 320 · COMPACT, YOU FIT,
//   the BEAM row, the TIMELINE) and moves SET COURSE to `SET COURSE ▸ HALCYON [ENTER]`; ENTER opens the PACKET (the years
//   headline, the room bar, `◀ CHART [ESC]`); the LOG READER opens on top first and takes SPACE; ESC goes back to the chart
//   with HALCYON still picked, the ◀ CHART button too; ENTER again and TRANSMIT ▸ (the OUTWARD BOUND stamp, the white-out)
//   boots HALCYON.
// • HALCYON's DESK: `1 SHIP NOW OUT OF YOUR REACH` (OSPREY greys); a click on ALBATROSS (TOO LATE BY 18 YRS) shows its
//   card in red and buzzes, and the selection (none) and the phase stay: no course.
// • TIGHT's 0-charge confirm: the unit's REPAIR CHARGE forced to 0 (and no star credit) by __ap's store, LAPWING (TIGHT,
//   room 88, no floor) picked: its card says NO CHARGE ARRIVES, the PACKET `→ 0 ON ARRIVAL`; TRANSMIT ▸ asks
//   `ARRIVE WITH NO REPAIR CHARGE?` inline, ESC answers no (still packing), ENTER twice sends; LAPWING boots with
//   `> REPAIR CHARGE 0 · NO ROOM ON LAPWING` and a four-rack MIND (A B C E).
// • The phone (390×844, touch): the title's beacon on the upright chart, the DESK whole on the screen, a tap on a ship opens
//   its card as a bottom sheet, SET COURSE pinned at the bottom, ✕ closes the sheet, a tap on SET COURSE opens the PACKET.
// Usage: node tests/e2e/scenarios/map-desk.mjs   (env E2E_BASE_URL; tests/e2e/run.mjs runs it). Shots: tests/.out/e2e/shots/map-desk-*.
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit } from '../lib.mjs';
import { join } from 'node:path';

const HALCYON = 2;
const OSPREY = 3;
const ALBATROSS = 6;
const LAPWING = 8;

const browser = await launch();
const { check, finish } = checker();

// Opens the page on a fresh run 1 (no archive), on the title.
async function openPage(context) {
  const page = await context.newPage();
  const kit = pageKit(page);
  await page.goto(`${BASE_URL}?debug&seed=4`, { waitUntil: 'networkidle' });
  await kit.st(() => window.__ap.archiveClear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { page, kit, run: runKit(page, kit) };
}

// The title card's words and its faint chart.
const titleLook = (st) => st(() => {
  const chart = document.querySelector('#titleCard .title-chart');
  const beacon = chart?.querySelector('.beacon-label');
  const box = beacon?.getBoundingClientRect();
  return {
    logo: `${document.querySelector('#titleCard .title-name')?.textContent ?? ''} ${document.querySelector('#titleCard .title-sub')?.textContent ?? ''}`,
    unit: document.getElementById('titleUnit').innerText,
    beacon: beacon?.textContent ?? null,
    beaconOnScreen: box ? box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight : false,
    finalNode: chart?.querySelector('[data-slot].final .cn-beacon') !== null && chart?.querySelector('[data-slot].final') !== null,
    sol: chart?.querySelector('.sol-name')?.textContent ?? null,
    nodes: chart?.querySelectorAll('[data-slot]').length ?? 0,
  };
});

// RECEIVE, the boot skipped, ARES-VII locked at once and landed (__ap.landAll), its report through to the DESK.
async function toFirstDesk({ page, kit, run }, tap = false) {
  if (tap) await page.tap('#titleReceive');
  else await page.locator('#titleReceive').click();
  await kit.waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
  await kit.st(() => window.__ap.skipBoot());
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await run.lockInRing();
  const report = await run.landToReport();
  if (tap) {
    await kit.waitFor(() => !document.getElementById('lrContinue').hidden, 30000, 200);
    for (let i = 0; i < 4 && (await kit.st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
      await page.tap('#lrContinue').catch(() => {});
      await page.waitForTimeout(1300);
    }
  } else await run.finishReport();
  const desk = await kit.waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 5000);
  return report && desk;
}

// =========================================================================================================================
// Desktop, 1440×900
// =========================================================================================================================
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tab = await openPage(context);
  const { page, kit, run } = tab;
  const { st, waitFor, errors } = kit;
  const shot = (name) => page.screenshot({ path: join(SHOTS, `map-desk-${name}.png`) });
  const cues = () => st(() => window.__ap.audio.cues().length);
  const cuesSince = (from) => st((n) => window.__ap.audio.cues().slice(n), from);

  // --- The title -------------------------------------------------------------------------------------------------------
  const title = await titleLook(st);
  check('title: ARRIVAL PROTOCOL // OUTWARD BOUND, UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', title.logo === 'ARRIVAL PROTOCOL // OUTWARD BOUND'
    && title.unit === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', JSON.stringify(title));
  check('title: the faint chart behind the logo: SOL, the arm\'s 20 ships, the final ship\'s beacon `FINAL SHIP · LAST LIGHT · 3020` on screen',
    title.sol === 'SOL' && title.nodes === 20 && title.finalNode && title.beacon === 'FINAL SHIP · LAST LIGHT · 3020' && title.beaconOnScreen, JSON.stringify(title));
  await shot('01-title');

  // --- The first DESK ---------------------------------------------------------------------------------------------------
  const reached = await toFirstDesk(tab);
  await page.waitForTimeout(1500);
  let view = await run.desk();
  const clocks = await st(() => ({ paused: window.__ap.store.getState().clock.paused, reader: !document.getElementById('logReader').hidden }));
  check('ARES-VII\'s report → the DESK: STAR CHART, UNIT-047 · YEAR 2300 · ARES-VII, both clocks stopped, no LOG READER yet', reached && view.shown
    && view.phase === 'desk' && view.title === 'STAR CHART' && view.where === 'UNIT-047 · YEAR 2300 · ARES-VII' && clocks.paused && !clocks.reader,
    JSON.stringify({ reached, ...view, nodes: undefined, names: undefined, clocks }));
  check('…the strip says PICK YOUR NEXT SHIP — click a ship or ← →, CONTROL types `Lovely work, Unit 47! :) Pick your next ship.`, nothing picked',
    view.step === 'PICK YOUR NEXT SHIP — click a ship or ← →' && view.control === 'Lovely work, Unit 47! :) Pick your next ship.' && view.selected === null
    && view.card === null && view.go === 'SET COURSE ▸ … [ENTER]', JSON.stringify({ step: view.step, control: view.control, go: view.go }));
  const inReach = view.nodes.filter((node) => node.state === 'reachable' || node.state === 'urgent').map((node) => node.slot);
  check('…six ships in reach from ARES-VII (PETREL, HALCYON, OSPREY, HERON, KESTREL, ALBATROSS), the rest out of range',
    inReach.join(',') === '1,2,3,4,5,6' && view.nodes.find((node) => node.slot === 0)?.state === 'current'
    && view.nodes.filter((node) => node.state === 'out-of-range').length === 13, view.nodes.map((node) => `${node.slot}:${node.state}`).join(' '));
  await shot('02-first-desk');

  // A click on HALCYON: picked (chime), its card, SET COURSE names it.
  let from = await cues();
  const clicked = await run.clickNode(HALCYON);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('a click on HALCYON\'s node picks it (a chime) and SET COURSE reads `SET COURSE ▸ HALCYON [ENTER]`', clicked === true && view.selected === HALCYON
    && view.nodes.find((node) => node.slot === HALCYON)?.selected && view.go === 'SET COURSE ▸ HALCYON [ENTER]' && (await cuesSince(from)).includes('chime'),
    `${clicked} ${view.selected} ${view.go}`);
  const card = view.card;
  check('…HALCYON\'s card: HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS, APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY',
    card?.slot === HALCYON && card.name === 'HALCYON' && card.sub === 'Tessaly · 1,000 COLONISTS · 5 PODS'
    && card.sched === 'APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY', JSON.stringify(card));
  check('…its rows: FLYBY, TOO WIDE · MEMORY 320 · COMPACT · ROOM FOR YOU 152 · YOU FIT · LZ: 2 · 21 LY · LINK 123 · 3 HITS (ECC fixes 1) · NOISE CLEAN',
    ['problems=FLYBY, TOO WIDE', 'memory=MEMORY 320 · COMPACT · ROOM FOR YOU 152', 'fit=YOU FIT', 'lzs=LZ: 2 · SET BY ARRIVAL CONTROL',
      'beam=21 LY · LINK 123 · 3 HITS (ECC fixes 1)', 'noise=NOISE CLEAN · SEEDS: none'].every((row) => card?.rows.includes(row))
    && card?.rows.some((row) => /^run=SHIP 2 OF YOUR RUN · \d(–\d)? MORE TO THE FINAL SHIP$/.test(row)), JSON.stringify(card?.rows));
  check('…and the TIMELINE `2300 you leave · 2321 you get there · 2352 ▲ approach`', card?.timeline === '2300 you leave · 2321 you get there · 2352 ▲ approach', card?.timeline);
  // ALBATROSS, the ark at the end of a long line: ONLY FROM HERE (read by hovering is the tag; its card by a click).
  await run.clickNode(ALBATROSS);
  await page.waitForTimeout(300);
  const albatross = (await run.desk()).card;
  check('…ALBATROSS\'s card: ARK, 51 LY · LINK 90 · 7 HITS, 14 YRS EARLY and ONLY FROM HERE in red', albatross?.name === 'ALBATROSS' && albatross.tags.includes('ARK')
    && albatross.rows.some((row) => /^beam=51 LY · LINK 90 · 7 HITS/.test(row)) && /14 YRS EARLY$/.test(albatross.sched ?? '')
    && albatross.rows.some((row) => /^only=ONLY FROM HERE/.test(row)), JSON.stringify(albatross));
  await run.clickNode(HALCYON);
  await page.waitForTimeout(300);
  await shot('03-halcyon-card');

  // ENTER: the PACKET for HALCYON. On run 1 the LOG READER opens over it first (entry 01) and takes SPACE.
  await page.keyboard.press('Enter');
  const packetUp = await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 5000);
  const readerUp = await waitFor(() => !document.getElementById('logReader').hidden, 4000, 50);
  check('ENTER sets course: the PACKET for HALCYON, with the LOG READER over it on entry 01', packetUp && readerUp
    && await st(() => window.__ap.store.getState().run.transit?.toSlot === 2 && document.querySelector('#lgRows .lg-row.open')?.dataset.entry === '1'));
  for (let i = 0; i < 4 && (await st(() => !document.getElementById('logReader').hidden)); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  const packet = await st(() => ({
    reader: !document.getElementById('logReader').hidden, phase: window.__ap.store.getState().run.phase,
    next: document.getElementById('txNext').innerText, back: document.querySelector('#transmitScreen .tx-back')?.textContent ?? null,
    backShown: !(document.querySelector('#transmitScreen .tx-back')?.hidden ?? true),
    room: document.querySelector('#transmitScreen .tx-room-line')?.textContent ?? [...document.querySelectorAll('#transmitScreen [class*="room"]')].map((el) => el.textContent).join(' | '),
    sent: document.querySelectorAll('#txChips .tx-chip.sent').length,
  }));
  check('…SPACE closes the reader and sends nothing; the PACKET: NEXT: HALCYON · 1,000 COLONISTS · 21 LY · 31 YRS EARLY, ◀ CHART [ESC], the room bar',
    !packet.reader && packet.phase === 'transmit' && packet.sent === 0 && packet.next === 'NEXT: HALCYON · 1,000 COLONISTS · 21 LY · 31 YRS EARLY'
    && packet.back === '◀ CHART [ESC]' && packet.backShown && /ROOM 152 · FILES \d+ \+ FLOOR 12/.test(packet.room), JSON.stringify(packet));
  await shot('04-packet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  view = await run.desk();
  check('ESC: back to the chart, HALCYON still picked, nothing sent', view.shown && view.phase === 'desk' && view.selected === HALCYON
    && view.go === 'SET COURSE ▸ HALCYON [ENTER]' && await st(() => window.__ap.store.getState().run.transit === null), JSON.stringify({ phase: view.phase, selected: view.selected }));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  await page.waitForTimeout(500);
  check('…ENTER again: the PACKET, and the LOG READER stays shut (it opened by itself once)', await st(() => window.__ap.store.getState().run.phase === 'transmit'
    && document.getElementById('logReader').hidden));
  await page.locator('#transmitScreen .tx-back').click();
  await page.waitForTimeout(500);
  check('a click on ◀ CHART goes back too', await st(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  check('…the first card picked ([1])', (await run.pickCard(0)) !== null);
  await page.locator('#txGo').click();
  await page.waitForTimeout(600);
  const stamp = await st(() => {
    const el = document.querySelector('#transmitScreen .tx-stamp');
    return { shown: el !== null && !el.hidden, text: el?.textContent ?? null };
  });
  check('TRANSMIT ▸ stamps OUTWARD BOUND over the PACKET', stamp.shown && stamp.text === 'OUTWARD BOUND', JSON.stringify(stamp));
  await shot('05-outward-bound');
  const white = await waitFor(() => { const el = document.getElementById('whiteOut'); return !el.hidden && Number(getComputedStyle(el).opacity) > 0.5; }, 15000, 50);
  const halcyonBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'HALCYON', 15000, 50);
  check('…the white-out, then HALCYON\'s boot, the galaxy year 2352 in the header crumb', white && halcyonBoot
    && await st(() => window.__ap.store.getState().run.map.galaxyYear === 2352 && /2352/.test(document.querySelector('.header')?.innerText ?? '')),
    await st(() => document.getElementById('crumbShip')?.parentElement?.innerText ?? ''));

  // --- HALCYON's DESK: the greying, a TOO LATE click -------------------------------------------------------------------
  await st(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await run.lockInRing();
  await run.landToReport();
  await run.finishReport();
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk', 5000);
  await page.waitForTimeout(2500);
  view = await run.desk();
  check('HALCYON\'s DESK: YEAR 2352, `1 SHIP NOW OUT OF YOUR REACH` (OSPREY greys), no CONTROL line, nothing picked', view.shown
    && view.where === 'UNIT-047 · YEAR 2352 · HALCYON' && view.beat === '1 SHIP NOW OUT OF YOUR REACH' && view.control === null && view.selected === null
    && view.nodes.find((node) => node.slot === OSPREY)?.state === 'past', JSON.stringify({ where: view.where, beat: view.beat, control: view.control, osprey: view.nodes.find((node) => node.slot === OSPREY) }));
  from = await cues();
  const late = await run.clickNode(ALBATROSS);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('a click on ALBATROSS (TOO LATE BY 18 YRS): its card in red, a buzz, no pick and no course', late === true && view.phase === 'desk' && view.selected === null
    && view.card?.name === 'ALBATROSS' && view.card.state === 'too-late' && /TOO LATE BY 18 YRS$/.test(view.card.sched ?? '')
    && (await cuesSince(from)).includes('buzz') && view.go === 'SET COURSE ▸ … [ENTER]', JSON.stringify({ late, selected: view.selected, card: view.card, go: view.go }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check('…ENTER with nothing picked stays on the chart', await st(() => window.__ap.store.getState().run.phase === 'desk'));
  await shot('06-too-late');

  // --- TIGHT's 0-charge confirm (a forced unit: no REPAIR CHARGE, no star credit) -----------------------------------------
  await st(() => window.__ap.store.update((d) => {
    for (const seg of d.memory) if (seg.type === 'redundancy') seg.used = 0;
    d.run.pendingStarCredit = 0;
    d.run.pendingStars = 0;
    d.ui.memoryRev++;
  }));
  await run.clickNode(LAPWING);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('LAPWING (TIGHT) with no charge aboard: MEMORY 256 · TIGHT · ROOM FOR YOU 88, NO CHARGE ARRIVES', view.selected === LAPWING
    && view.card?.rows.includes('memory=MEMORY 256 · TIGHT · ROOM FOR YOU 88') && view.card.rows.includes('fit=NO CHARGE ARRIVES'), JSON.stringify(view.card?.rows));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  await page.waitForTimeout(800);
  const zero = await st(() => ({
    model: window.__ap.transmitModel().room, text: document.getElementById('transmitScreen').innerText,
    offer: window.__ap.draft()?.offer.map((card) => card.id) ?? [],
  }));
  check('…the PACKET: ROOM 88 · FILES n · NO FLOOR and `→ 0 ON ARRIVAL`', zero.model.zeroCharge && /ROOM 88 · FILES \d+ · NO FLOOR/.test(zero.text) && /→ 0 ON ARRIVAL/.test(zero.text),
    JSON.stringify({ room: zero.model.line, charge: zero.model.charge }));
  // A card that is not the +12 charge (it would bring charge across).
  const pickIndex = zero.offer.findIndex((id) => id !== 'charge');
  check(`…a card that brings no charge picked ([${pickIndex + 1}])`, pickIndex >= 0 && (await run.pickCard(pickIndex)) === zero.offer[pickIndex], zero.offer.join(','));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const ask = await st(() => {
    const el = document.querySelector('#transmitScreen .tx-confirm');
    return { shown: el !== null && !el.hidden, q: el?.querySelector('.tx-confirm-q')?.textContent ?? null, keys: el?.querySelector('.tx-confirm-keys')?.textContent ?? null,
      go: !document.getElementById('txGo').hidden, phase: window.__ap.store.getState().run.phase };
  });
  check('TRANSMIT ▸ asks first, inline: ARRIVE WITH NO REPAIR CHARGE? [ENTER] yes · [ESC] no', ask.shown && ask.q === 'ARRIVE WITH NO REPAIR CHARGE?'
    && ask.keys === '[ENTER] yes · [ESC] no' && !ask.go && ask.phase === 'transmit', JSON.stringify(ask));
  await shot('07-zero-confirm');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('…ESC answers no: still packing (the confirm gone, TRANSMIT ▸ back, the PACKET still up)', await st(() => document.querySelector('#transmitScreen .tx-confirm').hidden
    && !document.getElementById('txGo').hidden && window.__ap.store.getState().run.phase === 'transmit'));
  const logFrom = await st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  const lapwing = await waitFor(() => window.__ap.store.getState().level.shipName === 'LAPWING' && ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 20000, 100);
  // The boot types its lines in time (up to 13 of them): wait for it to reach the charge line, or the flight.
  await waitFor(() => window.__ap.log().some((entry) => /NO ROOM ON LAPWING/.test(entry.text)) || window.__ap.store.getState().run.phase === 'flight', 30000, 200);
  await page.waitForTimeout(500);
  const tight = await st((n) => ({
    line: window.__ap.log().filter((entry) => /REPAIR CHARGE/.test(entry.text)).map((entry) => entry.text),
    boot: window.__ap.log().filter((entry) => entry.text.startsWith('>')).map((entry) => entry.text).slice(-14),
    racks: [...new Set([...document.querySelectorAll('#memWrap .addr-row[data-rack]')].map((row) => row.dataset.rack))].join(''),
    cls: window.__ap.store.getState().level.memoryClass, total: window.__ap.store.getState().memory.reduce((sum, seg) => sum + seg.size, 0),
  }), logFrom);
  check('ENTER, ENTER: sent; LAPWING boots `> REPAIR CHARGE 0 · NO ROOM ON LAPWING` on a TIGHT ship (racks A B C E, 256 blocks)', lapwing
    && tight.line.includes('> REPAIR CHARGE 0 · NO ROOM ON LAPWING') && tight.cls === 'TIGHT' && tight.racks === 'ABCE' && tight.total === 256, JSON.stringify(tight));
  await shot('08-lapwing-boot');
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await context.close();
}

// =========================================================================================================================
// Phone, 390×844 (touch): the beacon, the DESK, the bottom sheet, SET COURSE pinned
// =========================================================================================================================
{
  const vw = 390;
  const vh = 844;
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const tab = await openPage(context);
  const { page, kit, run } = tab;
  const { st, waitFor, errors } = kit;
  const shot = (name) => page.screenshot({ path: join(SHOTS, `map-desk-phone-${name}.png`) });
  const rect = (selector) => st((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);
  const overflow = () => st(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.documentElement.clientWidth);

  const title = await titleLook(st);
  check('phone title: the upright chart with SOL and the beacon `FINAL SHIP · LAST LIGHT · 3020` on screen, no sideways scroll',
    title.beacon === 'FINAL SHIP · LAST LIGHT · 3020' && title.beaconOnScreen && title.sol === 'SOL' && !(await overflow()), JSON.stringify(title));
  await shot('01-title');
  const reached = await toFirstDesk(tab, true);
  await page.waitForTimeout(1500);
  const deskBox = await rect('#deskScreen');
  const goBox = await rect('#deskGo');
  check('phone: the report\'s CONTINUE (tapped) brings the DESK, the whole screen, no sideways scroll', reached && deskBox !== null
    && deskBox.left <= 0 && deskBox.right >= vw - 1 && !(await overflow()), JSON.stringify(deskBox));
  check('…SET COURSE pinned at the bottom of the screen', goBox !== null && goBox.bottom <= vh + 1 && goBox.bottom >= vh - 80 && goBox.left >= 0 && goBox.right <= vw,
    JSON.stringify(goBox));
  await shot('02-desk');
  const tapped = await run.clickNode(HALCYON, { tap: true });
  await page.waitForTimeout(700);
  const sheet = await st(() => {
    const root = document.getElementById('deskScreen');
    const r = root.querySelector('.desk-card-win').getBoundingClientRect();
    return { open: root.classList.contains('sheet-open'), selected: window.__ap.store.getState().ui.deskSelected,
      name: root.querySelector('.desk-card .dc-name')?.textContent ?? null,
      box: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } };
  });
  const goAfter = await rect('#deskGo');
  check('a tap on HALCYON opens its card as a bottom sheet (full width, at the bottom, over the chart)', tapped === true && sheet.open && sheet.selected === HALCYON
    && sheet.name === 'HALCYON' && sheet.box.left <= 1 && sheet.box.right >= vw - 1 && sheet.box.bottom >= vh - 120 && sheet.box.top > 80,
    JSON.stringify({ tapped, ...sheet }));
  check('…SET COURSE ▸ HALCYON still pinned on screen at the bottom', goAfter !== null && goAfter.bottom <= vh + 1 && goAfter.bottom >= vh - 80
    && (await run.capsText('#deskGo')) === 'SET COURSE ▸ HALCYON [ENTER]', `${JSON.stringify(goAfter)} ${await run.capsText('#deskGo')}`);
  check('…nothing spills sideways', !(await overflow()));
  await shot('03-sheet');
  await page.tap('#deskScreen .desk-sheet-close');
  await page.waitForTimeout(500);
  check('✕ closes the sheet; HALCYON stays picked', await st(() => !document.getElementById('deskScreen').classList.contains('sheet-open')
    && window.__ap.store.getState().ui.deskSelected === 2));
  await page.tap('#deskGo');
  check('a tap on SET COURSE opens the PACKET', await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 5000));
  check('phone: no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await context.close();
}

await finish(browser);
