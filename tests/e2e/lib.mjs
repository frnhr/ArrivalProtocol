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
