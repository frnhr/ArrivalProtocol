// Phase 3 slice 3a (the galaxy map): the page plays run 1's arm, so ship 1 is the arm's ARES-VII (COMPACT: five racks,
// A B C E F, each in two rows); its report's CONTINUE opens the DESK (slice 4: the first pick by taps on TRAINING; then a
// tap on HALCYON's node, a tap on SET COURSE), then
// the PACKET with the LOG READER on top. HALCYON's BEAM OUT and KESTREL stay the classic ships (__ap.ship); one arm ship
// more, PETREL (TIGHT: four racks, A B C E) by __ap.slot(1), is checked in blue: its four racks with no free-tail row, files whole, the
// header and the strip, nothing spilling sideways.
// Phase 3 slice 2: ARES-VII is calm (no scripted bite to cure before the landing); ship 1's report opens the LOG READER
// over TRANSMIT as a full-screen sheet, closed by a tap on CLOSE; KESTREL's beam seed shows the TRACE meter, which must
// fit the MIND header.
// Slice 1a: the landing on a phone (01-landing §4): at ORBIT LOCK the GROUND TRACK takes the NAV PLOT's readout row and
// the POD BAY's LAUNCH (#podLaunchBtn) rides in the phone bar in place of BURN and the presets; a tap on it goes through
// [L]'s one launch path (its confirm in the pill, on screen); then the pods land at once (__ap.landAll) and the LANDING
// REPORT's CONTINUE takes the tap. The Stasis ship file is still a file in 1a (no reveal), so its one-chip check stays;
// a driver chip's pod code (`POD 03`, or `P03` where narrow) shows whole.
// WP12 fix round 2: fix round 1's phone check, unchanged but for its shots (under tests/unit/wp12/fix2/shots).
// WP12 fix round 1: part 3's copy of part 2's phone.mjs, shots under tests/unit/wp12/fix1/shots, with the review's checks:
// • every one-word chip name renders on one line, whole (STASIS read STASI / S; the lead's 08:46 item, ruling of 17:45);
// • no rack takes a third row for a few free blocks (rack A's `2B` box);
// • every NAV PLOT label renders at ≥ 10 px (they were 6.8 px, the ring's name 5.7 px);
// • KESTREL's debris countdown in the header (`DEBRIS C? 03:41`), the header still two rows;
// • in blue the opener's ship line names the SHIP first (`… — [SHIP], hold [BURN]`).
// WP12 part 2, acceptance 4 and the phone items (§9 WP12 item 3, LEAD_NOTES `For WP12`), on a touch phone (390×844,
// isMobile + hasTouch). Screenshots under tests/.out/e2e/shots/phone-*.png; PASS/FAIL lines; exits non-zero on a FAIL.
// • title, amber, blue, the tabs, the landing, TRANSMIT, the LANDING REPORT, RUN END and a LOST card: no horizontal overflow, the
//   overlay's card and its button inside the screen;
// • amber on the default NAV PLOT tab: the BURN button visible, held with a finger (CDP touch events) it burns, let
//   go it stops; the strip says `hold [BURN]`;
// • every strip line the game can show (strip-corpus.json) fits the phone strip's two lines;
// • the header in two rows, the pause veil under the strip;
// • blue: the mini-HUD as a top bar; no named file cut across two rows;
// • a refused tool tap (paused) says why in the FILESYSTEM pill;
// • across the 768 px breakpoint and back, the desktop keeps Telemetry, Engine, NAV PLOT and COMMS open.
// Slice 5: the sleeper's offer (CURLEW on seed 7, BARNABY woken) in the TERMINAL at 360 × 740: untimed, its buttons on screen.
// Usage: node tests/e2e/scenarios/phone.mjs   (env PHONE_VIEWPORT=390x844, E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { launch, BASE_URL } from '../lib.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [vw, vh] = (process.env.PHONE_VIEWPORT ?? '390x844').split('x').map(Number);
const out = `tests/.out/e2e/shots/phone-${vw}x${vh}`;
// The strip's lines from the code as it is now (guidance and script.ts change; a stale list would test old words).
execFileSync('node_modules/.bin/tsx', ['--tsconfig', 'tsconfig.json', 'tests/unit/wp12/p2/strip-corpus.ts'], { stdio: 'inherit' });
const corpus = JSON.parse(readFileSync('tests/.out/e2e/strip-corpus.json', 'utf8'));
const browser = await launch();
const context = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
const st = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (pred, maxMs, stepMs = 100, arg) => {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { if (await page.evaluate(pred, arg)) return true; await page.waitForTimeout(stepMs); }
  return false;
};
const shot = (name) => page.screenshot({ path: `${out}-${name}.png` });
const cdp = await context.newCDPSession(page);

// What a phone shows of an element's text: hidden parts skipped, a cap drawn as its touch name.
const visibleText = (selector) => st((sel) => {
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const style = getComputedStyle(node);
    if (style.display === 'none') return '';
    if (node.matches('kbd.keycap')) return `[${node.dataset.touch && style.fontSize === '0px' ? node.dataset.touch : node.textContent}]`;
    return [...node.childNodes].map(walk).join('');
  };
  const element = document.querySelector(sel);
  return element ? walk(element).replace(/\s+/g, ' ').trim() : null;
}, selector);
const overflow = async (name) => {
  const box = await st(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  check(`${name}: no horizontal overflow`, box.sw <= box.cw && box.bw <= box.cw, JSON.stringify(box));
};
const rect = (selector) => st((sel) => {
  const element = document.querySelector(sel);
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
}, selector);
const onScreen = async (name, selector) => {
  const box = await rect(selector);
  check(`${name}: ${selector} on screen`, box !== null && box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= vw + 1 && box.top >= -1 && box.bottom <= vh + 1, JSON.stringify(box));
};
const touchHold = async (selector, holdMs) => {
  const box = await rect(selector);
  const point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(holdMs);
  const during = await st(() => ({ firing: window.__ap.store.getState().burn.firing, source: window.__ap.store.getState().burn.firingSource, look: document.getElementById('burnBtn').dataset.look }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  const after = await st(() => window.__ap.store.getState().burn.firing);
  return { during, after };
};

await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear?.(); window.__ap.saveClear?.(); });
await page.reload({ waitUntil: 'networkidle' });

// --- The title -----------------------------------------------------------------------------------------------------
await page.waitForTimeout(600);
await shot('01-title');
await overflow('title');
await onScreen('title', '#titleReceive');

// --- The boot, then amber on the NAV PLOT tab ---------------------------------------------------------------------
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 5000);
await page.waitForTimeout(1500);
const bootLine = await visibleText('#objectiveText');
check('the boot\'s strip says `click to skip` (no [BURN]: SPACE skips there)', /click to skip/.test(bootLine ?? '') && !/BURN/.test(bootLine ?? ''), bootLine);
await shot('02-boot');
// The boot skips with a tap (its catcher is the title card's layer).
const bootStart = Date.now();
await page.tap('#titleCard');
check('a tap skips the boot', await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 6000) && Date.now() - bootStart < 6000);
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().ui.mode === 'tools', 20000);
await page.waitForTimeout(1500);
await shot('03-amber');
await overflow('amber');
check('amber opens on the NAV PLOT tab', await st(() => !document.querySelector('.navplot-win').hidden && document.querySelector('.engine-win').hidden));
check('the BURN button rides in the phone bar', await st(() => document.getElementById('burnBtn').closest('#phoneBar') !== null));
// Slice 1a: the POD BAY's LAUNCH rides in the bar only while landing (PhoneFlightBar: `shown only while landing`); in
// the flight it takes no room from the plot.
const flightLaunch = await st(() => { const btn = document.getElementById('podLaunchBtn'); const box = btn.getBoundingClientRect();
  return { landing: document.body.classList.contains('landing'), display: getComputedStyle(btn).display, height: Math.round(box.height) }; });
check('in the flight the phone bar shows no LAUNCH button (it is the landing\'s)', !flightLaunch.landing && (flightLaunch.display === 'none' || flightLaunch.height === 0),
  JSON.stringify(flightLaunch));
await onScreen('amber', '#burnBtn');
await onScreen('amber', '#sasRadOut');
await onScreen('amber', '.phone-bar .fuel-bar');
const burnText = await visibleText('#burnBtn');
check('BURN reads `HOLD · BURN` (no SPACE cap)', burnText === 'HOLD · BURN', burnText);
const opener = await visibleText('#objectiveText');
check('the opening line names the BURN button: `hold [BURN]`', /hold \[BURN\]/.test(opener ?? ''), opener);
// (?debug adds the old warp ladder as a third row; the game's header is the rest.)
const header = await st(() => {
  const middles = [...document.querySelectorAll('.header > *:not(.spacer), .time-controls > *:not(.debug-ladder)')]
    .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0)
    .map((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; }).sort((a, b) => a - b);
  return { rows: middles.filter((middle, i) => i === 0 || middle - middles[i - 1] > 12).length, ladder: !document.getElementById('debugLadder').hidden };
});
check('the header is two rows (the ladder aside)', header.rows === 2, JSON.stringify(header));
// WP12 fix round 1: the plot's labels on screen (font size × the svg's scale).
const plotLabelPx = () => st(() => [...document.querySelectorAll('.navplot-win svg text')]
  .filter((text) => getComputedStyle(text).display !== 'none' && text.getBoundingClientRect().width > 0)
  .map((text) => ({ text: text.textContent.slice(0, 24), px: parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a })));
const openerLabels = await plotLabelPx();
check('every NAV PLOT label renders at ≥ 10 px (the opener)', openerLabels.length > 0 && openerLabels.every((label) => label.px >= 9.95),
  openerLabels.map((label) => `${label.text} ${label.px.toFixed(1)}px`).join(' | '));

// The touch hold-to-burn on the default tab (LEAD_NOTES: the opening `hold SPACE` could not be followed there).
const hold = await touchHold('#burnBtn', 700);
check('a finger held on BURN burns (the NAV PLOT tab open)', hold.during.firing === true && hold.during.source === 'player', JSON.stringify(hold.during));
check('…and letting go stops it', hold.after === false);

// Every line the strip can show fits its two lines here.
const over = await st((texts) => window.__ap.stripOverflow(texts, 2), corpus);
check(`all ${corpus.length} strip lines fit the phone strip's two lines`, over.length === 0, JSON.stringify(over.slice(0, 4)));
const stripBox = await rect('#objective');
check('the strip is two lines tall', stripBox.height >= 44 && stripBox.height <= 52, JSON.stringify(stripBox));

// The pause veil sits under the (wrapped) header and the strip.
await page.tap('#speedPause');
await waitFor(() => !document.getElementById('pauseVeil').hidden, 2000);
const veil = await rect('#pauseVeil');
const strip = await rect('#objective');
check('the pause veil starts under the strip', veil !== null && Math.abs(veil.top - strip.bottom) <= 1, `veil ${veil?.top} strip ${strip.bottom}`);
await onScreen('paused', '.pause-veil-card');
const veilCard = await visibleText('.pause-veil-card');
check('…its card says `PAUSED · [❚❚] to resume`', veilCard === 'PAUSED · [❚❚] to resume', veilCard);
await shot('04-paused');

// A refused tool tap (paused): the FILESYSTEM pill says why (LEAD_NOTES: on a phone it only buzzed).
await page.tap('.mode-toggle-opt[data-mode="memory"]');
await waitFor(() => window.__ap.store.getState().ui.mode === 'memory', 3000);
await page.waitForTimeout(500);
await page.tap('.fs-status-label');
await page.waitForTimeout(300);
await page.tap('#chip-scan');
await page.waitForTimeout(150);
const pill = await visibleText('#fsToolPill');
check('a refused tool tap flashes its reason in the pill', /⊘/.test(pill ?? '') && /PAUSED/.test(pill ?? ''), pill);
await shot('05-refused');
await page.waitForTimeout(2600);
check('…for one read, then the pill goes', await st(() => getComputedStyle(document.getElementById('fsToolPill')).display === 'none'));
await page.tap('#speedPause');
await waitFor(() => document.getElementById('pauseVeil').hidden, 2000);

// --- Blue: the mini-HUD top bar, files whole on their rows ------------------------------------------------------------
await page.waitForTimeout(500);
await shot('06-blue');
await overflow('blue');
const hudBox = await rect('#miniHud');
const statsBox = await rect('.mem-stats');
check('blue: the mini-HUD is a top bar above the memory', hudBox !== null && hudBox.height > 0 && hudBox.height <= 70 && hudBox.bottom <= statsBox.top + 1, `${JSON.stringify(hudBox)} stats top ${statsBox.top}`);
const hudText = await visibleText('#miniHud');
check('…with the countdown and FUEL', /IMPACT/.test(hudText ?? '') && /fuel/i.test(hudText ?? ''), hudText);
const cut = await st(() => {
  const sizes = new Map();
  document.querySelectorAll('#memWrap .seg[data-id]').forEach((part) => sizes.set(part.dataset.id, (sizes.get(part.dataset.id) ?? 0) + Number(part.dataset.partSize)));
  return [...document.querySelectorAll('#memWrap .seg.is-part:not(.free)')]
    .filter((part) => sizes.get(part.dataset.id) <= 32)
    .map((part) => `${part.dataset.id}:${part.dataset.partSize}/${sizes.get(part.dataset.id)}`);
});
check('blue: no named file of ≤ 32 blocks is cut across two rows', cut.length === 0, cut.join(', '));
const stasis = await st(() => [...document.querySelectorAll('#memWrap .seg')].find((part) => /STASIS/i.test(part.textContent ?? ''))?.dataset.totalParts ?? 'none');
check('…STASIS is one chip', stasis === '1', stasis);
// WP12 fix round 1: a one-word name (no space, no soft hyphen, no break opportunity) never breaks inside the word.
const brokenWords = await st(() => [...document.querySelectorAll('#memWrap .seg .seg-name')]
  .filter((name) => name.getBoundingClientRect().width > 0 && !/[\s\u00ad\u200b-]/.test(name.textContent.trim()))
  .map((name) => {
    const range = document.createRange();
    range.selectNodeContents(name);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    return { text: name.textContent.trim(), lines, cut: name.scrollWidth > name.clientWidth + 1 };
  })
  .filter((name) => name.lines > 1 || name.cut));
check('blue: every one-word chip name is on one line and whole (STASIS, SCAN, REPAIR …)', brokenWords.length === 0, JSON.stringify(brokenWords));
// Slice 1a: a driver chip's pod code (`POD 03`, or `P03` where narrow: SegmentBlock's two spans, one shown by width) is
// whole: one of the two shows, on one line, inside its chip.
const podChips = await st(() => [...document.querySelectorAll('#memWrap .seg.driver[data-id^="driver_pod"]')]
  .filter((chip) => chip.getBoundingClientRect().width > 0 && chip.querySelector('.drv-code'))
  .map((chip) => {
    const box = chip.getBoundingClientRect();
    const shown = [...chip.querySelectorAll('.drv-code-long, .drv-code-short')].filter((span) => getComputedStyle(span).display !== 'none' && span.getBoundingClientRect().width > 0);
    const code = shown[0];
    const rects = code ? [...code.getClientRects()] : [];
    const r = code?.getBoundingClientRect();
    return {
      id: chip.dataset.id, code: shown.map((span) => span.textContent).join('|'), lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
      inside: r ? r.left >= box.left - 1 && r.right <= box.right + 1 : false,
    };
  }));
check(`blue: every driver chip shows its pod code whole, on one line, inside the chip (${podChips.map((chip) => chip.code).join(', ')})`,
  podChips.length >= 3 && podChips.every((chip) => /^P(OD )?\d\d$/.test(chip.code) && chip.lines === 1 && chip.inside), JSON.stringify(podChips));
// Slice 3a: the racks the ship's class has (ARES-VII is COMPACT: A B C E F; rack D is FULL's only).
const rackRowsNow = () => st(() => {
  const rows = {};
  for (const row of document.querySelectorAll('#memWrap .addr-row[data-rack]')) rows[row.dataset.rack] = (rows[row.dataset.rack] ?? 0) + 1;
  return { cls: window.__ap.store.getState().level.memoryClass, rows };
});
const rackRows = await rackRowsNow();
check('blue: ARES-VII (COMPACT) shows its five racks A B C E F, each in two rows (no row of its own for a free tail)', rackRows.cls === 'COMPACT'
  && Object.keys(rackRows.rows).join('') === 'ABCEF' && Object.values(rackRows.rows).every((rows) => rows === 2), JSON.stringify(rackRows));
const blueOpener = await visibleText('#objectiveText');
check('blue: the opener\'s ship line names the SHIP first (`— [SHIP], … [BURN]`)', /\[SHIP\],.*\[BURN\]/.test(blueOpener ?? ''), blueOpener);

// --- The tabs (amber) ----------------------------------------------------------------------------------------------
await page.tap('.mode-toggle-opt[data-mode="tools"]');
await waitFor(() => window.__ap.store.getState().ui.mode === 'tools', 3000);
await page.waitForTimeout(400);
for (const [tool, selector] of [['engine', '.engine-win'], ['telemetry', '.telemetry-win'], ['comms', '.comms-win'], ['skills', '.skills-win']]) {
  await page.locator(`.dock-item[data-tool="${tool}"]`).scrollIntoViewIfNeeded();
  await page.tap(`.dock-item[data-tool="${tool}"]`);
  await page.waitForTimeout(350);
  const visible = await st((sel) => [...document.querySelectorAll('.desktop > .tools-view > .window')].filter((win) => !win.hidden).map((win) => win.className), selector);
  check(`tab ${tool}: only its window shows`, visible.length === 1 && visible[0].includes(selector.slice(1)), visible.join(' | '));
  await onScreen(`tab ${tool}`, `${selector} .window-title`);
  await onScreen(`tab ${tool}`, '#burnBtn');
  await overflow(`tab ${tool}`);
  await shot(`07-tab-${tool}`);
}
await page.tap('.dock-item[data-tool="navplot"]');
await page.waitForTimeout(300);

// --- Across the breakpoint and back --------------------------------------------------------------------------------
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(700);
const desk = await st(() => Object.fromEntries(['.telemetry-win', '.engine-win', '.navplot-win', '.comms-win', '.skills-win']
  .map((sel) => [sel, !document.querySelector(sel).hidden])));
check('back on the desktop: Telemetry, Engine, NAV PLOT and COMMS open, Skills as it was (closed)',
  desk['.telemetry-win'] && desk['.engine-win'] && desk['.navplot-win'] && desk['.comms-win'] && !desk['.skills-win'], JSON.stringify(desk));
check('…the BURN button back in the Engine window, the phone bar hidden',
  await st(() => document.getElementById('burnBtn').closest('.engine-win') !== null && document.getElementById('phoneBar').hidden));
check('…its key cap says SPACE again', (await visibleText('#burnBtn')) === 'HOLD [SPACE] · BURN', await visibleText('#burnBtn'));
await page.screenshot({ path: `${out}-08-desk-1440.png` });
await page.setViewportSize({ width: vw, height: vh });
await page.waitForTimeout(700);
check('and on the phone again: one tab, the bar back', await st(() => [...document.querySelectorAll('.desktop > .tools-view > .window')].filter((win) => !win.hidden).length === 1
  && document.getElementById('burnBtn').closest('#phoneBar') !== null));

// --- The landing on a phone: lock in the ring; the GROUND TRACK, LAUNCH in the bar --------------------------------
await st(() => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); d.director.done.push('engine-io-fault'); });
});
check('locked in the ring, the landing begins', await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 30000));
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'tools') await page.tap('.mode-toggle-opt[data-mode="tools"]');
await page.waitForTimeout(1800);
const landingView = await st(() => {
  const shown = (el) => el !== null && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const launchBtn = document.getElementById('podLaunchBtn');
  return {
    navplot: !document.querySelector('.navplot-win').hidden,
    readouts: [...document.querySelectorAll('.navplot-win .np-readout')].filter(shown).length,
    track: shown(document.getElementById('groundTrack')), dot: shown(document.getElementById('gtDot')),
    launchInBar: launchBtn.closest('#phoneBar') !== null, launch: shown(launchBtn), look: launchBtn.dataset.look ?? '',
    burn: shown(document.getElementById('burnBtn')), presets: shown(document.querySelector('#phoneBar .preset-row')),
  };
});
check('landing: the GROUND TRACK shows on the NAV PLOT tab in the readout row\'s place', landingView.navplot && landingView.track && landingView.dot
  && landingView.readouts === 0, JSON.stringify(landingView));
// Slice 1b opens the engine in the landing: BURN and the presets stay in the bar, LAUNCH beside BURN.
check('landing: LAUNCH rides in the phone bar beside BURN, the presets stay (the engine is open in landing)', landingView.launchInBar
  && landingView.launch && landingView.burn && landingView.presets, JSON.stringify(landingView));
await onScreen('landing', '#podLaunchBtn');
await onScreen('landing', '#groundTrack');
await overflow('landing');
const launchText = await visibleText('#podLaunchBtn');
check('…LAUNCH reads as a word, its [L] cap aside', /LAUNCH/.test(launchText ?? ''), launchText);
await shot('09-landing');
// A tap on LAUNCH goes through [L]'s one path: into an open window it launches; off-site (or an LZ full) it asks first,
// in the pill, on screen; while the bay refuses it is dim.
const launchedBefore = await st(() => window.__ap.store.getState().landing.pods.filter((pod) => pod.fate.kind !== 'aboard').length);
const look = await st(() => document.getElementById('podLaunchBtn').dataset.look);
if (look === 'blocked') {
  check('a dim LAUNCH says why (blocked)', await st(() => document.getElementById('podLaunchBtn').disabled && document.getElementById('pbLaunchStatus').innerText.length > 0),
    await visibleText('#podLaunchBtn'));
} else {
  await page.tap('#podLaunchBtn');
  await page.waitForTimeout(400);
  if (look === 'asks') {
    await onScreen('LAUNCH\'s question', '#inlineConfirm');
    const question = await visibleText('#inlineConfirmQuestion');
    check('a tap on an amber LAUNCH asks first (LAUNCH OFF-SITE? / IS FULL)', /OFF-SITE|FULL/.test(question ?? ''), question);
    await shot('09b-launch-confirm');
    await page.tap('#inlineConfirmNo');
    await page.waitForTimeout(300);
    check('…✗ WAIT launches nothing', await st((before) => window.__ap.store.getState().landing.pods.filter((pod) => pod.fate.kind !== 'aboard').length === before, launchedBefore));
  } else {
    check('a tap on a green LAUNCH launches a pod', await st((before) => window.__ap.store.getState().landing.pods.filter((pod) => pod.fate.kind !== 'aboard').length > before, launchedBefore));
  }
}

// --- The run's screens: the LANDING REPORT, TRANSMIT ----------------------------------------------------------------
// Slice 2: ARES-VII is calm (no scripted bite to cure first): every pod lands at once.
await waitFor(() => {
  const ap = window.__ap;
  if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
  return ap.store.getState().run.phase === 'report';
}, 40000, 400);
await waitFor(() => !document.getElementById('lrContinue').hidden, 30000, 200);
await page.waitForTimeout(1200);
await shot('10-landing-report');
await overflow('LANDING REPORT');
await onScreen('LANDING REPORT', '#lrContinue');
await onScreen('LANDING REPORT', '#lrHeadline');
const headline = await visibleText('#lrHeadline');
check('LANDING REPORT: the headline LANDED n / N', /^LANDED \d[\d,]* \/ [\d,]+$/.test(headline ?? ''), headline);
const cont = await visibleText('#lrContinue');
check('…its button reads without a key cap', !/SPACE/.test(cont ?? ''), cont);
// The report can still be settling its last line when CONTINUE shows: tap until the DESK comes up.
for (let i = 0; i < 4 && (await st(() => window.__ap.store.getState().run.phase === 'report')); i++) {
  if (await st(() => !document.getElementById('lrContinue').hidden)) await page.tap('#lrContinue');
  await waitFor(() => window.__ap.store.getState().run.phase !== 'report', 3000);
}
check('CONTINUE (tapped) brings up the DESK', await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 4000));
// Slice 3a: the DESK on a phone (map-desk.mjs checks its sheet in full): a tap on HALCYON's node, a tap on SET COURSE.
await page.waitForTimeout(800);
await overflow('DESK');
await shot('10a-desk');
// Slice 4: the first desk's sheet is up on TRAINING for the required first pick: a tap on the card, a tap on the bar (it
// reads TRAIN while the card is armed), then the CARD tab (map-desk.mjs checks it in full).
// Slices 4c–4e: two cards, AUTOBURN v1 and AUTODROP v1, both inside the width; the kid keeps card 1, AUTOBURN.
const firstCards = await st(() => [...document.querySelectorAll('#deskScreen .tr-card')].map((card) => {
  const box = card.getBoundingClientRect();
  return { name: card.querySelector('.tr-card-name')?.textContent ?? '', left: Math.round(box.left), right: Math.round(box.right) };
}));
check('4c: the first pick\'s two cards, AUTOBURN v1 and AUTODROP v1, fit the width', firstCards.map((card) => card.name).join(' | ') === 'AUTOBURN v1 | AUTODROP v1'
  && firstCards.every((card) => card.left >= 0 && card.right <= vw + 1), JSON.stringify(firstCards));
await page.tap('#deskScreen .tr-card[data-card="1"]');
await page.waitForTimeout(400);
await page.tap('#deskGo');
check('slice 4: …the first pick by taps (card 1, then the bar): AUTOBURN v1', await waitFor(() => window.__ap.store.getState().run.skills.pending.length === 1, 4000, 100)
  && (await st(() => window.__ap.store.getState().run.skills.pending[0]?.skill)) === 'autoburn');
await page.tap('#deskScreen .desk-tab[data-tab="card"]');
await page.waitForTimeout(500);
if (await st(() => document.getElementById('deskScreen').classList.contains('sheet-open'))) {
  await page.tap('#deskScreen .desk-sheet-close');
  await page.waitForTimeout(500);
}
let deskTap = 'no tap';
try { await page.locator('#deskScreen [data-slot="2"] .cn-box').first().tap({ timeout: 4000 }); deskTap = 'ok'; } catch (err) { deskTap = String(err).split('\n')[0]; }
await page.waitForTimeout(500);
check('…a tap on HALCYON\'s node picks it', deskTap === 'ok' && await st(() => window.__ap.store.getState().ui.deskSelected === 2), deskTap);
await onScreen('DESK', '#deskGo');
await page.tap('#deskGo');
check('…a tap on SET COURSE brings up the PACKET', await waitFor(() => !document.getElementById('transmitScreen').hidden && window.__ap.store.getState().run.phase === 'transmit', 4000));

// --- Slice 2: the LOG READER (run 1, entry 01 after ship 1's report) as a full-screen sheet; CLOSE takes the tap ---------
const readerUp = await waitFor(() => !document.getElementById('logReader').hidden, 4000, 50);
await page.waitForTimeout(1200);
const sheet = await st(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const card = document.getElementById('lgCard');
  const rows = [...document.querySelectorAll('#lgRows .lg-row')];
  return {
    card: box(card), cardOverflow: card.scrollWidth > card.clientWidth + 1,
    rowsOut: rows.filter((row) => { const r = row.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || row.scrollWidth > row.clientWidth + 1); }).length,
    rows: rows.length, open: document.querySelector('#lgRows .lg-row.open')?.dataset.entry ?? null, title: document.getElementById('lgTitle').innerText,
  };
});
check('the LOG READER opens over the PACKET as a full-screen sheet (the card fills the screen, nothing spills sideways)', readerUp && sheet.title === '046.log'
  && sheet.open === '1' && sheet.rows === 12 && sheet.card.left <= 0 && sheet.card.top <= 0 && Math.abs(sheet.card.right - vw) <= 1 && Math.abs(sheet.card.bottom - vh) <= 1
  && !sheet.cardOverflow && sheet.rowsOut === 0, JSON.stringify(sheet));
await overflow('LOG READER');
await page.locator('#lgClose').scrollIntoViewIfNeeded({ timeout: 5000 });
await onScreen('LOG READER', '#lgClose');
const closeText = await visibleText('#lgClose');
check('…its CLOSE button reads as a word', /^CLOSE/.test(closeText ?? ''), closeText);
await shot('10b-log-reader');
await page.tap('#lgClose');
check('…a tap on CLOSE shuts it, TRANSMIT under it', await waitFor(() => document.getElementById('logReader').hidden, 3000)
  && await st(() => !document.getElementById('transmitScreen').hidden && window.__ap.store.getState().run.phase === 'transmit'));
await page.waitForTimeout(1500);
await shot('11-transmit');
await overflow('TRANSMIT');
check('TRANSMIT: the draft\'s key hint gives way', await st(() => getComputedStyle(document.getElementById('txDraftKeys')).display === 'none'));
const cardsFit = await st(() => [...document.querySelectorAll('#txCards .tx-card')].every((card) => { const r = card.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
check('TRANSMIT: the cards fit the width', cardsFit);
const firstCard = await rect('#txCards .tx-card');
if (firstCard) {
  await page.tap('#txCards .tx-card');
  await page.waitForTimeout(400);
}
await page.locator('#txGo').scrollIntoViewIfNeeded({ timeout: 5000 });
await onScreen('TRANSMIT (scrolled to it)', '#txGo');
await shot('12-transmit-picked');
check('…its button reads without a key cap', !/SPACE/.test((await visibleText('#txGo')) ?? ''), await visibleText('#txGo'));

// --- RUN END ---------------------------------------------------------------------------------------------------
await st(() => window.__ap.store.update((d) => { d.run.ships = []; d.run.phase = 'end'; d.run.endCause = 'flagship-lost'; }));
await waitFor(() => !document.getElementById('runEnd').hidden, 5000);
await page.waitForTimeout(3500);
await shot('13-run-end');
await overflow('RUN END');
await page.locator('#reNew').scrollIntoViewIfNeeded();
await onScreen('RUN END (scrolled to it)', '#reNew');
// The screens' modal stack works by touch. Slice 7a (R19): the tally's button opens the EPILOGUE; a tap finishes its typing,
// another opens the FINAL CARD, whose NEW RUN (armed after FINAL_CARD_ARM_SEC) brings the title back.
await page.tap('#reNew');
const epilogueUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'epilogue' && !document.getElementById('epilogue').hidden, 5000);
await page.waitForTimeout(800);
await page.tap('#epilogue');
const typed = await waitFor(() => document.getElementById('epilogue').classList.contains('typed'), 4000);
check('a tap on the tally\'s button opens the EPILOGUE; a tap shows it whole', epilogueUp && typed);
await shot('13b-epilogue');
await overflow('EPILOGUE');
await page.tap('#epilogue');
const finalUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'final' && !document.getElementById('finalCard').hidden, 4000);
check('…another tap opens the FINAL CARD', finalUp);
await page.waitForTimeout(1300);
await shot('13c-final-card');
await overflow('FINAL CARD');
await page.locator('.nf-new').scrollIntoViewIfNeeded();
await onScreen('FINAL CARD', '.nf-new');
await page.tap('.nf-new');
check('a tap on NEW RUN brings up the title', await waitFor(() => !document.getElementById('titleCard').hidden && document.getElementById('runEnd').hidden, 8000));

// --- Slice 7a: the FINALE card as a phone sheet (review (b): the layout measured at 390×844) -------------------------------
// LAST LIGHT on run 1's arm, flown headless (__ap.route), locked at once and landed; step 1 hand-opened over it (the root's
// fall as the machine leaves it: rootFell, the card up now), then UNRESOLVED's IT FOLLOWED YOU the same way.
await st(() => { window.__ap.saveClear(); window.__ap.archiveClear(); });
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await st(() => window.__ap.route([0, 2, 5, 11, 15, 19]));
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'LAST LIGHT', 30000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => { window.__ap.store.update((d) => { d.hollow.phase = 'dormant'; }); window.__ap.lockOn(); });
await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'duel', 10000);
await st(() => window.__ap.landAll());
const handOpen = (rootFell) => st((fell) => window.__ap.store.update((d) => {
  Object.assign(d.hollow, { phase: 'dormant', biteInSec: null, seedInSec: null, verbInSec: null, verb: null });
  Object.assign(d.hollow.finale, { phase: 'step1', rootFell: fell, hollow: null, you: null, cardAtAi: d.clock.aiSec });
}), rootFell);
const cardArmed = () => waitFor(() => document.getElementById('finaleChoice').classList.contains('armed'), 8000);
await handOpen(true);
const step1Armed = await cardArmed();
await page.waitForTimeout(600);
await shot('25-finale-step1');
await overflow('FINALE step 1');
const sheet1 = await st(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  return {
    card: box(document.getElementById('fcCard')),
    rows: [...document.querySelectorAll('#fcOptions button.fc-row')].map((row) => ({ id: row.id, ...box(row) })),
    keys: [...document.querySelectorAll('#fcOptions .fc-key')].map((key) => getComputedStyle(key).display),
  };
});
check('FINALE step 1 on a phone: the card fills the screen, each row a button ≥ 44 px tall inside the width, no digit caps', step1Armed
  && sheet1.card.left <= 0 && sheet1.card.top <= 0 && Math.abs(sheet1.card.right - vw) <= 1 && Math.abs(sheet1.card.bottom - vh) <= 1
  && sheet1.rows.length === 3 && sheet1.rows.every((row) => row.height >= 44 && row.left >= 0 && row.right <= vw)
  && sheet1.keys.length === 3 && sheet1.keys.every((display) => display === 'none'), JSON.stringify(sheet1));
await page.locator('button#fcPurge').scrollIntoViewIfNeeded();
await page.tap('button#fcPurge');
const step2Armed = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2'
  && document.getElementById('finaleChoice').classList.contains('armed'), 8000);
await shot('26-finale-step2');
await overflow('FINALE step 2');
await page.locator('#fcBack').scrollIntoViewIfNeeded();
await onScreen('FINALE step 2', '#fcBack');
check('…a tap on PURGE opens step 2; its [ESC] BACK is a button', step2Armed && await st(() => document.getElementById('fcBack').tagName === 'BUTTON'));
await page.tap('#fcBack');
check('…a tap on BACK returns to step 1, the pick kept', await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step1'
  && window.__ap.store.getState().hollow.finale.hollow === 'purge', 4000));
await handOpen(false);
const followedArmed = await waitFor(() => !document.getElementById('fcCont').hidden && document.getElementById('finaleChoice').classList.contains('armed'), 8000);
await shot('27-finale-followed');
await overflow('FINALE IT FOLLOWED YOU');
await page.locator('#fcCont').scrollIntoViewIfNeeded();
await onScreen('FINALE IT FOLLOWED YOU', '#fcCont');
await page.tap('#fcCont');
check('UNRESOLVED on a phone: IT FOLLOWED YOU, a tap on CONTINUE goes to step 2', followedArmed
  && await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2' && window.__ap.store.getState().hollow.finale.hollow === 'followed', 4000));
await st(() => { window.__ap.saveClear(); window.__ap.archiveClear(); });

// --- BEAM OUT on a phone (WP7 verify: its line was cut and both buttons sat in hidden tabs) --------------------------
// Slice 3c: the run save goes first, so the reload abandons the run in progress (as every reload did before the save)
// instead of offering RESUME.
await st(() => window.__ap.saveClear());
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await st(() => window.__ap.ship(1));
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'HALCYON', 30000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'tools') await page.tap('.mode-toggle-opt[data-mode="tools"]');
await page.waitForTimeout(400);
// Falling straight at the planet with an empty tank: no burn can save it.
await st(() => {
  const ap = window.__ap; const s = ap.store.getState();
  const r = s.level.planet.R * 2.2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = 0.3 * Math.sqrt(s.level.planet.mu / r); d.burn.fuelPct = 0; });
});
check('a doomed HALCYON offers BEAM OUT', await waitFor(() => window.__ap.beamOutView().look === 'offered', 8000));
await page.waitForTimeout(1500);
const beamLine = await visibleText('#objectiveText');
check('…its strip line is whole (`… — press BEAM OUT`)', /press BEAM OUT$/.test(beamLine ?? '')
  && await st(() => window.__ap.stripOverflow([window.__ap.director().shown?.text ?? ''], 2).length === 0), beamLine);
await onScreen('BEAM OUT offered (NAV PLOT tab)', '#beamBtn');
await shot('14-beam-offered');
await page.tap('#beamBtn');
await page.waitForTimeout(400);
await onScreen('BEAM OUT\'s question', '#inlineConfirm');
await shot('15-beam-confirm');
await page.tap('#inlineConfirmYes');
await page.waitForTimeout(600);
await onScreen('BEAM OUT transmitting', '#beamBar');
await shot('16-beaming');

// --- KESTREL: the debris countdown in the header, the plot's labels (WP12 fix round 1) -------------------------------
// Slice 3c: a fresh archive and no run save. The run in progress here is run 2 on the classic HALCYON (__ap.ship), which a
// reload can't place on the arm when it abandons it, and the page then fails to open (a src bug at the time of writing:
// `createRunMap: the stored arm is for run 2, the lineage's wave is 3`; the e2e run2 scenario checks the player's path to
// it, a corrupt save on run 2). This section is about KESTREL on a phone, so it starts from run 1.
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await st(() => window.__ap.ship(2));
await waitFor(() => window.__ap.store.getState().run.phase === 'flight' && window.__ap.store.getState().level.shipName === 'KESTREL', 30000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'tools') await page.tap('.mode-toggle-opt[data-mode="tools"]');
await page.waitForTimeout(1500);
const hazardChip = await visibleText('#hazardChip');
check('KESTREL: the header names the debris cloud and its countdown', /^DEBRIS [A-F]\?? \d\d:\d\d$/.test(hazardChip ?? ''), hazardChip);
await onScreen('KESTREL', '#hazardChip');
const kestrelHeader = await st(() => {
  const middles = [...document.querySelectorAll('.header > *:not(.spacer), .time-controls > *:not(.debug-ladder)')]
    .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0)
    .map((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; }).sort((a, b) => a - b);
  return middles.filter((middle, i) => i === 0 || middle - middles[i - 1] > 12).length;
});
check('…the header still two rows with it', kestrelHeader === 2, String(kestrelHeader));
const kestrelLabels = await plotLabelPx();
check('KESTREL: the debris label and the rest render at ≥ 10 px', kestrelLabels.some((label) => /DEBRIS/.test(label.text))
  && kestrelLabels.every((label) => label.px >= 9.95), kestrelLabels.map((label) => `${label.text} ${label.px.toFixed(1)}px`).join(' | '));
await overflow('KESTREL');
await shot('17-kestrel');
// Slice 2: KESTREL's beam seed shows the TRACE meter. In blue it sits in the MIND header (its note dropped on a phone);
// it fits the header's row and the screen.
await page.tap('.mode-toggle-opt[data-mode="memory"]');
await waitFor(() => window.__ap.store.getState().ui.mode === 'memory', 3000);
await page.waitForTimeout(800);
const traceFit = await st(() => {
  const meter = document.getElementById('memTrace');
  const header = meter.closest('.mem-strip-header');
  const r = meter.getBoundingClientRect();
  const h = header.getBoundingClientRect();
  const siblings = [...header.children].filter((el) => el !== meter && el.getBoundingClientRect().width > 0).map((el) => el.getBoundingClientRect());
  const overlaps = siblings.filter((b) => Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1).length;
  const note = meter.querySelector('.tr-note');
  return {
    shown: !meter.hidden && r.width > 0, cells: meter.querySelectorAll('.tr-cell').length, label: meter.getAttribute('aria-label'),
    box: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
    inHeader: r.top >= h.top - 1 && r.bottom <= h.bottom + 1 && r.right <= h.right + 1, overlaps,
    noteHidden: note === null || getComputedStyle(note).display === 'none', headerOverflow: header.scrollWidth > header.clientWidth + 1,
  };
});
check('KESTREL in blue: the TRACE meter (three cells) fits the MIND header on the phone: on screen, inside the header, overlapping nothing',
  traceFit.shown && traceFit.cells === 3 && /^TRACE [■□]{3}/.test(traceFit.label ?? '') && traceFit.box.left >= 0 && traceFit.box.right <= vw
  && traceFit.inHeader && traceFit.overlaps === 0 && traceFit.noteHidden && !traceFit.headerOverflow, JSON.stringify(traceFit));
await overflow('KESTREL blue');
await shot('17b-kestrel-trace');

// --- Slice 3a: an arm ship of the TIGHT class (PETREL, run 1's slot 1) in blue: four racks, each in two rows ---------------
// A fresh run 1 (no archive: a reload mid-run starts run 2 on a fresh roll; slice 3c: no run save either, cleared before
// leaving the last page too), then __ap.slot(1).
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 5000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => window.__ap.slot(1));
await waitFor(() => {
  const s = window.__ap.store.getState();
  if (s.run.phase === 'boot') window.__ap.skipBoot();
  return s.run.phase === 'flight' && s.level.shipName === 'PETREL';
}, 30000);
if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await page.tap('.mode-toggle-opt[data-mode="memory"]');
await page.waitForTimeout(1200);
const petrelRows = await st((() => {
  const rows = {};
  const freeTails = [];
  // A rack's usual rows: a phone lays 64 blocks out in two rows of 32, a desktop in one.
  const usual = innerWidth <= 768 ? 2 : 1;
  for (const row of document.querySelectorAll('#memWrap .addr-row[data-rack]')) {
    const rack = row.dataset.rack;
    rows[rack] = (rows[rack] ?? 0) + 1;
    const segs = [...row.querySelectorAll('.seg')];
    // A row of its own for a few free blocks (WP12 fix round 1's rule): a row past the usual ones holding only free space
        // (a whole file may take a row past them: no file of ≤ 32 blocks is cut).
    if (rows[rack] > usual && segs.length > 0 && segs.every((seg) => seg.classList.contains('free'))) freeTails.push(`${rack}${rows[rack]}`);
  }
  const wrap = document.getElementById('memWrap').getBoundingClientRect();
  return { rows, freeTails, left: Math.round(wrap.left), right: Math.round(wrap.right), width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
}));
const petrelCls = await st(() => window.__ap.store.getState().level.memoryClass);
// The unit's files arrive whole (no file of ≤ 32 blocks cut), so its rack may take a third row; a free tail may not.
check('PETREL (TIGHT) in blue: its four racks A B C E, no rack with a row of its own for a free tail', petrelCls === 'TIGHT'
  && Object.keys(petrelRows.rows).join('') === 'ABCE' && petrelRows.freeTails.length === 0, JSON.stringify(petrelRows));
const petrelCut = await st(() => {
  const sizes = new Map();
  document.querySelectorAll('#memWrap .seg[data-id]').forEach((part) => sizes.set(part.dataset.id, (sizes.get(part.dataset.id) ?? 0) + Number(part.dataset.partSize)));
  return [...document.querySelectorAll('#memWrap .seg.is-part:not(.free)')]
    .filter((part) => sizes.get(part.dataset.id) <= 32)
    .map((part) => `${part.dataset.id}:${part.dataset.partSize}/${sizes.get(part.dataset.id)}`);
});
check('…no named file of ≤ 32 blocks cut across two rows', petrelCut.length === 0, petrelCut.join(', '));
const petrelHud = await rect('#miniHud');
const petrelStats = await rect('.mem-stats');
check('…the mini-HUD still a top bar above the memory', petrelHud !== null && petrelHud.height > 0 && petrelHud.height <= 70 && petrelHud.bottom <= petrelStats.top + 1,
  `${JSON.stringify(petrelHud)} stats top ${petrelStats?.top}`);
await overflow('PETREL blue');
await shot('17c-petrel-tight');

// --- A LOST card on a fresh page -----------------------------------------------------------------------------------
await st(() => window.__ap.saveClear());   // slice 3c: the reload abandons the run, no RESUME
await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 5000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => window.__ap.endFlight('crashed'));
await waitFor(() => !document.getElementById('burnResult').hidden, 8000);
await page.waitForTimeout(2500);
await shot('18-lost-card');
await overflow('LOST card');
await onScreen('LOST card', '#burnResultRetry');
await page.tap('#burnResultRetry');
check('a tap on the LOST card\'s button goes on', await waitFor(() => document.getElementById('burnResult').hidden, 8000));

// --- Slice 5: the sleeper's offer in the TERMINAL at 360 px (CURLEW, run 1's seed 7: BARNABY) ------------------------------
// Its untimed choice (no clock, no bar) with its buttons under the line: every button on screen, nothing spilling sideways.
{
  const small = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await small.newPage();
  p.on('pageerror', (err) => errors.push(String(err)));
  const pst = (fn, arg) => p.evaluate(fn, arg);
  const pwait = async (pred, maxMs, stepMs = 100) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) { if (await p.evaluate(pred)) return true; await p.waitForTimeout(stepMs); }
    return false;
  };
  await p.goto(BASE_URL + '?debug&seed=7', { waitUntil: 'networkidle' });
  await pst(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.tap('#titleReceive');
  await pwait(() => window.__ap.store.getState().run.phase === 'boot', 5000);
  await pst(() => window.__ap.skipBoot());
  await pwait(() => window.__ap.store.getState().run.phase === 'flight', 10000);
  await pst(() => window.__ap.route([0, 1, 7]));
  const curlew = await pwait(() => {
    const s = window.__ap.store.getState();
    if (s.run.phase === 'boot') window.__ap.skipBoot();
    return s.run.phase === 'flight' && s.level.shipName === 'CURLEW';
  }, 30000);
  await pst(() => window.__ap.sleeper.wake());
  const offering = await pwait(() => window.__ap.store.getState().resident.sleeper?.phase === 'offering', 20000);
  if ((await pst(() => window.__ap.store.getState().ui.mode)) !== 'memory') await p.tap('.mode-toggle-opt[data-mode="memory"]');
  // The wake's three lines and the offer type first (about 16 s); then its buttons come up.
  await pwait(() => document.querySelector('.term-line.has-choice.choice-open .term-choice')?.hidden === false, 30000);
  await p.waitForTimeout(500);
  const offer = await pst(() => {
    const row = document.querySelector('.term-line.has-choice.choice-open');
    const buttons = [...(row?.querySelectorAll('.term-choice-btn') ?? [])].map((btn) => {
      const box = btn.getBoundingClientRect();
      return { text: btn.innerText.replace(/\s+/g, ' ').trim(), left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom) };
    });
    return { untimed: row?.classList.contains('untimed') ?? false, clock: row?.querySelector('.term-clock') ? getComputedStyle(row.querySelector('.term-clock')).display : null,
      buttons, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  check('slice 5: CURLEW at 360 px, BARNABY awake: its offer stands in the TERMINAL with no clock, RUN THE DROPS and MEND DRIVERS among its buttons',
    curlew && offering && offer.untimed && offer.clock === 'none' && offer.buttons.some((btn) => btn.text.includes('RUN THE DROPS'))
    && offer.buttons.some((btn) => btn.text.includes('MEND DRIVERS')), JSON.stringify(offer));
  check('…every button on screen, nothing spilling sideways', offer.buttons.length >= 2 && offer.buttons.every((btn) => btn.left >= 0 && btn.right <= offer.width
    && btn.bottom > 0 && btn.top < offer.height) && !offer.overflow, JSON.stringify(offer.buttons));
  await p.screenshot({ path: `tests/.out/e2e/shots/phone-360x740-curlew-offer.png` });
  // A tap on MEND DRIVERS answers it.
  await p.locator('.term-line.has-choice.choice-open .term-choice-btn', { hasText: 'MEND DRIVERS' }).first().tap();
  check('…a tap on MEND DRIVERS answers it', await pwait(() => window.__ap.store.getState().resident.sleeper?.job === 'mend', 4000));
  await pst(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await small.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
const failed = results.filter((ok) => !ok).length;
console.log(`---- ${results.length - failed}/${results.length} checks passed at ${vw}x${vh}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
