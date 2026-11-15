// Slice 6, SURVEY in the page (slice-6-plan §7.4, the review fixes' e2e): run 1's arm on seed 7, CORMORANT (slot 15: POOR, LZ-A
// 5 pods on a FLAT guess, LZ-B 4 pods on a ROCKY one; SITE 5 WIDE FLAT ROOM 6, SITE 4 a wreck), reached by ?debug's __ap.route
// along the worked route [0, 2, 5, 11, 15]. Each part re-arrives there and quiets the ship (HOLLOW asleep, the beam's seeds
// freed, drivers and Thrust Ctrl healed) so the strip shows the ship's own rows.
// • No SURVEY: the boot's `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`, CONTROL's `Landing sites are estimates.` in
//   COMMS, the SITES window open by itself on CONTROL's guesses (`UNSURVEYED`); locked at once (__ap.lockOn), the kid launches
//   [L] in LZ-B's window ([F] between): the first pod down on LZ-B lands hard, the stamp `LZ-B · ROCKY ✕`, CONTROL's `LZ-B is a
//   little rocky :)`, the echo's tail; the LANDING REPORT's LZ-B row ends `· ROCKY · n HARD`.
// • SURVEY v2 (__ap.skill): SITES says it maps and holds a thread, MAPPED % climbs as the ship flies; the NAV PLOT draws the
//   swath's wedge and, once found, the sites' dashed brackets; [ PAUSE ] gives the thread back and [ RESUME ] takes it; with the
//   rim mapped (__ap.survey.map) the rows are rated (★, `ROCKY ✕` on LZ-B), the strip offers `SET SITE 5 AS LZ-B`; a click on
//   SITE 5's row and its `SET AS LZ-B (800)` pill moves LZ-B (the stamp `LZ-B → SITE 5`, its row `LZ-B · SITE 5 · … FLAT ★★★`);
//   at the DESK the window and its dock item are gone.
// • The phone (360 × 740): the SITES tab in the dock, its window alone, a row tapped opens its pills, nothing wider than the
//   page; at the DESK the tab is gone.
// • Playtest 1, C-SITES (note 18), at 1440 × 900 and the phone's 390 × 844: with LZ-A and LZ-B each pinned by a pod, SITE 5's
//   pills are refused and `OPEN AS LZ-C (1,200)` is offered; a click on a refused pill flashes its reason on the strip; the
//   OPEN pill opens LZ-C; the held [F] stops at LZ-C's window, a pod lands there in plan, and the report says `OPENED ON SITE 5`.
// Usage: node tests/e2e/scenarios/survey.mjs   (env E2E_BASE_URL; tests/e2e/run.mjs runs it)
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, holdKey } from '../lib.mjs';
import { join } from 'node:path';

const ROUTE = [0, 2, 5, 11, 15];
const { check, finish } = checker();
const browser = await launch();

// A page on seed 7 with a fresh archive and save, the title received, the first ship flying.
async function openGame(contextOpts) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const kit = pageKit(page);
  await page.goto(`${BASE_URL}?debug&seed=7`, { waitUntil: 'networkidle' });
  await kit.st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#titleReceive').click({ force: true });
  await kit.waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
  await kit.st(() => window.__ap.skipBoot());
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  // Every stamp the page shows, kept (a later stamp replaces the one on screen); only the stamp layer is watched.
  await kit.st(() => {
    window.__e2eStamps = [];
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('stamp')) window.__e2eStamps.push(node.textContent);
    }).observe(document.getElementById('stampLayer'), { childList: true });
  });
  return { context, page, ...kit };
}

// CORMORANT from its boot (__ap.route), `skill` SURVEY's version given at the boot (null: none), the boot played out, the
// ship quieted. Returns the boot's log lines.
async function arrive({ st, waitFor }, skill) {
  const from = await st(() => window.__ap.log().at(-1)?.id ?? 0);
  await st((route) => window.__ap.route(route), ROUTE);
  await waitFor(() => window.__ap.store.getState().run.phase === 'boot', 10000);
  if (skill !== null) await st((v) => window.__ap.skill('survey', v), skill);
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight' || (window.__ap.skipBoot(), false), 30000);
  await st(() => {
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
      for (const seg of draft.memory) if ('integrity' in seg && (seg.type === 'driver' || seg.role === 'thrust-ctrl')) seg.integrity = 100;
      draft.ui.memoryRev++;
    });
  });
  return st((id) => window.__ap.log().filter((entry) => entry.id > id).map((entry) => entry.text), from);
}

const sites = (st) => st(() => {
  const win = document.getElementById('sitesWin');
  // A row as the kid reads it: its words, then its ground at the right edge (two spans: `… · WIDE` and `FLAT ★★★`).
  const rows = (sel) => [...win.querySelectorAll(`${sel} .sw-row`)].map((row) => [...row.children].map((span) => span.textContent).join(' · ').replace(/\s+/g, ' ').trim());
  return {
    shown: !win.hidden && win.getBoundingClientRect().width > 0, header: win.querySelector('.sw-title')?.textContent ?? '',
    status: win.querySelector('.sw-status')?.textContent ?? '', pause: win.querySelector('.sw-pause')?.hidden === false ? win.querySelector('.sw-pause').textContent : null,
    lzs: rows('.sw-lzs'), sites: rows('.sw-sites'), pills: [...win.querySelectorAll('.sw-pill')].map((pill) => ({ lz: pill.dataset.lz, text: pill.textContent, disabled: pill.disabled })),
  };
});

// --- 1. No SURVEY: the first touchdown on LZ-B shows its ROCKY ground ---------------------------------------------------------
{
  const game = await openGame({ viewport: { width: 1440, height: 900 } });
  const { page, st, waitFor, errors } = game;
  const boot = await arrive(game, null);
  check('no SURVEY: CORMORANT\'s boot types `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`',
    boot.includes('> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs'), boot.filter((line) => /SITE/.test(line)).join(' | '));
  const quip = await waitFor(() => document.getElementById('commsLog').innerText.includes('Landing sites are estimates.'), 15000);
  check('…CONTROL says `Landing sites are estimates.` in COMMS', quip);
  const opened = await waitFor(() => !document.getElementById('sitesWin').hidden, 5000);
  const view = await sites(st);
  check('…the SITES window opens by itself on CONTROL\'s guesses: `NO SURVEY`, both LZs `UNSURVEYED`',
    opened && /^NO SURVEY/.test(view.status) && view.lzs.length === 2 && view.lzs.every((row) => row.endsWith('UNSURVEYED')), JSON.stringify(view));
  await st(() => window.__ap.lockOn());
  await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 10000);
  // The kid launches in LZ-B's window and holds [F] between (while the strip offers it), until a pod is down on LZ-B.
  const fKey = holdKey(page, 'KeyF');
  const lzBDown = () => window.__ap.store.getState().landing.pods.some((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === 'LZ-B');
  const end = Date.now() + 240000;
  let pressedIn = null;
  while (Date.now() < end && !(await st(lzBDown))) {
    const now = await st(() => {
      const s = window.__ap.store.getState();
      return { window: s.landing.window?.lz ?? null, falling: s.landing.pods.some((r) => r.fate.kind === 'falling'), held: window.__ap.fastForward().held,
        keys: window.__ap.director().shown?.keys ?? [], rev: s.landing.pods.filter((r) => r.fate.kind !== 'aboard').length };
    });
    if (now.window === 'LZ-B' && !now.falling && pressedIn !== now.rev) { await fKey.set(false); await page.keyboard.press('KeyL'); pressedIn = now.rev; }
    else await fKey.set(now.window === null && now.keys.includes('F'), now.held);
    await page.waitForTimeout(200);
  }
  await fKey.set(false);
  const shown = await st(() => ({
    reveals: window.__ap.survey().reveals, stamps: window.__e2eStamps, comms: document.getElementById('commsLog').innerText,
    tail: window.__ap.log().filter((entry) => / · LZ-B IS ROCKY$/.test(entry.text)).map((entry) => entry.text),
    touch: window.__ap.store.getState().landing.pods.flatMap((r) => (r.fate.kind === 'down' && r.fate.touchdown.lz === 'LZ-B' ? [r.fate.touchdown.touch] : [])),
  }));
  check('…the first pod down on LZ-B lands hard and shows its ground (revealed by touchdown)',
    shown.touch[0] === 'hard' && JSON.stringify(shown.reveals) === '[{"site":"guess-B","by":"touchdown"}]', JSON.stringify({ touch: shown.touch, reveals: shown.reveals }));
  check('…the stamp `LZ-B · ROCKY ✕`', shown.stamps.includes('LZ-B · ROCKY ✕'), shown.stamps.join(' | '));
  check('…PAL says `LZ-B is a little rocky :)` in COMMS', await waitFor(() => document.getElementById('commsLog').innerText.includes('LZ-B is a little rocky :)'), 15000));
  check('…the echo carries the tail (`> podNN ... LANDED · HARD · LZ-B IS ROCKY`)', shown.tail.length === 1 && /^> pod\d\d \.\.\. LANDED · HARD · LZ-B IS ROCKY$/.test(shown.tail[0]), shown.tail.join(' | '));
  const lzBRow = await st(() => document.querySelector('#sitesWin .sw-lzs .sw-row:nth-child(2)')?.textContent ?? '');
  check('…SITES\'s LZ-B row now reads `ROCKY ✕`', /ROCKY ✕$/.test(lzBRow.replace(/\s+/g, ' ').trim()), lzBRow);
  await page.screenshot({ path: join(SHOTS, 'survey-1-reveal.png') });
  const reportOk = await runKit(page, game).landToReport();
  await page.waitForTimeout(1500);
  const report = await st(() => [...document.querySelectorAll('#lrRows .lr-row')].map((row) => row.innerText.replace(/\s+/g, ' ')));
  check('…the LANDING REPORT\'s LZ-B row ends `· ROCKY · n HARD`', reportOk && report.some((row) => /LZ-B .* · ROCKY · \d+ HARD/.test(row)), report.join(' | '));
  check('no SURVEY: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await game.context.close();
}

// --- 2. SURVEY v2: SITES maps, rates, and moves LZ-B by its pill; the NAV PLOT's wedge and brackets ------------------------
{
  const game = await openGame({ viewport: { width: 1440, height: 900 } });
  const { page, st, waitFor, errors } = game;
  await arrive(game, 2);
  // SITES opens itself at the first find (SITES_AUTO_OPEN); the dock opens it otherwise (a second click would close it).
  await page.waitForTimeout(600);
  if (await st(() => document.getElementById('sitesWin').hidden)) await page.locator('.dock-item[data-tool="sites"]').click();
  await page.waitForTimeout(400);
  const first = await sites(st);
  const survey = await st(() => window.__ap.survey());
  check('v2: SITES says SURVEY maps and holds a thread (`SURVEY v2 · MAPPING · HOLDS A THREAD`), [ PAUSE ] offered',
    first.shown && first.status === 'SURVEY v2 · MAPPING · HOLDS A THREAD' && first.pause === '[ PAUSE ]' && survey.claimed && survey.version === 2,
    JSON.stringify({ status: first.status, pause: first.pause, claimed: survey.claimed }));
  const pctOf = (header) => Number(/MAPPED (\d+)%/.exec(header)?.[1] ?? NaN);
  const climbed = await waitFor((p) => Number(/MAPPED (\d+)%/.exec(document.querySelector('#sitesWin .sw-title')?.textContent ?? '')?.[1] ?? -1) > p, 30000, 250, pctOf(first.header));
  check(`…MAPPED % climbs as the ship flies (from ${pctOf(first.header)}%)`, climbed, (await sites(st)).header);
  const wedge = await st(() => {
    const node = document.querySelector('#navplotSvg .np-swath');
    return node !== null && node.style.display !== 'none' && (node.getAttribute('d') ?? '').length > 0 && node.getBoundingClientRect().width > 0;
  });
  check('…the NAV PLOT draws the swath\'s wedge', wedge);
  await page.locator('#sitesWin .sw-pause').click();
  await page.waitForTimeout(300);
  const paused = { view: await sites(st), survey: await st(() => window.__ap.survey()) };
  await page.locator('#sitesWin .sw-pause').click();
  await page.waitForTimeout(300);
  const resumed = await st(() => window.__ap.survey());
  check('…[ PAUSE ] gives the thread back (`PAUSED · ITS THREAD IS FREE`), [ RESUME ] takes it again',
    paused.survey.paused && !paused.survey.claimed && /PAUSED · ITS THREAD IS FREE$/.test(paused.view.status) && paused.view.pause === '[ RESUME ]'
    && !resumed.paused && resumed.claimed, JSON.stringify({ status: paused.view.status, resumed }));
  await st(() => window.__ap.survey.map(100));
  await page.waitForTimeout(600);
  const rated = await sites(st);
  const brackets = await st(() => [...document.querySelectorAll('#navplotSvg .np-site[data-site]')].filter((node) => node.style.display !== 'none' && node.getBoundingClientRect().width > 0).map((node) => node.dataset.site));
  check('…with the rim mapped every row is rated: LZ-B `ROCKY ✕`, SITE 5 `WIDE · FLAT ★★★`, the wreck\'s words',
    /ROCKY ✕$/.test(rated.lzs[1] ?? '') && rated.sites.some((row) => /^SITE 5 · ROOM 1,200 · WIDE · FLAT ★★★$/.test(row)) && rated.sites.some((row) => /WRECKAGE · AN OLD POD\. NOT OURS\./.test(row))
    && /PLANET MAPPED · 4 SITES$/.test(rated.status), JSON.stringify(rated));
  check(`…the NAV PLOT draws the found sites' dashed brackets (${brackets.join(', ')})`, brackets.includes('site-5') && brackets.length >= 4, brackets.join(', '));
  // The strip's hint row waits for the flight's own rows (the approach's burn lines outrank it): it shows in the orbit.
  await st(() => window.__ap.lockOn());
  const strip = await waitFor(() => /SET SITE 5 AS LZ-B/.test(window.__ap.director().shown?.text ?? ''), 20000);
  check('…the strip offers the swap (`LZ-B IS ROCKY ✕ — SITES: SET SITE 5 AS LZ-B`)', strip, await st(() => window.__ap.director().shown?.text ?? ''));
  await page.screenshot({ path: join(SHOTS, 'survey-2-rated.png') });
  await page.locator('#sitesWin .sw-row[data-site="site-5"]').click();
  await page.waitForTimeout(300);
  const picked = await sites(st);
  const pill = picked.pills.find((one) => one.lz === 'LZ-B');
  check('…a click on SITE 5\'s row opens its pills: `SET AS LZ-B (800)`', pill?.text === 'SET AS LZ-B (800)' && pill.disabled === false, JSON.stringify(picked.pills));
  await page.locator('#sitesWin .sw-pill[data-lz="LZ-B"]').click();
  await page.waitForTimeout(500);
  const moved = { view: await sites(st), lz: await st(() => window.__ap.store.getState().landing.lzs.find((lz) => lz.label === 'LZ-B')), stamps: await st(() => window.__e2eStamps) };
  check('…the pill moves LZ-B to SITE 5: the stamp `LZ-B → SITE 5`, its row `LZ-B · SITE 5 · 4 PODS · WIDE · FLAT ★★★`',
    moved.lz.site === 'site-5' && moved.stamps.includes('LZ-B → SITE 5') && moved.view.lzs[1] === 'LZ-B · SITE 5 · 4 PODS · WIDE · FLAT ★★★', JSON.stringify(moved));
  check('…PAL: `You moved LZ-B? Bold! :)`', await waitFor(() => document.getElementById('commsLog').innerText.includes('You moved LZ-B? Bold! :)'), 15000));
  await page.screenshot({ path: join(SHOTS, 'survey-2-moved.png') });
  // Off the planet (the LANDING REPORT, then the DESK): the window and its dock item go (review Tests 6).
  const kit2 = runKit(page, game);
  await kit2.landToReport();
  await kit2.finishReport();
  // Playtest 1 (note 5): LEAVE ORBIT comes first.
  await kit2.leaveOrbit(0);
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk', 8000);
  const gone = await st(() => ({ win: document.getElementById('sitesWin').hidden, survey: document.body.classList.contains('survey'),
    dock: getComputedStyle(document.querySelector('.dock-item[data-tool="sites"]')).display }));
  check('…at the DESK the SITES window and its dock item are gone', gone.win && !gone.survey && gone.dock === 'none', JSON.stringify(gone));
  check('v2: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await game.context.close();
}

// --- 3. The phone: the SITES tab ----------------------------------------------------------------------------------------------
{
  const game = await openGame({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const { page, st, errors } = game;
  await arrive(game, 1);
  await st(() => window.__ap.survey.map(100));
  const tab = page.locator('.dock-item[data-tool="sites"]');
  await tab.scrollIntoViewIfNeeded();
  await tab.tap();
  await page.waitForTimeout(400);
  const alone = await st(() => [...document.querySelectorAll('.desktop > .tools-view > .window')].filter((win) => !win.hidden).map((win) => win.id));
  check('phone: the dock\'s SITES tab shows its window alone', alone.length === 1 && alone[0] === 'sitesWin', alone.join(', '));
  await page.locator('#sitesWin .sw-row[data-site="site-5"]').tap();
  await page.waitForTimeout(400);
  const layout = await st(() => {
    const win = document.getElementById('sitesWin').getBoundingClientRect();
    const pills = [...document.querySelectorAll('#sitesWin .sw-pill')].map((pill) => pill.getBoundingClientRect());
    const wide = [...document.querySelectorAll('#sitesWin *')].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1).length;
    return { win: { left: win.left, right: win.right }, pills: pills.length, pillsIn: pills.every((r) => r.left >= win.left - 1 && r.right <= win.right + 1),
      wide, scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
  });
  check('phone: a tapped row opens its pills, inside the window; nothing wider than the page (no sideways scroll)',
    layout.pills === 2 && layout.pillsIn && layout.wide === 0 && layout.scroll <= layout.inner, JSON.stringify(layout));
  await page.screenshot({ path: join(SHOTS, 'survey-3-phone.png') });
  await st(() => window.__ap.lockOn());
  const kit3 = runKit(page, game);
  await kit3.landToReport();
  await kit3.finishReport();
  await game.waitFor(() => window.__ap.store.getState().run.phase === 'leave', 10000);
  await st(() => { const offer = window.__ap.draft().offer; if (offer.length > 0) window.__ap.pick(offer[0].id); window.__ap.leave(); });
  await game.waitFor(() => window.__ap.store.getState().run.phase === 'desk', 8000);
  const closed = await st(() => ({ win: document.getElementById('sitesWin').hidden, dock: getComputedStyle(document.querySelector('.dock-item[data-tool="sites"]')).display }));
  check('phone: at the DESK the SITES tab and its window are gone', closed.win && closed.dock === 'none', JSON.stringify(closed));
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await game.context.close();
}

// --- 4. Playtest 1, C-SITES (Fran's note 18): open a found site as a new LZ, and land a pod there ----------------------------
// SURVEY v2, the rim mapped, locked at once; the kid lands one pod in LZ-A and one in LZ-B (both pinned: `pods-down`). SITE 5's
// pills: LZ-A's and LZ-B's refused, then `OPEN AS LZ-C (1,200)`. A click on LZ-B's refused pill flashes its reason on the strip
// (`LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C`); the OPEN pill opens LZ-C (the stamp `LZ-C → SITE 5`, its SITES row); hold [F]
// stops at LZ-C's window, [L] lands a pod there, and the LANDING REPORT's row reads `LZ-C … · OPENED ON SITE 5`. At the
// desktop's 1440 × 900 and the phone's 390 × 844 (the SITES tab), shots `survey-4-<size>-*.png`.
async function openSitePart(contextOpts, size) {
  const phone = contextOpts.isMobile === true;
  const game = await openGame(contextOpts);
  const { page, st, waitFor, errors } = game;
  const tap = (locator) => (phone ? locator.tap() : locator.click());
  await arrive(game, 2);
  await st(() => window.__ap.survey.map(100));
  await st(() => window.__ap.lockOn());
  await waitFor(() => window.__ap.store.getState().run.phase === 'landing', 10000);
  // One pod into each of LZ-A and LZ-B ([F] held between, while the strip offers it).
  const fKey = holdKey(page, 'KeyF');
  const pinned = () => {
    const s = window.__ap.store.getState();
    const down = (lz) => s.landing.pods.some((r) => r.fate.kind === 'down' && r.fate.touchdown.lz === lz);
    return down('LZ-A') && down('LZ-B') && !s.landing.pods.some((r) => r.fate.kind === 'falling') && s.landing.window === null;
  };
  const end = Date.now() + 240000;
  while (Date.now() < end && !(await st(pinned))) {
    const now = await st(() => {
      const s = window.__ap.store.getState();
      const lz = s.landing.window?.lz ?? null;
      return { lz, falling: s.landing.pods.some((r) => r.fate.kind === 'falling'), held: window.__ap.fastForward().held,
        keys: window.__ap.director().shown?.keys ?? [], text: window.__ap.director().shown?.text ?? '',
        has: lz !== null && s.landing.pods.some((r) => r.fate.kind !== 'aboard' && (r.fate.launch?.aimLz === lz)) };
    });
    // [L] only once the strip says so (the dot inside the bracket): an early [L] asks `DOT OFF-SITE · LAUNCH ANYWAY?`.
    if ((now.lz === 'LZ-A' || now.lz === 'LZ-B') && !now.falling && !now.has) {
      await fKey.set(false);
      if (/press \[L\]/.test(now.text)) { await page.keyboard.press('KeyL'); await page.waitForTimeout(400); }
    } else await fKey.set(now.lz === null && now.keys.includes('F'), now.held);
    await page.waitForTimeout(200);
  }
  await fKey.set(false);
  const isPinned = await st(pinned);
  check(`${size}: one pod down in LZ-A and one in LZ-B, the landing goes on`, isPinned,
    await st(() => JSON.stringify({ shown: window.__ap.director().shown?.text, pods: window.__ap.store.getState().landing.pods.map((r) => r.fate.kind) })));
  if (!isPinned) { await page.screenshot({ path: join(SHOTS, `survey-4-${size}-0-stuck.png`) }); await game.context.close(); return; }
  // SITES: SITE 5's pills.
  if (phone) {
    const tab = page.locator('.dock-item[data-tool="sites"]');
    await tab.scrollIntoViewIfNeeded();
    await tab.tap();
  } else if (await st(() => document.getElementById('sitesWin').hidden)) await page.locator('.dock-item[data-tool="sites"]').click();
  await page.waitForTimeout(400);
  await tap(page.locator('#sitesWin .sw-row[data-site="site-5"]'));
  await page.waitForTimeout(400);
  const picked = await sites(st);
  check(`${size}: SITE 5's pills: LZ-A's and LZ-B's refused (\`LZ-B ✕ LZ-B HAS PODS DOWN\`), then \`OPEN AS LZ-C (1,200)\``,
    picked.pills.length === 3 && picked.pills[1]?.text === 'LZ-B ✕ LZ-B HAS PODS DOWN' && picked.pills[2]?.text === 'OPEN AS LZ-C (1,200)',
    JSON.stringify(picked.pills));
  await page.screenshot({ path: join(SHOTS, `survey-4-${size}-1-pills.png`) });
  // A refused pill is aria-disabled (Playwright waits for an enabled one), but it takes the kid's click: forced here.
  const refusedPill = page.locator('#sitesWin .sw-pill[data-lz="LZ-B"]');
  await (phone ? refusedPill.tap({ force: true }) : refusedPill.click({ force: true }));
  const flashed = await waitFor(() => document.getElementById('objectiveText').textContent === 'LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C', 4000, 50);
  check(`${size}: a click on the refused pill flashes its reason on the strip: \`LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C\``, flashed,
    await st(() => document.getElementById('objectiveText').textContent));
  await page.screenshot({ path: join(SHOTS, `survey-4-${size}-2-refused.png`) });
  await tap(page.locator('#sitesWin .sw-pill[data-kind="open"]'));
  await page.waitForTimeout(600);
  const opened = { view: await sites(st), lz: await st(() => window.__ap.store.getState().landing.lzs.find((lz) => lz.label === 'LZ-C') ?? null), stamps: await st(() => window.__e2eStamps) };
  check(`${size}: OPEN AS LZ-C opens it: LZ-C on SITE 5 (6 pods of room), the stamp \`LZ-C → SITE 5\`, its row \`LZ-C · OPENED ON SITE 5 · ROOM 1,200 …\``,
    opened.lz?.site === 'site-5' && opened.lz.pods === 6 && opened.stamps.includes('LZ-C → SITE 5') && opened.view.lzs[2] === 'LZ-C · OPENED ON SITE 5 · ROOM 1,200 · WIDE · FLAT ★★★',
    JSON.stringify({ lz: opened.lz, lzs: opened.view.lzs, stamps: opened.stamps }));
  await page.screenshot({ path: join(SHOTS, `survey-4-${size}-3-opened.png`) });
  // Back to the ship's view (the phone's NAV PLOT tab), then hold [F] to LZ-C's window and [L] there.
  if (phone) {
    const nav = page.locator('.dock-item[data-tool="navplot"]');
    await nav.scrollIntoViewIfNeeded();
    await nav.tap();
  }
  const landedC = () => window.__ap.store.getState().landing.pods.some((r) => r.fate.kind === 'down' && r.fate.touchdown.lz === 'LZ-C');
  // Every stop the held [F] is spent at, recorded in the page (a spent hold lasts only until the key is let go).
  await st(() => {
    window.__e2eSpent = [];
    setInterval(() => {
      const spent = window.__ap.fastForward().spent;
      if (spent !== null && window.__e2eSpent.at(-1) !== spent) window.__e2eSpent.push(spent);
    }, 30);
  });
  let launched = false;
  let shotWindow = false;
  const until = Date.now() + 240000;
  while (Date.now() < until && !(await st(landedC))) {
    const now = await st(() => {
      const s = window.__ap.store.getState();
      return { lz: s.landing.window?.lz ?? null, held: window.__ap.fastForward().held, spent: window.__ap.fastForward().spent,
        keys: window.__ap.director().shown?.keys ?? [], text: window.__ap.director().shown?.text ?? '' };
    });
    if (now.lz === 'LZ-C') {
      await fKey.set(false);
      if (!shotWindow) { await page.screenshot({ path: join(SHOTS, `survey-4-${size}-4-window.png`) }); shotWindow = true; }
      if (!launched && /press \[L\]/.test(now.text)) { await page.keyboard.press('KeyL'); launched = true; }
    } else {
      // Held until the game spends it (the strip's row may change under a running hold: DROP UNCERTAIN has no [F] tail).
      const keep = fKey.down && now.held && now.spent === null;
      await fKey.set(now.lz === null && (now.keys.includes('F') || keep), now.held);
    }
    await page.waitForTimeout(150);
  }
  await fKey.set(false);
  const spents = await st(() => window.__e2eSpent);
  const stopAtC = spents.includes('LZ-C WINDOW');
  const inC = await st(() => window.__ap.store.getState().landing.pods.flatMap((r) => (r.fate.kind === 'down' && r.fate.touchdown.lz === 'LZ-C' ? [`${r.fate.touchdown.place}:${r.fate.touchdown.touch}`] : [])));
  check(`${size}: the held [F] stops at LZ-C's window (\`LZ-C WINDOW\`), and [L] lands a pod in LZ-C, in plan (${inC.join(', ')})`,
    stopAtC && inC.length > 0 && inC.every((one) => one === 'lz:soft'), JSON.stringify({ spents, inC }));
  await page.screenshot({ path: join(SHOTS, `survey-4-${size}-5-landed.png`) });
  const reportOk = await runKit(page, game).landToReport();
  await page.waitForTimeout(2500);
  const report = await st(() => [...document.querySelectorAll('#lrRows .lr-row')].map((row) => row.innerText.replace(/\s+/g, ' ').trim()));
  check(`${size}: the LANDING REPORT's LZ-C row: \`LZ-C … · OPENED ON SITE 5\`, no SHORT`,
    reportOk && report.some((row) => /^LZ-C .*· OPENED ON SITE 5/.test(row) && !/SHORT/.test(row)), report.join(' | '));
  await page.screenshot({ path: join(SHOTS, `survey-4-${size}-6-report.png`) });
  check(`${size}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await game.context.close();
}
await openSitePart({ viewport: { width: 1440, height: 900 } }, '1440');
await openSitePart({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, '390');

await finish(browser);
