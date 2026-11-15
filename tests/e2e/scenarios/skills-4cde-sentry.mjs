// Slices 4c–4e, the SENTRY half of slice-4cde-plan §8.5 (disguised seeds and SENTRY v1–v3), in the page. The landing half
// (AUTODROP, AUTOBURN v3) is skills-4cde-landing.mjs.
// • A decoy in the MIND (KESTREL, `__ap.seed('Telemetry', { disguise: 'cache.tmp' })`, no SENTRY): the strip draws a unit file
//   named cache.tmp (no hollow chip), INSPECT says `cache.tmp · AI · Tool · INTACT` with ◎ re-scan; with MOVE, COPY or
//   SCAN in hand it lights valid exactly as Autopilot does, and REPAIR's hover says ALREADY 100% on both (review B1).
// • SCAN unmasks it: `> scan cache.tmp ... NOT A FILE · A SEED`, the NOT A FILE stamp, and the strip draws it as a seed.
// • DELETE without a SCAN on another decoy: its own confirm (`DELETE CORE.DMP?`), then `IT WAS A SEED · +2 FREE` and the stamp.
// • MOVE on a third decoy (review B1): picked as a source, placed in free space, the op unmasks it (`> move swap.idx ... NOT A
//   FILE · A SEED`), and it stays where it was.
// • SENTRY v2: with DELETE in hand HOLLOW's blinking outline is aimable, a click arms it (`PRE-EMPTED` as the seed lands, the
//   echo `> rm seed 0x… ... PRE-EMPTED`, no seed in memory). Armed again and SENTRY dropped to v1, the outline is no longer
//   drawn armed (review m8) and the seed lands.
// • SENTRY v3 at the boot of the next ship (VESPER): `> SENTRY: FIREWALL.sys COMPILED`, a FIREWALL.sys on the strip.
// Usage: node tests/e2e/scenarios/skills-4cde-sentry.mjs (env E2E_BASE_URL; tests/e2e/run.mjs runs it).
// Shots: tests/.out/e2e/shots/sentry-*.
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit } from '../lib.mjs';
import { join } from 'node:path';

const browser = await launch();
const { check, finish } = checker();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const kit = pageKit(page);
const { st, waitFor, errors } = kit;
const run = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `sentry-${name}.png`) });

await page.goto(`${BASE_URL}?debug&seed=4`, { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// Every stamp slammed from here on, in order (they fade within a second).
await st(() => {
  window.__stamps = [];
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof HTMLElement && node.classList.contains('stamp')) window.__stamps.push(node.textContent);
  }))).observe(document.getElementById('stampLayer'), { childList: true });
});
const stamps = () => st(() => window.__stamps.slice());
const logHas = (text) => st((line) => window.__ap.store.getState().log.entries.some((entry) => entry.text === line), text);
const lastLog = (n = 3) => st((count) => window.__ap.store.getState().log.entries.slice(-count).map((entry) => entry.text).join(' | '), n);
const opsDone = () => waitFor(() => window.__ap.ops().length === 0, 15000);
const segClass = (id) => st((segId) => document.querySelector(`.seg[data-id="${segId}"]`)?.className ?? null, id);
const hold = async (kind) => {
  if ((await st(() => window.__ap.store.getState().ui.activeTool?.kind ?? null)) !== kind) await page.locator(`#chip-${kind}`).click();
  await page.waitForTimeout(250);
};
const drop = async () => {
  if ((await st(() => window.__ap.store.getState().ui.activeTool)) !== null) await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};
const clickSeg = (id) => page.locator(`.seg[data-id="${id}"]`).first().click();

// --- KESTREL, no SENTRY: a decoy behind Telemetry ---------------------------------------------------------------------
await page.locator('#titleReceive').click();
await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
await st(() => window.__ap.ship(2));
await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
await run.lockInRing();
await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 20000);
const setup = await st(() => {
  const ap = window.__ap;
  for (const kind of ['scan', 'delete', 'move', 'copy', 'repair']) {
    if (!ap.store.getState().run.licences.includes(kind)) ap.install(kind);
  }
  // KESTREL's PATH UNCERTAIN (Sensor Interp) fixed first, so the strip is the MIND's.
  ap.setIntegrity('sensor', 100);
  const decoy = ap.seed('Telemetry', { disguise: 'cache.tmp' });
  ap.setMode('memory');
  const real = ap.store.getState().memory.find((seg) => seg.role === 'autopilot');
  return { decoy, real: real.id, realName: real.name };
});
await page.waitForTimeout(600);
{
  const look = await st((id) => {
    const part = document.querySelector(`.seg[data-id="${id}"]`);
    return { cls: part?.className ?? null, name: part?.querySelector('.seg-name')?.textContent ?? part?.title ?? null };
  }, setup.decoy);
  check('a decoy in the MIND: the strip draws a unit file named cache.tmp, not a hollow chip', look.cls !== null && !/\bhollow\b/.test(look.cls)
    && look.name === 'cache.tmp', JSON.stringify(look));
  await st((id) => window.__ap.store.update((d) => { d.ui.selectedId = id; }), setup.decoy);
  await page.waitForTimeout(300);
  const inspect = await st(() => [...document.querySelectorAll('.detail-title, .detail-type, .detail-row .v, .action-btn')].map((node) => node.textContent.trim()));
  check('…INSPECT shows it as a healthy unit file: cache.tmp, AI · Tool, 2 blocks, INTACT, ◎ re-scan', inspect[0] === 'cache.tmp' && inspect[1] === 'AI · Tool'
    && inspect[2] === '2 blocks' && inspect[3] === 'INTACT' && inspect.some((text) => text.startsWith('◎ re-scan')), JSON.stringify(inspect));
  await shot('01-decoy');
  // Review B1: each tool lights the decoy as it lights Autopilot.
  const lit = {};
  for (const kind of ['move', 'copy', 'scan', 'repair']) {
    await hold(kind);
    lit[kind] = { decoy: /valid-target/.test(await segClass(setup.decoy)) && !/invalid-target/.test(await segClass(setup.decoy)),
      real: /valid-target/.test(await segClass(setup.real)) && !/invalid-target/.test(await segClass(setup.real)) };
  }
  await drop();
  check(`…MOVE, COPY and SCAN light it valid and REPAIR invalid, exactly as ${setup.realName} (review B1)`, Object.values(lit).every((pair) => pair.decoy === pair.real)
    && lit.move.decoy && lit.copy.decoy && lit.scan.decoy && !lit.repair.decoy, JSON.stringify(lit));
}

// SCAN unmasks it.
{
  await hold('scan');
  await clickSeg(setup.decoy);
  await page.waitForTimeout(200);
  await opsDone();
  await page.waitForTimeout(400);
  const echo = '> scan cache.tmp ... NOT A FILE · A SEED';
  check(`SCAN unmasks it: \`${echo}\`, the NOT A FILE stamp, and the strip draws a seed now`, await logHas(echo) && (await stamps()).includes('NOT A FILE')
    && /\bhollow\b/.test(await segClass(setup.decoy) ?? ''), `${await lastLog()} · ${JSON.stringify(await stamps())}`);
  await shot('02-scanned');
  await drop();
}

// DELETE without a SCAN, on another decoy: its own confirm, then IT WAS A SEED.
{
  const second = await st(() => window.__ap.seed('Autopilot', { disguise: 'core.dmp' }));
  await page.waitForTimeout(300);
  await hold('delete');
  await clickSeg(second);
  const asked = await waitFor(() => !document.getElementById('inlineConfirm').hidden, 3000);
  const question = await st(() => document.getElementById('inlineConfirmQuestion').innerText);
  await page.locator('#inlineConfirmYes').click({ force: true });
  await page.waitForTimeout(200);
  await opsDone();
  await page.waitForTimeout(300);
  const echo = '> delete core.dmp ... IT WAS A SEED · +2 FREE';
  const said = await st(() => window.__ap.store.getState().log.entries.some((entry) => entry.text.startsWith('> delete core.dmp') || entry.text.startsWith('> rm seed')));
  check(`DELETE without a SCAN: its own confirm \`${question}\`, then \`${echo}\` (or the seed's words), the IT WAS A SEED stamp, gone`,
    asked && question === 'DELETE CORE.DMP?' && said && (await stamps()).includes('IT WAS A SEED')
    && !(await st((id) => window.__ap.store.getState().memory.some((seg) => seg.id === id), second)), `${await lastLog()} · ${JSON.stringify(await stamps())}`);
  await drop();
}

// MOVE on a third decoy (review B1): the op takes it as a source and unmasks it as it completes; nothing moves.
{
  const third = await st(() => window.__ap.seed('Autopilot', { disguise: 'swap.idx' }));
  await page.waitForTimeout(300);
  const addrOf = (id) => st((segId) => {
    const memory = window.__ap.store.getState().memory;
    let addr = 0;
    for (const seg of memory) { if (seg.id === segId) return addr; addr += seg.size; }
    return null;
  }, id);
  const before = await addrOf(third);
  await hold('move');
  await clickSeg(third);
  await page.waitForTimeout(250);
  const picked = await st(() => window.__ap.store.getState().ui.pickedSourceId);
  const freeId = await st(() => window.__ap.store.getState().memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined)
    .sort((a, b) => b.size - a.size)[0]?.id ?? null);
  const parts = page.locator(`.seg[data-id="${freeId}"]`);
  const boxes = [];
  for (let i = 0; i < await parts.count(); i++) boxes.push(await parts.nth(i).boundingBox());
  const box = boxes.filter(Boolean).sort((a, b) => b.width - a.width)[0];
  await page.mouse.move(box.x + box.width * 0.5 - 20, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await opsDone();
  await page.waitForTimeout(300);
  const echo = '> move swap.idx ... NOT A FILE · A SEED';
  check(`MOVE on a decoy: picked as a source, placed, the op unmasks it (\`${echo}\`, NOT A FILE) and it stays where it was (review B1)`,
    picked === third && await logHas(echo) && (await addrOf(third)) === before && /\bhollow\b/.test(await segClass(third) ?? ''),
    `${picked} ${before}→${await addrOf(third)} · ${await lastLog()}`);
  await drop();
}

// --- SENTRY v2 QUICK RM: the pre-empt on HOLLOW's blinking outline ---------------------------------------------------------
const nextTelegraph = () => st(() => {
  window.__ap.store.update((d) => {
    d.hollow.cfg.seed = { everySec: 50, firstAfterSec: 30, target: 'walls' };
    d.hollow.cfg.spreadEverySec = null;
    d.hollow.phase = 'awake';
    d.hollow.seedInSec = 0;
    d.hollow.seedMoments = Math.max(1, d.hollow.seedMoments);
  });
});
// A telegraph lasts SEED_TELEGRAPH_SEC (2 AI s); the steps between its start and the click on it (the chip, the outline's
// box, the mouse) take longer than that on a loaded machine. Its clock is held at 30 AI s from the moment it is seen, in
// the same evaluation, and let go (0.3 AI s left) once what it looks like armed has been read.
const telegraphHeld = (maxMs) => waitFor(() => {
  const s = window.__ap.store.getState();
  if (s.hollow.seedTelegraph === null) return false;
  window.__ap.store.update((d) => { d.hollow.seedTelegraph.leftSec = 30; });
  return true;
}, maxMs, 50);
const telegraphLetGo = () => st(() => window.__ap.store.update((d) => { if (d.hollow.seedTelegraph) d.hollow.seedTelegraph.leftSec = Math.min(d.hollow.seedTelegraph.leftSec, 0.3); }));
const outline = () => st(() => {
  const marks = [...document.querySelectorAll('.hollow-mark.seed-telegraph')];
  return { n: marks.length, aimable: marks.some((m) => m.classList.contains('aimable')), armed: marks.some((m) => m.classList.contains('armed')) };
});
{
  await st(() => window.__ap.skill('sentry', 2));
  await page.waitForTimeout(300);
  await nextTelegraph();
  const blinking = await telegraphHeld(5000);
  await hold('delete');
  await page.waitForTimeout(150);
  const before = await outline();
  const addr = await st(() => window.__ap.store.getState().hollow.seedTelegraph?.startAddr ?? null);
  const mark = page.locator('.hollow-mark.seed-telegraph').first();
  const box = await mark.boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  const armedLook = await outline();
  // Read the state before the screenshot: under load the seed can land while the shot is taken.
  const preempted = await st(() => window.__ap.store.getState().hollow.seedTelegraph?.preempted === true);
  await shot('03-preempt-armed');
  await telegraphLetGo();
  await waitFor(() => window.__ap.store.getState().hollow.seedTelegraph === null, 10000, 50);
  await page.waitForTimeout(400);
  const echo = `> rm seed 0x${addr?.toString(16).toUpperCase().padStart(3, '0')} ... PRE-EMPTED`;
  const echoed = await st(() => window.__ap.store.getState().log.entries.some((entry) => /^> rm seed .* \.\.\. PRE-EMPTED$/.test(entry.text)));
  check('SENTRY v2: with DELETE in hand the outline is aimable; a click arms it (drawn armed)', blinking && before.aimable && preempted && armedLook.armed,
    JSON.stringify({ blinking, before, armedLook, preempted }));
  check(`…as the seed lands it is freed: \`${echo}\`, the PRE-EMPTED stamp`, echoed && (await stamps()).includes('PRE-EMPTED'), `${await lastLog()} · ${JSON.stringify(await stamps())}`);

  // Review m8: armed, then SENTRY falls to v1: the outline is no longer drawn armed, and the seed lands as usual.
  await nextTelegraph();
  await telegraphHeld(5000);
  await hold('delete');
  const again = await st(() => window.__ap.preempt());
  await page.waitForTimeout(150);
  const armedAgain = await outline();
  await st(() => window.__ap.skill('sentry', 1));
  await page.waitForTimeout(250);
  const fallen = await outline();
  check('…armed again, then SENTRY down to v1: the outline is no longer drawn armed (review m8)', again === null && armedAgain.armed
    && fallen.n > 0 && !fallen.armed && (await st(() => window.__ap.store.getState().hollow.seedTelegraph?.preempted === true)),
    JSON.stringify({ again, armedAgain, fallen }));
  await telegraphLetGo();
  await drop();
}

// --- SENTRY v3 FIREWALL at the next boot (VESPER) --------------------------------------------------------------------------
{
  await st(() => window.__ap.skill('sentry', 3));
  await st(() => window.__ap.ship(3));
  const booted = await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 60000, 200);
  const line = '> SENTRY: FIREWALL.sys COMPILED';
  const firewalls = await st(() => window.__ap.store.getState().memory.filter((seg) => seg.type === 'firewall').map((seg) => seg.name));
  check(`SENTRY v3 at VESPER's boot: \`${line}\`, a FIREWALL.sys in memory`, booted && await logHas(line) && firewalls.length >= 1,
    `${JSON.stringify(firewalls)} · ${await lastLog(6)}`);
  await st(() => window.__ap.setMode('memory'));
  await page.waitForTimeout(500);
  await shot('04-firewall');
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(browser);
