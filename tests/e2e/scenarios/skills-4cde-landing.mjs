// Slices 4c and 4e, the landing half of slice-4cde-plan §8.5 (the review-fix pass): AUTODROP v1–v3 and AUTOBURN v3 in the
// page, on run 1's arm, each ship reached by ?debug's __ap.slot and locked at once (__ap.lockOn), HOLLOW asleep, the
// beam's seeds freed and the drivers healed, so the strip shows the landing's own rows. A kid who obeys the strip: [F]
// whenever it offers a SKIP.
// • AUTODROP v1 on HALCYON (playtest 1): GET READY's ` · or [G] AUTO`, the POD BAY's `AUTO · CENTRE [G]` clicked, `ARMED ·
//   LZ-… · n PODS`, AUTODROP launches around the centre, the echo says BULLSEYE, it disarms; then [L] at LAUNCH NOW is a
//   plain launch.
// • AUTODROP v2 on KESTREL: the POD BAY's pass rows, a [+] click, [G], TAB into the MIND, the pass flies from there and ends.
// • AUTOBURN v3 on VESPER (a low ellipse): `[B] MOVE TO LANDING ORBIT` on the strip, the AUTO head, the ghost's label, [B],
//   then `LANDING ORBIT — it holds it`.
// • AUTODROP v3 on CORMORANT: the plan table and its check line (`PLAN · n PASSES · A 6 · B 3 ✓`, pods), [G], [F] per gap,
//   every pod down (the landing ends under the plan's last row).
// Usage: node tests/e2e/scenarios/skills-4cde-landing.mjs   (env E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { launch, BASE_URL, checker, pageKit } from '../lib.mjs';

const { check, finish } = checker();
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const { errors, st, waitFor } = pageKit(page);

const shown = () => st(() => window.__ap.director().shown ?? { text: '', keys: [], id: '' });
const said = (text) => st((t) => window.__ap.store.getState().log.entries.some((entry) => entry.text === t), text);
const logHas = (pattern) => st((p) => window.__ap.store.getState().log.entries.some((entry) => new RegExp(p).test(entry.text)), pattern);
const autodrop = () => st(() => window.__ap.autodrop());
const pods = () => st(() => {
  const s = window.__ap.store.getState();
  const of = (kind) => s.landing.pods.filter((record) => record.fate.kind === kind);
  return { total: s.landing.pods.length, aboard: of('aboard').length, down: of('down').length, auto: s.landing.pods.filter((r) => (r.fate.kind === 'falling' || r.fate.kind === 'down') && r.fate.launch.source === 'autodrop').length };
});

// [F] when the strip offers a SKIP and none runs (the kid between windows).
async function skipIfOffered() {
  const line = await shown();
  const skipping = await st(() => window.__ap.store.getState().clock.skipWarp !== null);
  if (!skipping && (line.keys ?? []).includes('F')) await page.keyboard.press('KeyF');
}

// Polls `done` every 250 ms for `maxMs`, pressing [F] when offered and calling `each` (an async act) first.
async function obeyUntil(done, maxMs, each) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (await st(done)) return true;
    if (each) await each();
    await skipIfOffered();
    await page.waitForTimeout(250);
  }
  return st(done);
}

// The ship in `slot`, its boot skipped, quiet (HOLLOW asleep, seeds freed, drivers healed, its lessons met), with the
// skill files given, then locked at once (__ap.lockOn) so the landing starts.
async function arrive(slot, { autodrop: adVersion = null, autoburn = null, heal = false, lock = {} } = {}) {
  await st((s) => window.__ap.slot(s), slot);
  await waitFor(() => {
    const s = window.__ap.store.getState();
    if (s.run.phase === 'boot') window.__ap.skipBoot();
    return s.run.phase === 'flight' && s.burn.status === 'approaching';
  }, 30000);
  await st(({ adVersion: ad, autoburn: ab, heal: healAll, lock: at }) => {
    const ap = window.__ap;
    ap.store.update((draft) => {
      draft.hollow.phase = 'dormant';
      draft.director.done.push('engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
      const memory = [];
      for (const seg of draft.memory) {
        const free = seg.type === 'hollow' ? { id: `e2e-free-${memory.length}`, name: 'Free', type: 'free', size: seg.size } : seg;
        const last = memory[memory.length - 1];
        if (free.type === 'free' && last?.type === 'free' && last.reservedBy === undefined && free.reservedBy === undefined) last.size += free.size;
        else memory.push(free);
      }
      draft.memory = memory;
      for (const seg of draft.memory) {
        if (!('integrity' in seg)) continue;
        if (seg.type === 'driver' || seg.role === 'thrust-ctrl') seg.integrity = 100;
        if (healAll && (seg.role === 'sensor' || seg.role === 'navplot' || seg.role === 'bay')) seg.integrity = 100;
      }
      draft.ui.memoryRev++;
    });
    if (ad !== null) ap.skill('autodrop', ad);
    if (ab !== null) ap.skill('autoburn', ab, 2);
    ap.lockOn(at);
  }, { adVersion, autoburn, heal, lock });
  await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 10000);
}

await st(() => { window.__ap?.archiveClear?.(); window.__ap?.saveClear?.(); });
await page.goto(`${BASE_URL}?debug&seed=3`, { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#titleReceive').click({ force: true });
await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);

// --- AUTODROP v1 on HALCYON: the arm button (playtest 1, plan §3.4.2: [G] arms one window; [L] is a plain press) ---------
{
  await arrive(2, { autodrop: 1, heal: true });
  const offered = await obeyUntil(() => / · or \[G\] AUTO$/.test(window.__ap.director().shown?.text ?? ''), 120000);
  check('v1 HALCYON: GET READY offers AUTODROP as a tail (`GET READY — LZ-… IN 0:0n · or [G] AUTO`)', offered, (await shown()).text);
  const button = await st(() => { const b = document.getElementById('pbGoBtn'); return { hidden: b?.hidden ?? true, text: b?.textContent ?? '' }; });
  check('…the POD BAY shows the arm button `AUTO · CENTRE [G]`', !button.hidden && button.text === 'AUTO · CENTRE [G]', JSON.stringify(button));
  await page.locator('#pbGoBtn').click();
  await page.waitForTimeout(300);
  const armed = (await autodrop()).state.armed;
  const label = await st(() => document.getElementById('pbGoBtn')?.textContent ?? '');
  check('…a click on it arms the window, and it reads what it waits for (`ARMED · LZ-… · n PODS`)', armed === 'centre'
    && /^ARMED · LZ-[A-D] · \d PODS?$/.test(label) && await logHas('^AUTODROP ARMED · LZ-[A-D] ×\\d · EACH POD DEAD CENTRE$'), `${armed} · ${label}`);
  const flew = await waitFor(() => window.__ap.store.getState().landing.pods.some((r) => r.fate.kind !== 'aboard' && r.fate.launch?.source === 'autodrop'), 40000);
  const bullseye = await waitFor(() => window.__ap.store.getState().log.entries.some((entry) => /LANDED · BULLSEYE$/.test(entry.text)), 20000);
  const flown = await waitFor(() => ['centre-done', 'landing-over'].includes(window.__ap.autodrop().state.end), 30000);
  check('…AUTODROP launches around the centre, and disarms once the window is flown', flew && flown, JSON.stringify(await pods()));
  check('…its pod lands BULLSEYE (`> podNN ... LANDED · BULLSEYE`)', bullseye);
  // [L] is a plain press: the next LAUNCH NOW launches by hand at once.
  const launchNow = await obeyUntil(() => /^LAUNCH NOW — press \[L\]/.test(window.__ap.director().shown?.text ?? ''), 120000);
  const before = await st(() => window.__ap.store.getState().landing.pods.filter((r) => r.fate.kind !== 'aboard' && r.fate.launch?.source === 'player').length);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(300);
  const after = await st(() => window.__ap.store.getState().landing.pods.filter((r) => r.fate.kind !== 'aboard' && r.fate.launch?.source === 'player').length);
  check('…[L] is a plain press: at `LAUNCH NOW — press [L] · … · or [G] AUTO` a pod leaves by hand at once', launchNow && after === before + 1
    && (await autodrop()).state.armed === null, `${before} → ${after}`);
}

// --- AUTODROP v2 on KESTREL: the POD BAY's [+], [G], TAB into the MIND, PASS DONE ----------------------------------------------
{
  await arrive(5, { autodrop: 2, heal: true });
  const rows = await waitFor(() => document.querySelectorAll('#pbPass .pb-pass-step[data-step="1"]').length > 0, 15000);
  const before = await st(() => window.__ap.autodrop().pass.map((row) => `${row.lz}:${row.want}`).join(' '));
  const minus = page.locator('#pbPass .pb-pass-step[data-step="-1"]:not([disabled])').first();
  if (await minus.count() > 0) await minus.click();
  const plus = page.locator('#pbPass .pb-pass-step[data-step="1"]:not([disabled])').first();
  if (await plus.count() > 0) await plus.click();
  await page.waitForTimeout(300);
  const after = await st(() => window.__ap.autodrop().pass.map((row) => `${row.lz}:${row.want}`).join(' '));
  check('v2 KESTREL: the POD BAY shows the pass rows (`A [−] n [+]`), and its buttons set the counts', rows, `${before} → ${after}`);
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(300);
  const armed = (await autodrop()).state.armed;
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  const inMind = await st(() => window.__ap.store.getState().ui.mode === 'memory');
  check('…[G] arms the pass (`AUTODROP ARMED · THIS PASS: …`), and TAB takes the kid into the MIND', armed === 'pass' && inMind
    && await logHas('^AUTODROP ARMED · THIS PASS: '), `armed ${armed} · mind ${inMind}`);
  // The pass ends PASS DONE, or (a pass that sends the last pods) the landing ends under it, every pod AUTODROP's.
  const done = await obeyUntil(() => ['pass-done', 'landing-over'].includes(window.__ap.autodrop().state.end), 240000);
  const flownInMind = await st(() => window.__ap.store.getState().ui.mode === 'memory');
  const flown = await pods();
  check('…the pass flies itself from the MIND and ends (`PASS DONE · …`, or the landing with its last pod)', done && flownInMind && flown.auto > 0
    && (await logHas('^PASS DONE · ') || (flown.aboard === 0 && flown.auto === flown.total)), JSON.stringify(flown));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
}

// --- AUTOBURN v3 on VESPER: [B] to the landing orbit ---------------------------------------------------------------------------
{
  await arrive(11, { autoburn: 3, heal: true, lock: { r: 5600, e: 0.03 } });
  const offered = await obeyUntil(() => /MOVE TO LANDING ORBIT/.test(window.__ap.director().shown?.text ?? ''), 60000);
  const head = await st(() => window.__ap.zonesHud().auto.head);
  const v3 = await st(() => window.__ap.v3());
  check('v3 VESPER: the strip offers `· [B] MOVE TO LANDING ORBIT`, the AUTO head names it', offered && /LANDING ORBIT/.test(head), `${(await shown()).text} · ${head}`);
  check('…the ghost circle\'s label (`LANDING ORBIT · EVERY LZ FITS · DROP ±… km · FUEL −…%`)', v3.aim !== null && /^LANDING ORBIT · /.test(v3.label ?? ''),
    `${v3.aim?.targetKm} · ${v3.label}`);
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(300);
  const engaged = await st(() => window.__ap.autoburn().auto.mode);
  const holds = await obeyUntil(() => window.__ap.autoburn().auto.holding, 240000);
  check('…[B] flies it there and it holds (`AUTOBURN v3: LANDING ORBIT — it holds it`)', engaged === 'landing-orbit' && holds
    && await said('AUTOBURN v3: LANDING ORBIT — it holds it'), `${engaged} · ${JSON.stringify(await st(() => window.__ap.autoburn().auto))}`);
}

// --- AUTODROP v3 on CORMORANT: the plan, [G], [F] per gap ----------------------------------------------------------------------
{
  await arrive(15, { autodrop: 3, heal: true });
  const table = await waitFor(() => document.querySelectorAll('#pbPlanRows .pb-plan-row').length > 0
    && /^PLAN · \d+ PASS/.test(document.getElementById('pbPlanCheck')?.textContent ?? ''), 15000);
  const checkLine = await st(() => document.getElementById('pbPlanCheck')?.textContent ?? '');
  check('v3 CORMORANT: the POD BAY\'s plan table and its check line count pods (`PLAN · n PASSES · A 6 · B 3 ✓`)', table
    && /^PLAN · \d+ PASS(ES)? · A \d+ · B \d+ ✓$/.test(checkLine), checkLine);
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(300);
  const armed = (await autodrop()).state.armed;
  check('…[G] arms the whole plan (`AUTODROP ARMED · THE PLAN: …`)', armed === 'plan' && await logHas('^AUTODROP ARMED · THE PLAN: '), String(armed));
  let skips = 0;
  const done = await obeyUntil(() => window.__ap.store.getState().landing.pods.every((r) => r.fate.kind === 'down'), 300000, async () => {
    const line = await shown();
    const skipping = await st(() => window.__ap.store.getState().clock.skipWarp !== null);
    if (!skipping && (line.keys ?? []).includes('F')) skips++;
  });
  const tally = await pods();
  // The plan's last row is the landing's last pod: the landing ends under it ('landing-over'), no PLAN DONE to say.
  check('…it lands every pod by the plan, with an [F] per gap, and the landing ends under it', done && tally.auto === tally.total && tally.down === tally.total && skips >= 1
    && ['plan-done', 'landing-over'].includes((await autodrop()).state.end), `${JSON.stringify(tally)} · ${skips} [F] · end ${(await autodrop()).state.end}`);
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(browser);
