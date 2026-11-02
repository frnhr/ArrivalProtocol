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
  // PICK ONE TO CARRY by its key ([1] [2] [3]) once the PACKET takes input (TRANSMIT_ARM_SEC after it opens): pressed
  // until the pick shows. Returns the card picked (null: none after the tries).
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
  return { lockInRing, landToReport, finishReport, capsText, desk, clickNode, pickCard };
}
