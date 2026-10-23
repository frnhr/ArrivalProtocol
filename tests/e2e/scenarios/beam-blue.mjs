// WP12 fix round 2 (minor 2): a doomed HALCYON's BEAM OUT line seen from the MIND. Amber: `NOT ENOUGH FUEL to miss the
// planet — press BEAM OUT`, no key. Blue: `… — [TAB], press BEAM OUT` with the TAB toggle lit (a phone's cap reads
// [SHIP]), whole on the strip; back in amber the plain line. At 1440x900 and on a 390x844 touch phone.
// Usage: node tests/e2e/scenarios/beam-blue.mjs   (exits non-zero on a failed check; shots under tests/.out/e2e/shots; tests/e2e/run.mjs runs it)
import { launch, BASE_URL } from '../lib.mjs';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const browser = await launch();
for (const viewport of [{ name: '1440x900', width: 1440, height: 900, phone: false }, { name: '390x844', width: 390, height: 844, phone: true }]) {
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
  const strip = () => evaluate(() => ({
    shown: window.__ap.director().shown,
    rendered: document.getElementById('objectiveText')?.textContent ?? '',
    over: window.__ap.stripOverflow([window.__ap.director().shown?.text ?? ''], 2).length,
    // The strip's caps: the key, and what a phone's stylesheet draws instead (keycaps.ts data-touch).
    caps: [...document.querySelectorAll('#objectiveText kbd.keycap')].map((cap) => ({ key: cap.textContent, touch: cap.dataset.touch ?? null })),
  }));
  const toMode = async (mode) => {
    if (viewport.phone) await page.tap(`.mode-toggle-opt[data-mode="${mode}"]`);
    else await evaluate((target) => window.__ap.setMode(target), mode);
    await page.waitForTimeout(700);
  };

  await page.goto(BASE_URL + '?debug&seed=4', { waitUntil: 'networkidle' });
  await page.locator('#titleReceive').click({ force: true });
  await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
  await evaluate(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await evaluate(() => window.__ap.ship(1));
  await waitFor(() => {
    const state = window.__ap.store.getState();
    if (state.run.phase === 'boot') window.__ap.skipBoot();
    return state.run.phase === 'flight' && state.level.shipName === 'HALCYON';
  }, 30000);
  if ((await evaluate(() => window.__ap.store.getState().ui.mode)) !== 'tools') await toMode('tools');
  // Falling straight at the planet with an empty tank (phone.mjs's setup): no burn can save it.
  await evaluate(() => {
    const ap = window.__ap; const state = ap.store.getState();
    const radius = state.level.planet.R * 2.2;
    ap.store.mutate((draft) => {
      draft.orbit.x = radius; draft.orbit.y = 0; draft.orbit.vx = 0; draft.orbit.vy = 0.3 * Math.sqrt(state.level.planet.mu / radius); draft.burn.fuelPct = 0;
    });
  });
  check(`${viewport.name}: a doomed HALCYON offers BEAM OUT`, await waitFor(() => window.__ap.beamOutView().look === 'offered', 8000));
  await page.waitForTimeout(1500);
  const amber = await strip();
  check(`${viewport.name} amber: \`… — press BEAM OUT\`, no key`, amber.shown?.id === 'beam-out-offer'
    && /— press BEAM OUT$/.test(amber.shown.text) && amber.shown.keys.length === 0 && amber.over === 0, amber.rendered);
  await page.screenshot({ path: `tests/.out/e2e/shots/beam-${viewport.name}-1-amber.png` });

  await toMode('memory');
  const blue = await strip();
  // On a phone the [TAB] cap names the screen to go to (keycaps.ts: the strip passes tab: SHIP for a ship line).
  const capOk = blue.caps.length === 1 && blue.caps[0].key === 'TAB' && (!viewport.phone || blue.caps[0].touch === 'SHIP');
  check(`${viewport.name} blue: \`… — [${viewport.phone ? 'SHIP' : 'TAB'}], press BEAM OUT\`, TAB its key, whole on the strip`,
    blue.shown?.id === 'beam-out-offer' && /— \[TAB\], press BEAM OUT$/.test(blue.shown.text) && blue.shown.keys[0] === 'TAB'
    && blue.over === 0 && capOk, `${blue.rendered} · keys ${JSON.stringify(blue.shown?.keys)} · caps ${JSON.stringify(blue.caps)}`);
  await page.screenshot({ path: `tests/.out/e2e/shots/beam-${viewport.name}-2-blue.png` });

  await toMode('tools');
  const back = await strip();
  check(`${viewport.name} back in amber: the plain line again`, /— press BEAM OUT$/.test(back.shown?.text ?? ''), back.rendered);
  check(`${viewport.name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
