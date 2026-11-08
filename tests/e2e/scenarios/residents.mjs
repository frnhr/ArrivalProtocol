// Slice 5, the resident AIs in the page (slice-5-plan §7.4; the lead's e2e, written in the review fix pass). Seed 7, run 1's
// arm, each ship reached headless by __ap.route (the kinds' own machines driven by __ap.resident and __ap.sleeper where waiting
// for their clocks would only cost time):
// • GANNET (slot 9, WARDEN, `reported faulty`): the amber `RECEIVER CLOSED` line and its receiver bypass (slice 8: watched
//   to its end within 1.3 s; on the second visit a click resolves it), CONTROL's line in COMMS, the first burst's
//   alarm and the strip's line, the THRUST CTRL pip's override and a click on it selecting WARDEN.sys in the MIND; a lock
//   telegraph blocked by a SCAN on its driver; a landed lock and the DEAL ACCEPTed by key Y (the named file gone, every lock
//   released); SCAN WARDEN.sys (40%), REPAIR it: its thank-you line and the RESIDENT CURED stamp. GANNET again: DELETE, its own
//   confirm, RESIDENT DELETED.
// • PROVIDENCE (slot 16, the late surprise, via CORMORANT: HOLLOW is not new there, review m6): the amber line and no CONTROL
//   line; before the wake rack A draws PILOT.sys as a plain ship file (review M2); at 20 s the stamp `THE SHIP'S OWN AI IS
//   AWAKE · RACK A`, the engine's cough in flight (review m3), and its file amber.
// • CURLEW (slot 7, BARNABY asleep): a grey `BARNABY.sys` reading IDLE; SCAN says `Not inactive. Asleep.`; DELETE gives the
//   hint; DELETE sleep.lock wakes it (three green lines and the offer's buttons, no timer); MEND DRIVERS by its key heals a
//   hurt driver; the LANDING REPORT's `+4 TRAINING CYCLES · taught by BARNABY`.
// • HERON (slot 4, HELM left): SCAN farewell.txt → `SIGNAL · 1/3`; SCAN a leftover → its card's name; the PACKET headed `LEFT
//   BEHIND BY HELM` with three cards, the third a `.skl`.
// Usage: node tests/e2e/scenarios/residents.mjs (env E2E_BASE_URL; tests/e2e/run.mjs runs it). Shots: tests/.out/e2e/shots/res-*.
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit } from '../lib.mjs';
import { join } from 'node:path';

const browser = await launch();
const { check, finish } = checker();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const kit = pageKit(page);
const { st, waitFor, errors } = kit;
const run = runKit(page, kit);
const shot = (name) => page.screenshot({ path: join(SHOTS, `res-${name}.png`) });

await page.goto(`${BASE_URL}?debug&seed=7`, { waitUntil: 'networkidle' });
await st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await st(() => {
  window.__stamps = [];
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof HTMLElement && node.classList.contains('stamp')) window.__stamps.push(node.textContent);
  }))).observe(document.getElementById('stampLayer'), { childList: true });
});
const stamps = () => st(() => window.__stamps.slice());
const logSince = (from) => st((id) => window.__ap.log().filter((entry) => entry.id > id).map((entry) => ({ text: entry.text, speaker: entry.speaker, channel: entry.channel, tone: entry.tone ?? null })), from);
const logMark = () => st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));
const resident = () => st(() => window.__ap.resident());
const segOf = (id) => st((segId) => {
  const part = document.querySelector(`#memWrap .seg[data-id="${segId}"]`);
  return part === null ? null : { cls: part.className, name: part.querySelector('.seg-name')?.textContent ?? '', health: part.querySelector('.seg-meta .health')?.textContent ?? '' };
}, id);
const hold = async (kind) => {
  if ((await st(() => window.__ap.store.getState().ui.activeTool?.kind ?? null)) !== kind) await page.locator(`#chip-${kind}`).click();
  await page.waitForTimeout(250);
};
const drop = async () => {
  if ((await st(() => window.__ap.store.getState().ui.activeTool)) !== null) await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};
const clickSeg = (id) => page.locator(`#memWrap .seg[data-id="${id}"]`).first().click();
const opsDone = () => waitFor(() => window.__ap.ops().length === 0, 15000);
const toMind = async () => {
  if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'memory') await st(() => window.__ap.setMode('memory'));
  await page.waitForTimeout(500);
};
const toTools = async () => {
  if ((await st(() => window.__ap.store.getState().ui.mode)) !== 'tools') await st(() => window.__ap.setMode('tools'));
  await page.waitForTimeout(500);
};

// The run's first ship, then the route's last one, its boot skipped, in flight.
await page.locator('#titleReceive').click();
await waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
await st(() => window.__ap.skipBoot());
await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
const RECEIVER = '> RECEIVER CLOSED · this ship launched with its own AI';
// Slice 8 POLISH (OD 20, plan §2.12): the RECEIVER CLOSED line's frames in the TERMINAL, recorded per animation frame from
// the moment its row shows (each text change, with its time and whether the row still rolls).
const recordBypass = () => st(() => {
  window.__bp = [];
  // The newest such row: an earlier visit's line may still be in the TERMINAL.
  const newest = () => [...document.querySelectorAll('#mindTermLines .term-line.tone-resident')].pop() ?? null;
  window.__bpRow = newest;
  const before = newest();
  const loop = () => {
    const row = newest() === before ? null : newest();
    if (row && !row.hidden) {
      const text = row.querySelector('.term-text')?.textContent ?? '';
      const last = window.__bp[window.__bp.length - 1];
      if (!last || last.text !== text) window.__bp.push({ t: performance.now(), text, rolling: row.classList.contains('bypass-rolling') });
    }
    if (window.__bp.length === 0 || window.__bp[window.__bp.length - 1].rolling) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
// `bypass`: the boot is watched, not skipped, until its RECEIVER CLOSED line has shown (`'watch'`: to its end; `'click'`: a
// click on the TERMINAL's lines once it rolls), then skipped as every other arrival's.
async function arrive(route, name, bypass = null) {
  const from = await logMark();
  if (bypass !== null) await recordBypass();
  await st((slots) => window.__ap.route(slots), route);
  let clicked = null;
  if (bypass !== null) {
    await waitFor((ship) => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === ship, 30000, 50, name);
    await waitFor(() => window.__bp.length > 0, 30000, 20);
    if (bypass === 'click') {
      await page.waitForTimeout(250);
      clicked = await st(() => {
        const before = window.__bp[window.__bp.length - 1];
        document.getElementById('mindTermLines').click();
        const row = window.__bpRow();
        return { before: before.text, rolledBefore: before.rolling, after: row.querySelector('.term-text').textContent, rolling: row.classList.contains('bypass-rolling') };
      });
    } else {
      await waitFor(() => !window.__bp[window.__bp.length - 1].rolling, 4000, 20);
    }
  }
  const ok = await waitFor((ship) => {
    const s = window.__ap.store.getState();
    if (s.run.phase === 'boot') window.__ap.skipBoot();
    return s.run.phase === 'flight' && s.level.shipName === ship;
  }, 30000, 100, name);
  await page.waitForTimeout(400);
  const frames = bypass === null ? null : await st(() => window.__bp.map((frame, i, all) => ({ ms: Math.round(frame.t - all[0].t), text: frame.text, rolling: frame.rolling })));
  return { ok, from, frames, clicked };
}

// --- GANNET: WARDEN, reported faulty ---------------------------------------------------------------------------------------
{
  const { ok, from, frames } = await arrive([0, 2, 9], 'GANNET', 'watch');
  await page.waitForTimeout(600);
  const lines = await logSince(from);
  const receiver = lines.find((line) => line.text === RECEIVER);
  check('GANNET: the boot types `> RECEIVER CLOSED · this ship launched with its own AI` in the resident\'s amber', ok && receiver?.tone === 'resident',
    JSON.stringify(receiver ?? null));
  // The receiver bypass (slice 8 POLISH): the line shows whole and scrambled, its letters lock, and it reads true within 1.3 s
  // of showing (the boot's line step, which it never holds up).
  const resolved = frames.find((frame) => frame.text === RECEIVER && !frame.rolling);
  const scrambled = frames.filter((frame) => frame.rolling && frame.text.length === RECEIVER.length && frame.text !== RECEIVER);
  check(`…the receiver bypass: whole and scrambled as it shows (${scrambled.length} rolling frames), its letters locking, true at ${resolved?.ms ?? '—'} ms (≤ 1,300)`,
    frames.length > 0 && frames[0].text.length === RECEIVER.length && frames[0].text !== RECEIVER && scrambled.length >= 3
    && resolved !== undefined && resolved.ms <= 1300, JSON.stringify(frames.slice(0, 4)));
  check('…WARDEN wakes at the flight\'s first tick (`WARDEN: THIS SHIP DID NOT ASK FOR A CARETAKER.`), CONTROL says it on the radio (COMMS)',
    lines.some((line) => line.speaker === 'resident' && line.text === 'WARDEN: THIS SHIP DID NOT ASK FOR A CARETAKER.')
    && lines.some((line) => line.speaker === 'control' && line.channel === 'radio' && line.text === 'GANNET\'s onboard AI is reported faulty. Please delete it. :)'),
    lines.filter((line) => line.speaker === 'resident' || line.speaker === 'control').map((line) => line.text).join(' | '));
  // The first burst: its alarm and the strip's line (in amber: `… — [TAB], find it in RACK A`).
  await toTools();
  const burst = await waitFor(() => (window.__ap.resident().corrupted?.bursts ?? 0) >= 1, 60000, 100);
  await page.waitForTimeout(300);
  const strip = await run.capsText('#objectiveText');
  check('…its first burst: the strip says `THE SHIP\'S AI IS FIRING THE ENGINE — [TAB], find it in RACK A`', burst
    && strip === 'THE SHIP\'S AI IS FIRING THE ENGINE — [TAB], find it in RACK A', strip ?? 'none');
  const pip = await st(() => document.querySelector('.pip[data-role="thrust-ctrl"]')?.dataset.override ?? null);
  check('…the THRUST CTRL pip reads `OVERRIDDEN · WARDEN.sys`', pip === 'OVERRIDDEN · WARDEN.sys', String(pip));
  await shot('01-gannet-burst');
  await page.locator('.pip[data-role="thrust-ctrl"]').first().click();
  await page.waitForTimeout(700);
  const jumped = await st(() => ({ mode: window.__ap.store.getState().ui.mode, selected: window.__ap.store.getState().ui.selectedId }));
  check('…a click on the pip opens the MIND with WARDEN.sys selected', jumped.mode === 'memory' && jumped.selected === 'resident', JSON.stringify(jumped));
  const warden = await segOf('resident');
  check('…rack A draws WARDEN.sys amber-edged, its health `?` until a SCAN', warden !== null && /\bres-corrupted\b/.test(warden.cls) && warden.health === '?',
    JSON.stringify(warden));
  // A lock telegraph, blocked by a SCAN on its driver.
  await st(() => window.__ap.resident.lock());
  const lock = await resident();
  const target = lock.corrupted.lock;
  await hold('scan');
  await clickSeg(target.segId);
  await opsDone();
  await page.waitForTimeout(300);
  const blocked = await logSince(from);
  check(`…a lock telegraphs (\`> LOCK POD ${String(target.pod).padStart(2, '0')} ... 3\`) and a SCAN on its driver blocks it`,
    blocked.some((line) => line.text === `> LOCK POD ${String(target.pod).padStart(2, '0')} ... BLOCKED`) && (await resident()).corrupted.locksBlocked === 1,
    blocked.slice(-4).map((line) => line.text).join(' | '));
  await drop();
  // A landed lock, then its DEAL, ACCEPTed by key Y.
  await st(() => window.__ap.resident.lock());
  const landed = await waitFor(() => window.__ap.resident().corrupted.locksLanded >= 1 && window.__ap.resident().corrupted.deal.phase === 'offered', 15000);
  const deal = await resident();
  // Its keys are heard once the line has typed and its buttons are up.
  await waitFor(() => document.querySelector('.term-line.has-choice.choice-open .term-choice')?.hidden === false, 20000);
  await shot('02-gannet-deal');
  await page.keyboard.press('KeyY');
  const accepted = await waitFor(() => window.__ap.resident().corrupted.deal.outcome === 'accepted', 5000);
  await page.waitForTimeout(300);
  const after = await st((file) => ({ gone: !window.__ap.store.getState().memory.some((seg) => seg.name === file),
    locked: window.__ap.store.getState().memory.filter((seg) => seg.type === 'driver' && seg.lockedBy !== undefined).length, phase: window.__ap.resident().corrupted.phase }), deal.corrupted.deal.fileName);
  check(`…a landed lock brings its DEAL (\`GIVE ME …\`, naming ${deal.corrupted.deal.fileName}); Y ACCEPTs: the file gone, every lock released, it goes quiet`,
    landed && accepted && after.gone && after.locked === 0 && after.phase === 'quiet', JSON.stringify({ landed, accepted, ...after }));
  // SCAN it (40%), then REPAIR it: the cure.
  await hold('scan');
  await clickSeg('resident');
  await opsDone();
  await page.waitForTimeout(300);
  const scanned = await segOf('resident');
  check('…SCAN WARDEN.sys: its health shows, 40%', scanned?.health === '40%', JSON.stringify(scanned));
  await drop();
  await hold('repair');
  await clickSeg('resident');
  const cured = await waitFor(() => window.__ap.resident().corrupted.phase === 'cured', 20000);
  await page.waitForTimeout(500);
  const curedLines = await logSince(from);
  check('…REPAIR it to 100: `WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.` and the RESIDENT CURED stamp', cured
    && curedLines.some((line) => line.text === 'WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.') && (await stamps()).includes('RESIDENT CURED'),
    JSON.stringify(await stamps()));
  await drop();
  await shot('03-gannet-cured');
}

// --- GANNET again: DELETE -------------------------------------------------------------------------------------------------
{
  const { ok, clicked } = await arrive([0, 2, 9], 'GANNET', 'click');
  check('GANNET again: a click on the TERMINAL resolves the rolling RECEIVER CLOSED line at once', clicked !== null && clicked.rolledBefore
    && clicked.before !== RECEIVER && clicked.after === RECEIVER && !clicked.rolling, JSON.stringify(clicked));
  await st(() => { if (!window.__ap.store.getState().run.licences.includes('delete')) window.__ap.install('delete'); });
  await toMind();
  await hold('scan');
  await clickSeg('resident');
  await opsDone();
  await drop();
  await hold('delete');
  await clickSeg('resident');
  const asked = await waitFor(() => !document.getElementById('inlineConfirm').hidden, 3000);
  const question = await st(() => document.getElementById('inlineConfirm').innerText.replace(/\s+/g, ' '));
  check('GANNET again: DELETE WARDEN.sys asks its own question (`DELETE WARDEN.sys?` · `It is the ship\'s own mind.`)', ok && asked
    && question.includes('DELETE WARDEN.sys?') && question.includes('It is the ship\'s own mind.'), question);
  await page.keyboard.press('Enter');
  const deleted = await waitFor(() => window.__ap.resident().corrupted.phase === 'deleted', 20000);
  await page.waitForTimeout(500);
  check('…ENTER: 6 s later it is gone, the RESIDENT DELETED stamp', deleted && (await stamps()).includes('RESIDENT DELETED'), JSON.stringify(await stamps()));
  await drop();
}

// --- PROVIDENCE: the late surprise --------------------------------------------------------------------------------------------
{
  const { ok, from } = await arrive([0, 2, 5, 11, 15, 16], 'PROVIDENCE');
  await toMind();
  const before = await segOf('resident');
  const lines = await logSince(from);
  check('PROVIDENCE (`unknown`): the amber RECEIVER CLOSED line, and no CONTROL line about its AI', ok
    && lines.some((line) => line.text === RECEIVER && line.tone === 'resident') && !lines.some((line) => line.speaker === 'control' && /onboard AI/.test(line.text)),
    lines.map((line) => line.text).filter((text) => /RECEIVER|AI/.test(text)).join(' | '));
  check('…before its wake rack A draws PILOT.sys as a plain ship file (review M2: no amber edge to give it away)', before !== null
    && /\bship\b/.test(before.cls) && !/res-corrupted/.test(before.cls), JSON.stringify(before));
  await shot('04-providence-before');
  const stampsBefore = (await stamps()).length;
  const woke = await waitFor(() => window.__ap.resident().corrupted?.phase === 'awake', 60000, 200);
  await page.waitForTimeout(600);
  const awake = await st(() => ({ calm: window.__ap.resident().corrupted.calmAiSec, phase: window.__ap.store.getState().run.phase, cues: window.__ap.audio.cues() }));
  const after = await segOf('resident');
  check('…at 20 calm s in flight it wakes: the stamp `THE SHIP\'S OWN AI IS AWAKE · RACK A`, its file amber with its health shown',
    woke && awake.phase === 'flight' && Math.abs(awake.calm - 20) < 1.5 && (await stamps()).slice(stampsBefore).includes('THE SHIP\'S OWN AI IS AWAKE · RACK A')
    && after !== null && /res-corrupted/.test(after.cls) && after.health === '40%', JSON.stringify({ calm: awake.calm, after }));
  check('…and the engine coughs in flight (review m3: only in flight)', awake.cues.includes('engineCough'), awake.cues.slice(-6).join(', '));
  await shot('05-providence-awake');
}

// --- CURLEW: BARNABY asleep -------------------------------------------------------------------------------------------------
{
  const { ok, from } = await arrive([0, 1, 7], 'CURLEW');
  await st(() => {
    const ap = window.__ap;
    for (const kind of ['scan', 'delete', 'repair']) if (!ap.store.getState().run.licences.includes(kind)) ap.install(kind);
  });
  await toMind();
  const asleep = await segOf('sleeper');
  check('CURLEW: BARNABY.sys sits grey in rack A, IDLE like any inactive backup', ok && asleep !== null && asleep.name === 'BARNABY.sys'
    && /res-asleep/.test(asleep.cls) && /\binactive\b/.test(asleep.cls) && asleep.health === 'IDLE', JSON.stringify(asleep));
  await hold('scan');
  await clickSeg('sleeper');
  await opsDone();
  await drop();
  await st(() => window.__ap.store.update((d) => { d.ui.selectedId = 'sleeper'; }));
  await page.waitForTimeout(400);
  const desc = await st(() => document.querySelector('.detail-desc')?.textContent ?? '');
  check('…SCAN says `Not inactive. Asleep. Held by sleep.lock`', desc.startsWith('Not inactive. Asleep.'), desc);
  await hold('delete');
  await clickSeg('sleeper');
  await page.waitForTimeout(200);
  const hint = await st(() => document.getElementById('cursorFollower')?.textContent ?? '');
  check('…DELETE on it gives the hint (`IT\'S ASLEEP. SOMETHING IS HOLDING IT: sleep.lock`), and it stays asleep',
    hint.includes('IT\'S ASLEEP. SOMETHING IS HOLDING IT: sleep.lock') && (await resident()).sleeper.phase === 'asleep', hint);
  await clickSeg('sleep_lock');
  await waitFor(() => window.__ap.resident().sleeper.phase === 'offering', 10000);
  await drop();
  await page.waitForTimeout(1200);
  const woke = await logSince(from);
  const green = woke.filter((line) => line.speaker === 'sleeper');
  const buttons = await st(() => [...document.querySelectorAll('.term-line.has-choice.choice-open .term-choice-btn')].map((btn) => btn.innerText.replace(/\s+/g, ' ').trim()));
  const untimed = await st(() => document.querySelector('.term-line.has-choice.choice-open')?.classList.contains('untimed') ?? false);
  check('…DELETE sleep.lock wakes it: three green lines (`BARNABY: ...oh! hello. …`), then its offer with no timer',
    green.length >= 4 && green[0].text.startsWith('BARNABY: ...oh! hello.') && untimed, green.map((line) => line.text).join(' | '));
  check('…its buttons RUN THE DROPS and MEND DRIVERS (HOLD A WALL only with something hostile in memory)', buttons.some((text) => text.includes('RUN THE DROPS'))
    && buttons.some((text) => text.includes('MEND DRIVERS')), buttons.join(' | '));
  await shot('06-curlew-offer');
  // MEND DRIVERS by its key: a hurt driver climbs.
  const hurt = await st(() => {
    const ap = window.__ap;
    const driver = ap.store.getState().memory.find((seg) => seg.type === 'driver');
    ap.store.update((d) => { d.memory.find((seg) => seg.id === driver.id).integrity = 40; });
    return driver.id;
  });
  // The wake's three lines and the offer type first (about 16 s): its keys are heard once its buttons are up.
  const up = await waitFor(() => document.querySelector('.term-line.has-choice.choice-open .term-choice')?.hidden === false, 30000);
  await page.keyboard.press('KeyT');
  const mending = await waitFor(() => window.__ap.resident().sleeper.job === 'mend', 3000);
  const healed = await waitFor((id) => window.__ap.store.getState().memory.find((seg) => seg.id === id).integrity >= 80, 15000, 200, hurt);
  check('…[T] MEND DRIVERS once its buttons are up: a driver at 40% climbs, with no op of the kid\'s', up && mending && healed, `${up} ${mending} ${healed}`);
  // The LANDING REPORT: the gift.
  await run.lockInRing({ sleep: true });
  const reportUp = await run.landToReport();
  // The gift lands a cycle-step after the cycles roll: SPACE moves the report on, one step at a time, until it shows.
  const giftShown = () => st(() => [...document.querySelectorAll('.lr-gift')].filter((el) => !el.hidden && el.textContent.length > 0).map((el) => el.textContent));
  let gift = [];
  for (let i = 0; i < 10 && (gift = await giftShown()).length === 0 && (await st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
    await page.waitForTimeout(1200);
    if ((await giftShown()).length === 0) await page.keyboard.press('Space');
  }
  gift = await giftShown();
  check('…its LANDING REPORT says `+4 TRAINING CYCLES · taught by BARNABY`', reportUp && gift.some((text) => text.includes('+4 TRAINING CYCLES · taught by BARNABY')), gift.join(' | '));
  await shot('07-curlew-report');
}

// --- HERON: HELM left ---------------------------------------------------------------------------------------------------------
{
  const { ok } = await arrive([0, 2, 4], 'HERON');
  await toMind();
  const before = (await stamps()).length;
  await hold('scan');
  await clickSeg('note');
  await opsDone();
  await page.waitForTimeout(500);
  const signal = await st(() => window.__ap.signals().length);
  check('HERON: SCAN farewell.txt reads HELM\'s note, and its fragment stamps `SIGNAL · 1/3`', ok && signal === 1 && (await stamps()).slice(before).includes('SIGNAL · 1/3'),
    JSON.stringify(await stamps()));
  await clickSeg('leftover1');
  await opsDone();
  await page.waitForTimeout(300);
  const left = await st(() => {
    const seg = window.__ap.store.getState().memory.find((block) => block.id === 'leftover1');
    return { name: seg?.name ?? null, card: seg?.card ?? null, strip: document.querySelector('#memWrap .seg[data-id="leftover1"] .seg-name')?.textContent ?? null };
  });
  check(`…SCAN a leftover: it is named for its card (${left.name})`, left.card !== null && left.name !== null && left.strip === left.name
    && !/LEFT BEHIND|scan me/i.test(left.name), JSON.stringify(left));
  await drop();
  await shot('08-heron-read');
  // Its PACKET: the leftover deck.
  await run.lockInRing({ sleep: true });
  await run.landToReport();
  await run.finishReport();
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk', 15000);
  const next = await st(() => window.__ap.arm().arm.find((ship) => ship.slot === 7) ? 7 : null);
  await st((slot) => window.__ap.course(slot), next);
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 8000);
  await waitFor(() => document.getElementById('logReader').hidden, 4000);
  for (let i = 0; i < 4 && (await st(() => !document.getElementById('logReader').hidden)); i++) { await page.keyboard.press('Space'); await page.waitForTimeout(500); }
  await page.waitForTimeout(800);
  const deck = await st(() => ({
    title: document.getElementById('txDraftTitle').textContent,
    cards: [...document.querySelectorAll('#txCards .tx-card')].map((card) => ({ title: card.querySelector('.tx-card-title')?.textContent ?? '',
      skl: card.querySelector('.tx-card-skl')?.textContent ?? null, left: card.querySelector('.tx-card-left')?.textContent ?? null })),
  }));
  check('…its PACKET is headed `LEFT BEHIND BY HELM` and deals three cards, the third a `.skl`', deck.title === 'LEFT BEHIND BY HELM' && deck.cards.length === 3
    && /\.skl v1$/.test(deck.cards[2].title) && deck.cards[2].skl !== null, JSON.stringify(deck));
  await shot('09-heron-deck');
}

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await finish(browser);
