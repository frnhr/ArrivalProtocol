// WP12 fix round 2: fix round 1's phone check, unchanged but for its shots (under tests/wp12/fix2/shots).
// WP12 fix round 1: part 3's copy of part 2's phone.mjs, shots under tests/wp12/fix1/shots, with the review's checks:
// • every one-word chip name renders on one line, whole (STASIS read STASI / S; the lead's 08:46 item, ruling of 17:45);
// • no rack takes a third row for a few free blocks (rack A's `2B` box);
// • every NAV PLOT label renders at ≥ 10 px (they were 6.8 px, the ring's name 5.7 px);
// • KESTREL's debris countdown in the header (`DEBRIS C? 03:41`), the header still two rows;
// • in blue the opener's ship line names the SHIP first (`… — [SHIP], hold [BURN]`).
// WP12 part 2, acceptance 4 and the phone items (§9 WP12 item 3, LEAD_NOTES `For WP12`), on a touch phone (390×844,
// isMobile + hasTouch). Screenshots under tests/.out/shots/phone-*.png; PASS/FAIL lines; exits non-zero on a FAIL.
// • title, amber, blue, the tabs, TRANSMIT, the WAKE REPORT, RUN END and a LOST card: no horizontal overflow, the
//   overlay's card and its button inside the screen;
// • amber on the default NAV PLOT tab: the BURN button visible, held with a finger (CDP touch events) it burns, let
//   go it stops; the strip says `hold [BURN]`;
// • every strip line the game can show (strip-corpus.json) fits the phone strip's two lines;
// • the header in two rows, the pause veil under the strip;
// • blue: the mini-HUD as a top bar; no named file cut across two rows;
// • a refused tool tap (paused) says why in the FILESYSTEM pill;
// • across the 768 px breakpoint and back, the desktop keeps Telemetry, Engine, NAV PLOT and COMMS open.
// Usage: node tests/wp12/p2/phone.mjs   (env PHONE_VIEWPORT=390x844, SEED)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [vw, vh] = (process.env.PHONE_VIEWPORT ?? '390x844').split('x').map(Number);
const out = `tests/.out/shots/phone-${vw}x${vh}`;
// The strip's lines from the code as it is now (guidance and script.ts change; a stale list would test old words).
execFileSync('node_modules/.bin/tsx', ['--tsconfig', 'tsconfig.json', 'tests/wp12/p2/strip-corpus.ts'], { stdio: 'inherit' });
const corpus = JSON.parse(readFileSync(new URL('../wp12/p2/strip-corpus.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
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

await page.goto((process.env.TEST_BASE_URL ?? 'http://localhost:5173/') + '?debug&seed=4', { waitUntil: 'networkidle' });
await st(() => window.__ap.archiveClear?.());
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
const rackRows = await st(() => Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F']
  .map((rack) => [rack, document.querySelectorAll(`#memWrap .addr-row[data-rack="${rack}"]`).length])));
check('blue: every rack in two rows (no row of its own for a free tail)', Object.values(rackRows).every((rows) => rows === 2), JSON.stringify(rackRows));
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

// --- The run's screens: lock in the ring, the WAKE REPORT, TRANSMIT ---------------------------------------------
await st(() => {
  const ap = window.__ap;
  ap.revealSouls('debug');
  const s = ap.store.getState();
  const r = (s.level.ring.min + s.level.ring.max) / 2;
  ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); d.director.done.push('engine-io-fault'); });
});
await waitFor(() => window.__ap.store.getState().run.phase === 'printing', 30000);
await waitFor(() => {
  const ap = window.__ap;
  const c12 = ap.store.getState().memory.find((seg) => seg.type === 'soul' && seg.cluster === 'C12');
  if (c12?.infected) ap.cure('C12');
  if (ap.store.getState().run.phase === 'printing') ap.printAll();
  return ap.store.getState().run.phase === 'report';
}, 40000, 400);
await waitFor(() => !document.getElementById('wrContinue').hidden, 30000, 200);
await page.waitForTimeout(600);
await shot('09-wake-report');
await overflow('WAKE REPORT');
await onScreen('WAKE REPORT', '#wrContinue');
const cont = await visibleText('#wrContinue');
check('…its button reads without a key cap', !/SPACE/.test(cont ?? ''), cont);
// The report can still be settling its last line when CONTINUE shows: tap until TRANSMIT comes up.
for (let i = 0; i < 4 && (await st(() => document.getElementById('transmitScreen').hidden)); i++) {
  if (await st(() => !document.getElementById('wrContinue').hidden)) await page.tap('#wrContinue');
  await waitFor(() => !document.getElementById('transmitScreen').hidden, 3000);
}
check('CONTINUE (tapped) brings up TRANSMIT', await st(() => !document.getElementById('transmitScreen').hidden));
await page.waitForTimeout(1500);
await shot('10-transmit');
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
await shot('11-transmit-picked');
check('…its button reads without a key cap', !/SPACE/.test((await visibleText('#txGo')) ?? ''), await visibleText('#txGo'));

// --- RUN END ---------------------------------------------------------------------------------------------------
await st(() => window.__ap.store.update((d) => { d.run.ships = []; d.run.phase = 'end'; d.run.endCause = 'flagship-lost'; }));
await waitFor(() => !document.getElementById('runEnd').hidden, 5000);
await page.waitForTimeout(3500);
await shot('12-run-end');
await overflow('RUN END');
await page.locator('#reNew').scrollIntoViewIfNeeded();
await onScreen('RUN END (scrolled to it)', '#reNew');
// The screens' modal stack works by touch: NEW RUN brings the title back.
await page.tap('#reNew');
check('a tap on NEW RUN brings up the title', await waitFor(() => !document.getElementById('titleCard').hidden && document.getElementById('runEnd').hidden, 8000));

// --- BEAM OUT on a phone (WP7 verify: its line was cut and both buttons sat in hidden tabs) --------------------------
await page.goto((process.env.TEST_BASE_URL ?? 'http://localhost:5173/') + '?debug&seed=4', { waitUntil: 'networkidle' });
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
await page.goto((process.env.TEST_BASE_URL ?? 'http://localhost:5173/') + '?debug&seed=4', { waitUntil: 'networkidle' });
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

// --- A LOST card on a fresh page -----------------------------------------------------------------------------------
await page.goto((process.env.TEST_BASE_URL ?? 'http://localhost:5173/') + '?debug&seed=4', { waitUntil: 'networkidle' });
await page.tap('#titleReceive');
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 5000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 10000);
await st(() => window.__ap.endFlight('crashed'));
await waitFor(() => !document.getElementById('burnResult').hidden, 8000);
await page.waitForTimeout(2500);
await shot('13-lost-card');
await overflow('LOST card');
await onScreen('LOST card', '#burnResultRetry');
await page.tap('#burnResultRetry');
check('a tap on the LOST card\'s button goes on', await waitFor(() => document.getElementById('burnResult').hidden, 8000));

check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
const failed = results.filter((ok) => !ok).length;
console.log(`---- ${results.length - failed}/${results.length} checks passed at ${vw}x${vh}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
