// Shared plumbing for the e2e scenarios (tests/e2e/scenarios/*.mjs). Each scenario is a standalone Node script that
// drives Chromium through Playwright against a running game, prints one PASS/FAIL line per check and exits non-zero on
// a failure; tests/e2e/run.mjs starts the dev server, runs them and adds the checks up.
// Env:
//   E2E_BASE_URL   the game (default http://localhost:5173/; run.mjs sets it to the server it starts)
//   E2E_CHROMIUM   a Chromium/Chrome executable; otherwise $PLAYWRIGHT_BROWSERS_PATH/chromium when that exists (cloud
//                  sessions), else the installed Google Chrome (channel 'chrome', a Mac with Chrome)
//   SHOT_VIEWPORT  WxH for the desktop scenarios (default 1440x900)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_URL = process.env.E2E_BASE_URL ?? process.env.TEST_BASE_URL ?? 'http://localhost:5173/';
export const OUT = 'tests/.out/e2e';
mkdirSync(join(OUT, 'shots'), { recursive: true });
export const SHOTS = join(OUT, 'shots');

export function launch() {
  const explicit = process.env.E2E_CHROMIUM;
  if (explicit) return chromium.launch({ executablePath: explicit });
  const bundled = process.env.PLAYWRIGHT_BROWSERS_PATH ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : null;
  if (bundled && existsSync(bundled)) return chromium.launch({ executablePath: bundled });
  return chromium.launch({ channel: 'chrome' });
}

export function viewportFromEnv(fallback = '1440x900', name = 'SHOT_VIEWPORT') {
  const spec = process.env[name] ?? fallback;
  const match = /^(\d+)x(\d+)$/.exec(spec);
  if (!match) throw new Error(`${name} must look like 1280x720 (got '${spec}')`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

// The PASS/FAIL lines run.mjs counts: `PASS  name  — detail`. finish() prints the tally and exits.
export function checker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    return Boolean(ok);
  };
  const finish = async (browser) => {
    const failed = results.filter((result) => !result.ok).length;
    console.log(`---- ${results.length - failed}/${results.length} checks passed`);
    await browser?.close();
    process.exit(failed === 0 ? 0 : 1);
  };
  return { check, results, finish };
}

// A key the scenario holds down across its polls (playtest 1, plan §3.1: [F] is held to fast-forward, a tap does nothing).
// `set(true)` presses it once and keeps it down, `set(false)` lets it up; asking for the state it is in does nothing, so a
// poll loop can call `set(the strip shows [F])` every time. `gameHeld` (optional, the game's own view: ?debug's
// `__ap.fastForward().held`) catches a key the game let go while it was down here (a modal opening over the game releases
// every held key, and the browser's auto-repeat is never taken for a press): it is then let up and pressed afresh. Every
// scenario that drives the strip's [F] holds it this way: while the line offers `hold [F]`, and not a moment after.
export function holdKey(page, code) {
  let down = false;
  return {
    get down() { return down; },
    async set(on, gameHeld = null) {
      if (on && down && gameHeld === false) {
        await page.keyboard.up(code);
        down = false;
      }
      if (on === down) return;
      down = on;
      if (on) await page.keyboard.down(code);
      else await page.keyboard.up(code);
    },
  };
}

// The first desk's TRAIN bar (or any purchase's): `count` purchases pending once it has filled. The bar fills on wall time
// but by at most WALL_FRAME_MAX_SEC (0.1 s) a frame, so on a loaded machine drawing the desk at 2–3 frames a second its
// 1.5 s take 6 s or more (resume.mjs, ea0d6c8). The press (ENTER, or the tap on the bar) must start it at once: within 2 s
// the bar is running (ui.trainingHoldSec) or already done; then it is waited for while it still fills (up to 30 s), and
// the purchase must be there when it stops.
export async function waitTrained(page, count = 1) {
  const poll = async (pred, maxMs, stepMs) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      if (await page.evaluate(pred, count)) return true;
      await page.waitForTimeout(stepMs);
    }
    return false;
  };
  const started = await poll((n) => { const s = window.__ap.store.getState(); return s.ui.trainingHoldSec !== null || s.run.skills.pending.length === n; }, 2000, 20);
  if (!started) return false;
  await poll((n) => { const s = window.__ap.store.getState(); return s.run.skills.pending.length === n || s.ui.trainingHoldSec === null; }, 30000, 100);
  return page.evaluate((n) => window.__ap.store.getState().run.skills.pending.length === n, count);
}

// Page helpers every scenario writes the same way: evaluate in the page, poll a predicate, collect page errors.
export function pageKit(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  const st = (fn, arg) => page.evaluate(fn, arg);
  const waitFor = async (pred, maxMs, stepMs = 100, arg) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      if (await page.evaluate(pred, arg)) return true;
      await page.waitForTimeout(stepMs);
    }
    return false;
  };
  return { errors, st, waitFor };
}

// --- The run's screens between ships, shared by the scenarios (slice 3a: the DESK between a ship's end and its PACKET) ---
// `kit` is pageKit(page)'s { st, waitFor }. Every helper reads the page through ?debug's window.__ap; none of them plays a
// ship's flight (a scenario that wants the strip followed does that itself).
export function runKit(page, kit) {
  const { st, waitFor } = kit;
  // A circular orbit in the middle of the ring: the flight ends locked at once (the shortcut every scenario uses).
  const lockInRing = (opts = {}) => st(({ sleep }) => {
    const ap = window.__ap;
    const s = ap.store.getState();
    const r = (s.level.ring.min + s.level.ring.max) / 2;
    if (sleep) ap.store.update((d) => { d.hollow.phase = 'dormant'; });
    ap.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = 0; d.orbit.vy = Math.sqrt(s.level.planet.mu / r); d.director.done.push('engine-io-fault'); });
  }, { sleep: opts.sleep === true });
  // The landing at once (every pod in memory down, __ap.landAll) until the LANDING REPORT.
  const landToReport = async (maxMs = 60000) => {
    await waitFor(() => ['landing', 'report'].includes(window.__ap.store.getState().run.phase), 25000);
    return waitFor(() => {
      const ap = window.__ap;
      if (ap.store.getState().run.phase === 'landing' && ap.store.getState().landing.ended === null) ap.landAll();
      return ap.store.getState().run.phase === 'report';
    }, maxMs, 400);
  };
  // The LANDING REPORT by SPACE up to CONTINUE (read there: its TRACE line), then on until the report closes.
  const finishReport = async () => {
    await page.waitForTimeout(1200);
    for (let i = 0; i < 8 && (await st(() => document.getElementById('lrContinue').hidden)); i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(600);
    const seen = await st(() => ({ trace: document.getElementById('lrTrace').hidden ? null : document.getElementById('lrTrace').innerText, cont: !document.getElementById('lrContinue').hidden }));
    for (let i = 0; i < 8 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(1300);
    }
    return seen;
  };
  // What a node, a button or the strip reads as text: a key cap (<kbd class="keycap">ENTER</kbd>) reads as [ENTER].
  const capsText = (selector) => st((sel) => {
    const read = (node) => node.nodeType === Node.TEXT_NODE ? node.textContent
      : node.nodeType !== Node.ELEMENT_NODE ? '' : node.matches('kbd.keycap') ? `[${node.textContent}]` : [...node.childNodes].map(read).join('');
    const el = document.querySelector(sel);
    return el ? read(el).replace(/\s+/g, ' ').trim() : null;
  }, selector);
  // The DESK as the kid sees it: the steps, CONTROL's line, the greying line, the card, SET COURSE, the nodes by state.
  const desk = () => st(() => {
    const root = document.getElementById('deskScreen');
    const s = window.__ap.store.getState();
    const card = root?.querySelector('.desk-card');
    const read = (node) => node.nodeType === Node.TEXT_NODE ? node.textContent
      : node.nodeType !== Node.ELEMENT_NODE ? '' : node.matches('kbd.keycap') ? `[${node.textContent}]` : [...node.childNodes].map(read).join('');
    const nodes = [...(root?.querySelectorAll('.desk-chart [data-slot]') ?? [])].map((g) => ({
      slot: Number(g.getAttribute('data-slot')), state: [...g.classList].find((c) => c.startsWith('state-'))?.slice(6) ?? '', selected: g.classList.contains('selected'),
    }));
    return {
      shown: root !== null && !root.hidden, phase: s.run.phase, selected: s.ui.deskSelected, title: root?.querySelector('.desk-title')?.textContent ?? '',
      where: root?.querySelector('.desk-where')?.textContent ?? '', step: root?.querySelector('.desk-step-text')?.textContent ?? '',
      control: root?.querySelector('.desk-control')?.hidden === false ? root.querySelector('.desk-control-text')?.textContent ?? '' : null,
      beat: root?.querySelector('.desk-beat')?.hidden === false ? root.querySelector('.desk-beat')?.textContent ?? '' : null,
      go: root ? read(root.querySelector('#deskGo')).replace(/\s+/g, ' ').trim() : '',
      card: card && card.dataset.slot !== '' ? {
        slot: Number(card.dataset.slot), state: card.dataset.state ?? '', name: card.querySelector('.dc-name')?.textContent ?? '',
        sub: card.querySelector('.dc-sub')?.textContent ?? '', sched: card.querySelector('.dc-sched')?.textContent ?? null,
        colonists: card.querySelector('.dc-colonists')?.textContent ?? '', cost: card.querySelector('.dc-cost')?.textContent ?? null,
        tags: [...card.querySelectorAll('.dc-tag')].map((tag) => tag.textContent),
        rows: [...card.querySelectorAll('.dc-row')].map((row) => [...row.classList].find((c) => c.startsWith('key-'))?.slice(4) + '=' + row.querySelector('.dc-v')?.textContent),
        timeline: card.querySelector('.dc-tl-text')?.textContent ?? null,
      } : null,
      nodes, route: s.run.map.route.map((stop) => stop.slot), names: Object.fromEntries(s.run.map.arm.map((ship) => [ship.slot, ship.name])),
    };
  });
  // The kid clicks a ship's node on the chart (scoped to the DESK: the title's chart has [data-slot] nodes too). Returns
  // whether the click landed: the node's own square got it (nothing over it took the pointer) within `ms`.
  const clickNode = async (slot, opts = {}) => {
    const box = page.locator(`#deskScreen [data-slot="${slot}"] .cn-box`).first();
    try {
      if (opts.tap) await box.tap({ timeout: opts.ms ?? 4000 });
      else await box.click({ timeout: opts.ms ?? 4000 });
      return true;
    } catch (err) {
      return String(err).split('\n')[0];
    }
  };
  // The salvage by its key ([1] [2] [3]) once LEAVE ORBIT takes input (TRANSMIT_ARM_SEC after it opens; playtest 1: the
  // cards moved there from the PACKET): pressed until the pick shows. Returns the card picked (null: none after the tries).
  const pickCard = async (index = 0) => {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(`Digit${index + 1}`);
      await page.waitForTimeout(250);
      const picked = await st(() => window.__ap.draft()?.pick ?? null);
      if (picked !== null) return picked;
      await page.waitForTimeout(250);
    }
    return null;
  };
  // The desk's right window (slice 3b): the tabs and their badges, the REPOSITORY's rows, the INBOX's list and reader.
  const deskTabs = () => st(() => {
    const root = document.getElementById('deskScreen');
    const shown = (el) => el !== null && !el.hidden && el.getBoundingClientRect().height > 0;
    const repo = root.querySelector('.desk-repo');
    const inbox = root.querySelector('.desk-inbox');
    return {
      tab: root.dataset.tab ?? null, pick: window.__ap.store.getState().run.repo.pick,
      tabs: [...root.querySelectorAll('.desk-tab')].map((tab) => ({ id: tab.dataset.tab, label: tab.querySelector('.desk-tab-label')?.textContent ?? '',
        on: tab.classList.contains('on'), badge: tab.querySelector('.desk-tab-badge')?.hidden === false ? tab.querySelector('.desk-tab-badge').textContent : null })),
      repoShown: shown(repo), inboxShown: shown(inbox), cardShown: shown(root.querySelector('.desk-card:not(.desk-repo):not(.desk-inbox)')),
      rows: [...(repo?.querySelectorAll('.rp-row') ?? [])].map((row) => ({ file: row.dataset.file, text: row.querySelector('.rp-text')?.textContent ?? '',
        // The ETA is the window's, once above the list (3b review m5): every row reads it.
        eta: repo.querySelector('.rp-eta')?.textContent ?? null, tone: [...(repo.querySelector('.rp-eta')?.classList ?? [])].find((c) => c.startsWith('eta-')) ?? null,
        tag: row.querySelector('.rp-tag')?.textContent ?? null, req: row.querySelector('.rp-req')?.textContent ?? '',
        requested: row.classList.contains('requested'), focus: row.classList.contains('focus') })),
      transit: [...(repo?.querySelectorAll('.rp-transit-row') ?? [])].map((row) => row.textContent),
      transitNone: repo?.querySelector('.rp-transit .rp-none')?.textContent ?? null,
      locked: [...(repo?.querySelectorAll('.rp-locked') ?? [])].map((row) => row.innerText.replace(/\s+/g, ' ')),
      warn: repo?.querySelector('.rp-warn')?.textContent ?? null, foot: repo?.querySelector('.rp-foot')?.textContent ?? null,
      mail: [...(inbox?.querySelectorAll('.ib-row') ?? [])].map((row) => ({ id: row.dataset.id, from: row.querySelector('.ib-from')?.textContent ?? '',
        subject: row.querySelector('.ib-subject')?.textContent ?? '', received: row.querySelector('.ib-received')?.textContent ?? '', unread: row.classList.contains('unread'),
        tone: [...row.classList].find((c) => c.startsWith('tone-')) ?? null })),
      reader: inbox?.querySelector('.ib-reader') ? { stamps: inbox.querySelector('.ib-stamps')?.textContent ?? '',
        lines: [...inbox.querySelectorAll('.ib-line')].map((line) => line.textContent) } : null,
      steps: [...root.querySelectorAll('.desk-step')].map((step) => `${step.textContent}${step.classList.contains('done') ? ' ✓' : ''}${step.classList.contains('now') ? ' ◀' : ''}`),
    };
  });
  // The SHIP CARD's TIMELINE marks under its text (3b): `2629 Swap`, late (red) after ▲.
  const deskMarks = () => st(() => [...document.querySelectorAll('#deskScreen .dc-tl-filetext')].map((mark) => ({ text: mark.textContent, late: mark.classList.contains('late') })));
  // Slice 7a (R6, R7): the FINALE's two steps on the card. The card waits for the landing to settle (landed at once here, as
  // landToReport does); step 1 once armed (`hollow`: PURGE, MERGE or SPARE's row; 'followed': UNRESOLVED's IT FOLLOWED YOU
  // card and its CONTINUE), then step 2 once armed (`you`'s row). Rows are `button#fc<Piece>` (CARD's Deviation 10).
  // Returns which step failed to come up ('step1', 'step2'), or null when both were taken.
  const fcRow = (piece) => `button#fc${piece[0].toUpperCase()}${piece.slice(1)}`;
  const finaleTwoSteps = async (hollow = 'purge', you = 'reassignment') => {
    const step1 = await waitFor((followed) => {
      const ap = window.__ap;
      const s = ap.store.getState();
      if (s.run.phase === 'landing' && s.landing.ended === null) ap.landAll();
      return s.hollow.finale.phase === 'step1' && s.hollow.finale.rootFell !== followed
        && document.getElementById('finaleChoice').classList.contains('armed');
    }, 45000, 300, hollow === 'followed');
    if (!step1) return 'step1';
    await page.locator(hollow === 'followed' ? 'button#fcCont' : fcRow(hollow)).click();
    const step2 = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2'
      && document.getElementById('finaleChoice').classList.contains('armed'), 8000);
    if (!step2) return 'step2';
    await page.locator(fcRow(you)).click();
    return null;
  };
  // Slice 7a (R19): after CONTINUE, the night by keys: the RUN TALLY (pressed once it takes input) → the EPILOGUE (after
  // EPILOGUE_ARM_SEC) → its typing whole → the FINAL CARD (after FINAL_CARD_ARM_SEC) → NEW RUN. Returns what was seen on
  // the way: the epilogue's lines, the final card's title and endings line (null where a screen did not come).
  const throughTheNight = async (key = 'Enter') => {
    await page.keyboard.press(key);
    const epilogueUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'epilogue' && !document.getElementById('epilogue').hidden, 4000);
    await page.waitForTimeout(700);
    await page.keyboard.press(key);   // finishes the typing
    await page.waitForTimeout(200);
    const epilogue = epilogueUp ? await st(() => [...document.querySelectorAll('#epilogue .ne-line')].map((line) => line.textContent.trim())) : null;
    await page.keyboard.press(key);   // the final card
    const finalUp = await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'final' && !document.getElementById('finalCard').hidden, 4000);
    const card = finalUp ? await st(() => ({ title: document.querySelector('#finalCard .nf-title')?.textContent ?? '',
      endings: document.querySelector('#finalCard .nf-endings')?.textContent ?? '', kicker: document.querySelector('#finalCard .nf-kicker')?.textContent ?? '' })) : null;
    await page.waitForTimeout(1300);
    await page.keyboard.press(key);   // NEW RUN
    return { epilogue, card };
  };
  // Playtest 1 (B-ORDER, note 5): LEAVE ORBIT after a ship's end, before the DESK. Waits for the screen (and the input it
  // takes TRANSMIT_ARM_SEC after it comes up), reads its title and cards, closes a LOG READER open over it (`reader`: the
  // entry it showed), picks card `index` by its key ([1] [2] [3]), presses ENTER until the DESK opens. `index` null: ENTER
  // alone (refused while cards wait). Returns what was seen.
  const leaveOrbit = async (index = 0) => {
    const up = await waitFor(() => window.__ap.store.getState().run.phase === 'leave' && !document.getElementById('leaveScreen').hidden, 10000);
    const seen = await st(() => ({
      title: document.getElementById('loTitle').textContent, sub: document.getElementById('loSub').textContent,
      why: document.getElementById('loWhy').hidden ? null : document.getElementById('loWhy').textContent,
      heading: document.getElementById('loHeading').textContent,
      cards: [...document.querySelectorAll('#loCards .tx-card')].map((card) => card.dataset.card),
    }));
    // On run 1 the LOG READER opens by itself over the first LEAVE ORBIT (entry 01): seen, then closed with SPACE.
    await page.waitForTimeout(600);
    const reader = await st(() => (document.getElementById('logReader').hidden ? null : document.querySelector('#lgRows .lg-row.open')?.dataset.entry ?? '?'));
    for (let i = 0; i < 4 && (await st(() => !document.getElementById('logReader').hidden)); i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
    }
    const pick = up && index !== null ? await pickCard(index) : null;
    for (let i = 0; i < 8 && (await st(() => window.__ap.store.getState().run.phase)) === 'leave'; i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
    const desk = await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 6000);
    return { up, desk, pick, reader, ...seen };
  };
  // The beam once the PACKET is up (SET COURSE pressed): a PACKET with a question waits for TRANSMIT ▸ (clicked here, and its
  // inline confirm answered yes); one with none beams by itself (`direct`). Returns 'direct', 'sent', or null (no PACKET).
  const beam = async () => {
    const up = await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 6000);
    if (!up) return null;
    // A beam already under way (a direct one) needs nothing.
    if (await st(() => document.getElementById('transmitScreen').classList.contains('sending'))) return 'direct';
    if (await st(() => document.getElementById('transmitScreen').classList.contains('direct'))) return 'direct';
    await page.waitForTimeout(1100);
    await page.locator('#txGo').click();
    await page.waitForTimeout(300);
    if (await st(() => !document.querySelector('#transmitScreen .tx-confirm').hidden)) await page.keyboard.press('Enter');
    return 'sent';
  };
  return {
    lockInRing, landToReport, finishReport, capsText, desk, clickNode, pickCard, deskTabs, deskMarks, finaleTwoSteps, throughTheNight, leaveOrbit,
    beam,
  };
}
