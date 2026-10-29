// WP12 fix round 2: fix round 1's desk check, unchanged but for its shots (under tests/unit/wp12/fix2/shots).
// WP12 fix round 1, desktop checks in the running dev server (SHOT_VIEWPORT, default 1440x900):
// • the ship marker never sits under the NAV PLOT's chip (LEAD-2's item, its second half: the plot zooms out just
//   enough while it would): a big captured loop's far end swept across the top of the plot, the chip at its widest;
// • a window dragged on the desk keeps its spot across the 768 px breakpoint and back (ToolsTabs, the quality review);
// • no page errors. (Slice 1a: no reveal any more, so the flight is checked as it boots: STASIS stays the ship's file.)
//   Shots under tests/.out/e2e/shots/desk-*. Exits non-zero on a FAIL.
import { launch, BASE_URL } from '../lib.mjs';

const [vw, vh] = (process.env.SHOT_VIEWPORT ?? '1440x900').split('x').map(Number);
const out = `tests/.out/e2e/shots/desk-${vw}x${vh}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
page.on('pageerror', (err) => errors.push(String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
const st = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (pred, maxMs) => {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { if (await page.evaluate(pred)) return true; await page.waitForTimeout(100); }
  return false;
};

await page.goto(BASE_URL + '?debug&seed=1', { waitUntil: 'networkidle' });
await page.locator('#titleReceive').click();
await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 5000);
await page.waitForTimeout(700);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 12000);
await page.waitForTimeout(600);

// A captured loop whose far end (▲, the ship) is `raFactor` ring radii out, the ship at ▲ in direction `angleDeg` (world
// frame, y up): the plot then rides the ship at its edge.
const plantAtApo = (raFactor, angleDeg) => st(([factor, angle]) => {
  const ap = window.__ap;
  const s = ap.store.getState();
  const mu = s.level.planet.mu;
  const rp = s.level.ring.min + 500;
  const ra = s.level.ring.max * factor;
  const a = (rp + ra) / 2;
  const e = (ra - rp) / (ra + rp);
  const p = a * (1 - e * e);
  const vt = Math.sqrt(mu / p) * (1 - e);
  const th = (angle * Math.PI) / 180;
  ap.store.mutate((d) => {
    d.orbit.x = ra * Math.cos(th); d.orbit.y = ra * Math.sin(th);
    d.orbit.vx = -vt * Math.sin(th); d.orbit.vy = vt * Math.cos(th);
    d.director.done.push('engine-io-fault');
  });
}, [raFactor, angleDeg]);

const shipAndChip = () => st(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const ship = box(document.querySelector('.navplot-win .np-ship'));
  const chipEl = document.getElementById('npChip');
  const chip = box(chipEl);
  const overlap = Math.max(0, Math.min(ship.right, chip.right) - Math.max(ship.left, chip.left))
    * Math.max(0, Math.min(ship.bottom, chip.bottom) - Math.max(ship.top, chip.top));
  return { overlap: Math.round(overlap), chip: chipEl.textContent, shipTop: Math.round(ship.top), chipBottom: Math.round(chip.bottom) };
});

const under = [];
let widest = '';
for (let angle = 70; angle <= 130; angle += 4) {
  await plantAtApo(12, angle);
  await page.waitForTimeout(350);
  const reading = await shipAndChip();
  if (reading.chip.length > widest.length) widest = reading.chip;
  if (reading.overlap > 0) under.push(`${angle}°: ${reading.overlap} px² (${reading.chip})`);
  if (angle === 98) await page.screenshot({ path: `${out}-ship-top.png` });
}
check(`the ship marker never sits under the plot's chip (a far loop's end swept 70°–130°, chip "${widest}")`, under.length === 0, under.join(' | '));

// A dragged window across the breakpoint and back.
const title = page.locator('.engine-win .window-title');
const before = await title.boundingBox();
await page.mouse.move(before.x + 40, before.y + 8);
await page.mouse.down();
await page.mouse.move(before.x - 160, before.y + 120, { steps: 8 });
await page.mouse.up();
const dragged = await st(() => { const win = document.querySelector('.engine-win'); return { left: win.style.left, top: win.style.top }; });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const asTab = await st(() => { const win = document.querySelector('.engine-win'); return { left: win.style.left, top: win.style.top }; });
await page.setViewportSize({ width: vw, height: vh });
await page.waitForTimeout(600);
const back = await st(() => { const win = document.querySelector('.engine-win'); return { left: win.style.left, top: win.style.top, hidden: win.hidden }; });
check('a dragged Engine window flows as a tab on a phone (no inline spot)', dragged.left !== '' && asTab.left === '' && asTab.top === '',
  JSON.stringify({ dragged, asTab }));
check('…and is back where the kid dragged it on the desk', back.left === dragged.left && back.top === dragged.top && !back.hidden,
  JSON.stringify(back));
await page.screenshot({ path: `${out}-dragged-back.png` });

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
const failed = results.filter((ok) => !ok).length;
console.log(`---- ${results.length - failed}/${results.length} checks passed at ${vw}x${vh}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
