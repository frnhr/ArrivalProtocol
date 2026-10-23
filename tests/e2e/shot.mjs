// Usage: node tests/e2e/shot.mjs <outPrefix> [waitMs] [actionsJson]
// Captures screenshots of the running dev server, plus console errors and eval results, as JSON.
//
// Env:
//   SHOT_BASE            base URL (default http://localhost:5173/)
//   SHOT_QUERY           appended to the URL, e.g. '?debug&seed=1' (a leading '?' is added if missing)
//   SHOT_VIEWPORT        WxH, e.g. 1280x720 (default 1440x900)
//   SHOT_REDUCED_MOTION  '1' emulates prefers-reduced-motion: reduce
//
// Actions (run in order; any combination of keys per action object):
//   { "click": "<selector>" }          click the first match (forced)
//   { "key": "KeyS" }                  press and release a key (Playwright key name)
//   { "down": "Space" } / { "up": "Space" }   hold / release a key
//   { "hold": ["Space", 1000] }        hold a key for N ms, then release it
//   { "eval": "<js expression>" }      evaluate in the page; a non-undefined result is reported
//   { "wait": 500 }                    wait N ms
//   { "shot": "name" }                 screenshot to <outPrefix>-name.png
// With no actions: a tools-mode and a memory-mode screenshot.
import { launch, BASE_URL } from './lib.mjs';

const [,, outPrefix = 'tests/.out/e2e/shots/cur', waitMs = '1500', actionsJson = '[]'] = process.argv;
const base = process.env.SHOT_BASE ?? BASE_URL;
const rawQuery = process.env.SHOT_QUERY ?? '';
const query = rawQuery && !rawQuery.startsWith('?') ? `?${rawQuery}` : rawQuery;
const viewportSpec = process.env.SHOT_VIEWPORT ?? '1440x900';
const viewportMatch = /^(\d+)x(\d+)$/.exec(viewportSpec);
if (!viewportMatch) throw new Error(`SHOT_VIEWPORT must look like 1280x720 (got '${viewportSpec}')`);
const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };

const browser = await launch();
const page = await browser.newPage({ viewport });
if (process.env.SHOT_REDUCED_MOTION === '1') await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
const evals = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(base + query, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const actions = JSON.parse(actionsJson);
// A failing action is reported (with its index) and ends the script, but the JSON report is
// still printed so earlier eval results are never lost.
let actionIndex = 0;
try {
for (const act of actions) {
  if (act.click) await page.locator(act.click).first().click({ force: true, timeout: 5000 });
  if (act.key) await page.keyboard.press(act.key);
  if (act.down) await page.keyboard.down(act.down);
  if (act.up) await page.keyboard.up(act.up);
  if (act.hold) {
    const [holdKey, holdMs] = act.hold;
    await page.keyboard.down(holdKey);
    await page.waitForTimeout(Number(holdMs));
    await page.keyboard.up(holdKey);
  }
  if (act.eval) {
    const value = await page.evaluate(act.eval);
    if (value !== undefined) evals.push({ expr: act.eval, value });
  }
  if (act.wait) await page.waitForTimeout(act.wait);
  if (act.shot) await page.screenshot({ path: `${outPrefix}-${act.shot}.png` });
  actionIndex++;
}
} catch (err) {
  errors.push(`action #${actionIndex} ${JSON.stringify(actions[actionIndex])} failed: ${String(err).split('\n')[0]}`);
}
if (!actions.length) {
  await page.screenshot({ path: `${outPrefix}-tools.png` });
  const toggle = page.locator('.mode-toggle-opt[data-mode="memory"]');
  if (await toggle.count()) { await toggle.click({ force: true }); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${outPrefix}-memory.png` });
}
console.log(JSON.stringify({ viewport: viewportSpec, url: base + query, errors, evals }));
await browser.close();
