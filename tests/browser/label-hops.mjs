// WP12 fix round 2, the NAV PLOT labels' side (review major: ▼ and START BURN hopped across their markers every 1–3 s
// on ship 1). The reviewer's check and the lead's round-2 note:
// • ship 1 with its default sensor (Sensor Interp 78%, the approx band), after [D] plus a 5 s burn: ▼'s label changes
//   side at most once in the first 10 s of the coast, and no label hops (a change undone within 3 s) over 60 s of it
//   (COAST_SEC);
// • HALCYON's opener burn (the older START BURN jitter, minor 4): no hop; and at its far zoom, before the burn and after
//   it, no marker label on the small ring (and the planet inside it) or on the drawn path (round 1's fix 12).
// A side change: the label's centre jumps over 10 px between two 50 ms samples, or its text-anchor changes.
// Usage: node tests/wp12/fix2/label-hops-check.mjs [desk|phone|both]   (exits non-zero on a failed check)
import { chromium } from 'playwright';

const which = process.argv[2] ?? 'both';
const coastSec = Number(process.env.COAST_SEC ?? 60);
const HOP_UNDONE_MS = 3000;
const viewports = [
  ...(which !== 'phone' ? [{ name: '1440x900', width: 1440, height: 900, phone: false }] : []),
  ...(which !== 'desk' ? [{ name: '390x844', width: 390, height: 844, phone: true }] : []),
];
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: 'chrome' });
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ...(viewport.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  const waitFor = async (predicate, maxMs) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      if (await page.evaluate(predicate)) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };

  async function startShip(index) {
    await page.goto((process.env.TEST_BASE_URL ?? 'http://localhost:5173/') + '?debug&seed=4', { waitUntil: 'networkidle' });
    await evaluate(() => window.__ap.archiveClear?.());
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#titleReceive').click({ force: true });
    await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
    await evaluate(() => window.__ap.skipBoot());
    await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
    if (index > 0) {
      await evaluate((shipIndex) => window.__ap.ship(shipIndex), index);
      await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 20000);
      await evaluate(() => window.__ap.skipBoot());
      await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
    }
    if ((await evaluate(() => window.__ap.store.getState().ui.mode)) !== 'tools') await evaluate(() => window.__ap.setMode('tools'));
    await page.waitForTimeout(800);
  }

  async function startSampling() {
    await evaluate(() => {
      const labels = ['np-peri-label', 'np-burn-label'];
      window.__sides = { seq: Object.fromEntries(labels.map((name) => [name, []])) };
      window.__sides.timer = setInterval(() => {
        const now = performance.now();
        for (const name of labels) {
          const label = document.querySelector(`.navplot-win svg text.${name}`);
          if (!label || getComputedStyle(label).display === 'none' || label.getBoundingClientRect().width === 0) continue;
          const box = label.getBBox();
          window.__sides.seq[name].push({ now, x: box.x + box.width / 2, y: box.y + box.height / 2, anchor: label.getAttribute('text-anchor') });
        }
      }, 50);
    });
  }

  // Side changes, those in the first `earlySec`, and hops (a change undone within HOP_UNDONE_MS: the label back within
  // 10 px of where it was) per label since startSampling, with a timeline of the changes (s since the start).
  async function stopSampling(earlySec = Infinity) {
    return evaluate(({ undoneMs, early }) => {
      clearInterval(window.__sides.timer);
      const report = {};
      for (const [name, seq] of Object.entries(window.__sides.seq)) {
        const changes = [];
        for (let i = 1; i < seq.length; i++) {
          const jump = Math.hypot(seq[i].x - seq[i - 1].x, seq[i].y - seq[i - 1].y);
          if (jump > 10 || seq[i].anchor !== seq[i - 1].anchor) changes.push({ now: seq[i].now, from: seq[i - 1], to: seq[i] });
        }
        let hops = 0;
        for (let i = 1; i < changes.length; i++) {
          const back = Math.hypot(changes[i].to.x - changes[i - 1].from.x, changes[i].to.y - changes[i - 1].from.y) < 10;
          if (back && changes[i].now - changes[i - 1].now < undoneMs) hops++;
        }
        const start = seq[0]?.now ?? 0;
        report[name] = {
          samples: seq.length, changes: changes.length, early: changes.filter((change) => change.now - start < early * 1000).length, hops,
          timeline: changes.map((change) => `${((change.now - start) / 1000).toFixed(2)}s ${change.from.anchor}→${change.to.anchor}`).join(' '),
        };
      }
      return report;
    }, { undoneMs: HOP_UNDONE_MS, early: earlySec });
  }

  // The marker labels against the small ring (with the planet inside it) and the drawn path, in viewBox units: the path
  // sampled every unit along its drawn subpaths; a label's box shrunk by half a unit (a glyph's own side bearing).
  async function labelClearance() {
    return evaluate(() => {
      const svg = document.querySelector('.navplot-win svg');
      const shown = (node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0;
      const ringBox = svg.querySelector('path.np-ring').getBBox();
      const ring = { cx: ringBox.x + ringBox.width / 2, cy: ringBox.y + ringBox.height / 2, radius: ringBox.width / 2 };
      const points = [];
      for (const path of svg.querySelectorAll('path.np-path')) {
        if (!path.getAttribute('d')) continue;
        const length = path.getTotalLength();
        for (let along = 0; along <= length; along += 1) points.push(path.getPointAtLength(along));
      }
      const labels = [...svg.querySelectorAll('text.np-label:not(.np-zone-label), text.np-flyby-tag')].filter(shown).map((label) => {
        const box = label.getBBox();
        const inner = { left: box.x + 0.5, top: box.y + 0.5, right: box.x + box.width - 0.5, bottom: box.y + box.height - 0.5 };
        const nearestX = Math.min(Math.max(ring.cx, inner.left), inner.right);
        const nearestY = Math.min(Math.max(ring.cy, inner.top), inner.bottom);
        return {
          name: String(label.className.baseVal).split(' ').filter((word) => word !== 'np-label' && !word.startsWith('tone-')).join(' '),
          text: label.textContent,
          onRing: Math.hypot(nearestX - ring.cx, nearestY - ring.cy) < ring.radius,
          onPath: points.filter((point) => point.x > inner.left && point.x < inner.right && point.y > inner.top && point.y < inner.bottom).length,
        };
      });
      return { ringRadius: Math.round(ring.radius), labels };
    });
  }

  // Ship 1, its default sensor (approx): [D], a 5 s burn, then the coast is what is judged.
  await startShip(0);
  const sensor = await evaluate(() => window.__ap.store.getState().memory.find((seg) => seg.role === 'sensor')?.integrity);
  await page.keyboard.press('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.down('Space');
  await page.waitForTimeout(5000);
  await page.keyboard.up('Space');
  await page.waitForTimeout(500);
  await startSampling();
  await page.waitForTimeout(coastSec * 1000);
  const coast = await stopSampling(10);
  console.log(`ship 1 coast @ ${viewport.name} (Sensor Interp ${sensor}%), ${coastSec} s: ${JSON.stringify(coast)}`);
  const peri = coast['np-peri-label'];
  const burn = coast['np-burn-label'];
  check(`${viewport.name} ship 1: ▼'s label is shown through the coast`, peri.samples > 150, `${peri.samples} samples`);
  check(`${viewport.name} ship 1: ▼'s label changes side at most once in the coast's first 10 s`, peri.early <= 1, `${peri.early} changes`);
  check(`${viewport.name} ship 1: START BURN's label changes side at most once in the coast's first 10 s`, burn.early <= 1, `${burn.early} changes`);
  check(`${viewport.name} ship 1: no label hops in ${coastSec} s of coast (▼ and START BURN)`, peri.hops === 0 && burn.hops === 0,
    `▼ ${peri.changes} changes ${peri.timeline || '-'} · START BURN ${burn.changes} changes ${burn.timeline || '-'}`);
  await page.screenshot({ path: `tests/.out/shots/check-${viewport.name}-ship1-coast.png` });

  // HALCYON's opener: zoomed far out, the labels off the small ring and the path; then a 4 s correction burn and 3 s
  // after. The markers move under thrust, so a few side changes are fair; what must not happen is a hop.
  await startShip(1);
  const clearanceCheck = async (when) => {
    const clearance = await labelClearance();
    console.log(`HALCYON ${when} @ ${viewport.name}: ring ${clearance.ringRadius} units, ${JSON.stringify(clearance.labels)}`);
    check(`${viewport.name} HALCYON ${when}: the ring is small (zoomed far out)`, clearance.ringRadius < 60, `${clearance.ringRadius} units`);
    check(`${viewport.name} HALCYON ${when}: no marker label on the small ring or the planet`, clearance.labels.every((label) => !label.onRing),
      clearance.labels.filter((label) => label.onRing).map((label) => label.text).join(' | '));
    check(`${viewport.name} HALCYON ${when}: no marker label on the drawn path`, clearance.labels.every((label) => label.onPath === 0),
      clearance.labels.filter((label) => label.onPath > 0).map((label) => `${label.text} (${label.onPath})`).join(' | '));
  };
  await clearanceCheck('opener');
  await page.screenshot({ path: `tests/.out/shots/check-${viewport.name}-halcyon-opener.png` });
  await startSampling();
  await page.keyboard.down('Space');
  await page.waitForTimeout(4000);
  await page.keyboard.up('Space');
  await page.waitForTimeout(3000);
  const halcyon = await stopSampling();
  console.log(`HALCYON opener burn @ ${viewport.name}: ${JSON.stringify(halcyon)}`);
  check(`${viewport.name} HALCYON: START BURN's label never hops`, halcyon['np-burn-label'].hops === 0,
    `${halcyon['np-burn-label'].hops} hops, ${halcyon['np-burn-label'].changes} changes ${halcyon['np-burn-label'].timeline}`);
  check(`${viewport.name} HALCYON: ▼'s label never hops`, halcyon['np-peri-label'].hops === 0,
    `${halcyon['np-peri-label'].hops} hops, ${halcyon['np-peri-label'].changes} changes`);
  await clearanceCheck('after the burn');
  await page.screenshot({ path: `tests/.out/shots/check-${viewport.name}-halcyon.png` });

  check(`${viewport.name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
