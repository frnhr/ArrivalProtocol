// Playtest 1, Track B-TIME (docs/phase3/impl/playtest-1-plan.md §3.1; Fran's notes 6 and 24): [F] is HELD to fast-forward.
// The hold runs legs of the SKIP engine from stop to stop: HARD stops end it (the kid has a decision to make), SOFT stops
// are slowed past (a TACTICAL dwell, then on), WAIT stops (a window a controller flies) hold it without ending it, and a
// hazard zone met on this ship is crossed CAPPED (the tick integrator, about FF_ZONE_PASS_WALL_SEC a pass).
//  1. HARD, in flight (ARES-VII on a loop with ▲ at 1,000,000 km): one hold crosses a WAIT of days in a few wall seconds and
//     ends 15 tac s before START BURN (BURN AHEAD); held on it does nothing; a fresh press there is refused; letting go
//     mid-leg is the director's pace on the next tick; the button and the strip say all that.
//  2. Fran's note 6 (HALCYON, an accepted loop a little too big for its ring, LZ-B landed): holding F reaches LZ-A's window
//     although the ring trim at ▼ is due on the way (a SOFT stop: dwelt at, then declined).
//  3. Fran's note 24 (LAST LIGHT, a 6,000 × 15,000 km loop across the radiation belt twice): the first entry is HARD, a fresh
//     press crosses it capped in about 3 wall s (never a Kepler jump, the hits all landing), the second entry is SOFT, and
//     the hold goes window to window in well under a minute where the director alone takes many.
//  4. WAIT: a window AUTODROP v3's plan flies is not the end of the hold: it waits there at TACTICAL, and goes on by itself
//     after it (capped at CRUISE while the pods fall).
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { lockOn, ensureLandingKeys } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { getPrediction, secUntil } from '@systems/predict';
import { fastForwardView, fastForwardBlockReason, startFastForward, windowLaunchInSec, zoneInside, nextZoneEntry, FF_TEXT } from '@systems/pace';
import { landingBurnOffer } from '@systems/landing-orbit';
import { giveSkillFile } from '../support/skills';
import { pressAutodrop } from '@systems/autodrop';
import { skipButton, paceLabel } from '@systems/flight-hud';
import { stateFromElements } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { LANDING_SKIP_REFUSAL } from '@data/landing-text';
import {
  SKIP_END_LEAD_TAC, WINDOW_TACTICAL_LEAD_TAC, ZONE_TACTICAL_LEAD_TAC, FF_SOFT_DWELL_SEC, FF_ZONE_PASS_WALL_SEC, TICK_MS,
} from '@data/tuning';
import type { GameState, Pace } from '@state/schema';

const TICK = TICK_MS / 1000;
const h = createHarness9(1);
setLandingMode('manual');
const st = (): GameState => h.store.getState();
const tw = (): number => st().level.tacticalWarp;
const hold = (): void => h.keyDown('KeyF');
const release = (): void => h.keyUp('KeyF');
const spent = (): string | null => fastForwardView().spent;
const line = (): string => h.shown()?.text ?? '';
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

// Steps while F is held until the hold is spent (or `maxWall`); the paces seen on the way, and the wall seconds.
function holdUntilSpent(maxWall: number, onTick?: () => void): { wall: number; paces: Set<Pace> } {
  const start = h.wall();
  const paces = new Set<Pace>();
  while (spent() === null && h.wall() - start < maxWall) {
    h.step();
    paces.add(st().clock.pace);
    onTick?.();
  }
  return { wall: h.wall() - start, paces };
}

function board(index: number): void {
  if (index === 0) h.reset(1);
  else h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
  });
  ensureLandingKeys(h);
}

// --- 1. HARD in flight: a WAIT of days, BURN AHEAD ----------------------------------------------------------------------
{
  board(0);
  const { ring, planet } = st().level;
  const place = (): void => {
    const rp = (ring.min + ring.max) / 2;
    const ra = 1_000_000;
    const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, Math.PI * 0.98, planet.mu);
    h.store.mutate((draft) => { draft.orbit = { ...draft.orbit, x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; });
    for (let i = 0; i < 6; i++) h.step();
  };
  place();
  const burnTac = (): number => {
    const pred = getPrediction();
    return pred.burnPoint ? secUntil(pred, pred.burnPoint.inSec, st().clock.tSec) / tw() : NaN;
  };
  const waitTac = burnTac();
  const button = skipButton(st(), getPrediction());
  check('a long coast to ▼: the button is ready (not struck out, not held)', button.blockedReason === null && !button.active && !button.held,
    `${line()} · ${JSON.stringify(button)}`);
  hold();
  h.step();
  const heldButton = skipButton(st(), getPrediction());
  const run = holdUntilSpent(20, () => { if (st().clock.pace === 'skip' && !/^FAST ×/.test(paceLabel(st()))) throw new Error(paceLabel(st())); });
  const leftTac = burnTac();
  check(`one hold crosses the ${(waitTac / 86400).toFixed(1)}-tactical-day WAIT in a few wall seconds: ${run.wall.toFixed(1)} s`,
    waitTac > 86400 && run.wall < 6 && run.paces.has('skip'), `${waitTac.toFixed(0)} tac s, ${run.wall.toFixed(2)} wall s`);
  check(`…held, the button is active and the pace reads FAST ×n ▸▸`, heldButton.active && heldButton.held, JSON.stringify(heldButton));
  check(`HARD: the hold ends ${SKIP_END_LEAD_TAC} tac s before START BURN, reading BURN AHEAD`,
    spent() === FF_TEXT.burn && near(leftTac, SKIP_END_LEAD_TAC, 0.5) && st().clock.skipWarp === null,
    `${spent()} at ${leftTac.toFixed(2)} tac s`);
  const before = st().clock.tSec;
  let legs = 0;
  for (let i = 0; i < 40; i++) { h.step(); if (st().clock.skipWarp !== null || st().clock.pace === 'fast') legs++; }
  const passedTac = (st().clock.tSec - before) / tw();
  check('…held on, it does nothing: the director\'s pace (CRUISE, then TACTICAL), and the button struck out with the stop',
    legs === 0 && passedTac < 2 * 3.5 && skipButton(st(), getPrediction()).blockedReason === FF_TEXT.burn,
    `${legs} fast ticks, ${passedTac.toFixed(1)} tac s in 2 wall s, ${skipButton(st(), getPrediction()).blockedReason}`);
  release();
  h.step();
  const again = startFastForward(h.store);
  check('a fresh press inside the lead is refused BURN AHEAD (the burn is the kid\'s)', !again.ok && again.reason === FF_TEXT.burn, JSON.stringify(again));
  release();
  // Letting go mid-leg: the director's pace on the next tick.
  place();
  hold();
  for (let i = 0; i < 30; i++) h.step();
  const midLeg = st().clock.skipWarp !== null && st().clock.pace === 'skip';
  release();
  h.step();
  check('letting go mid-leg returns to the director\'s pace at once', midLeg && st().clock.skipWarp === null && st().clock.pace !== 'skip'
    && fastForwardView().held === false, `${midLeg} → ${st().clock.pace}`);
}

// --- 2. Fran's note 6: one LZ landed, GO LOWER at ▼, holding F reaches the next LZ ----------------------------------------
{
  board(1);
  // HALCYON (LZ-A 4, LZ-B 1) on a loop just too big for its ring (▼ 5,500 km, e 0.25, ▼ at 150°), accepted: LZ-B's window
  // comes first, both LZs pass through the band, and the ring trim at ▼ is offered on every loop.
  lockOn(h, { r: 5500, e: 0.25, argPeriDeg: 150, status: 'accepted' });
  h.step();
  hold();
  const first = holdUntilSpent(30);
  check('the first hold reaches LZ-B\'s window: HARD, GET READY, 8 tac s before its launch moment', spent() === FF_TEXT.window('LZ-B')
    && near((windowLaunchInSec(st()) ?? NaN) / tw(), WINDOW_TACTICAL_LEAD_TAC, 0.3) && first.wall < 8,
    `${spent()} · ${line()} · ${first.wall.toFixed(1)} s`);
  release();
  h.stepUntil(() => st().landing.window?.sure === true, 20);
  h.press('KeyL');
  h.stepUntil(() => st().landing.window === null, 30);
  const falling = st().landing.pods.filter((record) => record.fate.kind === 'falling').length;
  hold();
  h.step();
  h.step();
  const cappedFalling = st().clock.pace === 'fast' && st().clock.speedTarget === st().level.cruiseWarp;
  if (falling > 0) {
    check('CAPPED while the pod falls: FAST at CRUISE\'s warp (the director would hold TACTICAL)', cappedFalling,
      `${falling} falling, ${st().clock.pace} ×${st().clock.speedTarget}`);
  }
  const target = (): string | undefined => {
    const win = windowLaunchInSec(st());
    return win === null ? undefined : FF_TEXT.window(st().landing.lzs.find((lz) => lz.label !== 'LZ-B')?.label ?? '?');
  };
  const toWindowTac = (windowLaunchInSec(st()) ?? NaN) / tw();
  let offered: string | null = null;
  let dwellStart: number | null = null;
  let dwellSec = 0;
  const second = holdUntilSpent(40, () => {
    const offer = landingBurnOffer(st(), getPrediction());
    if (offer !== null) offered ??= offer.reason;
    if (fastForwardView().running && st().clock.pace === 'tactical' && st().clock.skipWarp === null) {
      dwellStart ??= h.wall();
      dwellSec = h.wall() - dwellStart + TICK;
    }
  });
  const declined = st().landing.declined;
  check(`note 6: the hold passes the offer at ▼ (SOFT: a ${FF_SOFT_DWELL_SEC} s dwell at TACTICAL, then declined) and reaches LZ-A's window`,
    offered !== null && declined?.key.startsWith(`${offered}|`) === true && near(dwellSec, FF_SOFT_DWELL_SEC, 0.2)
      && spent() === target() && spent() === FF_TEXT.window('LZ-A'),
    `offer ${offered}, declined ${JSON.stringify(declined)}, dwell ${dwellSec.toFixed(2)} s, ${spent()}`);
  const directorWall = (toWindowTac * tw()) / st().level.cruiseWarp;
  console.log(`INFO  note 6: LZ-B landed → LZ-A's window ${toWindowTac.toFixed(0)} tac s away: held ${second.wall.toFixed(1)} wall s (the director alone: about ${directorWall.toFixed(0)} s at CRUISE)`);
  check('…in under 15 wall seconds, the stop and the dwell included', second.wall < 15, `${second.wall.toFixed(1)} s`);
  release();

  // --- 4. WAIT: AUTODROP v3's plan flies the windows: the hold waits at each and goes on by itself -----------------------
  h.stepUntil(() => st().landing.window === null && (windowLaunchInSec(st()) ?? 0) > 60 * tw(), 60);
  giveSkillFile(h.store, 'autodrop', 3);
  const armRefusal = pressAutodrop(h.store);
  hold();
  const start = h.wall();
  let waited = false;
  let resumed = false;
  let cappedFall = false;
  const aboard = (): number => st().landing.pods.filter((record) => record.fate.kind === 'aboard').length;
  const aboardAtArm = aboard();
  while (h.wall() - start < 40 && spent() === null && !resumed) {
    h.step();
    if (st().landing.window !== null && st().clock.pace === 'tactical' && aboard() < aboardAtArm) waited = true;
    // On by itself: a leg to the plan's next window, or capped while its pods fall.
    if (waited && st().landing.window === null && (st().clock.skipWarp !== null || st().clock.pace === 'fast')) resumed = true;
    if (st().clock.pace === 'fast' && st().landing.pods.some((record) => record.fate.kind === 'falling')
      && st().clock.speedTarget === st().level.cruiseWarp) cappedFall = true;
  }
  check('WAIT: a window AUTODROP v3\'s plan flies holds the hold at TACTICAL without ending it, and the hold goes on by itself after it',
    armRefusal === null && waited && resumed && spent() === null,
    `armed ${armRefusal ?? 'ok'}, ${aboardAtArm - aboard()} launched while held, resumed ${resumed}, spent ${spent()}`);
  check('CAPPED while pods fall: FAST at CRUISE\'s warp, where the director holds TACTICAL', cappedFall || !resumed, String(cappedFall));
  release();
  if (st().landing.autodrop.armed !== null) pressAutodrop(h.store);
}

// --- 3. Fran's note 24: LAST LIGHT, a loop across the belt twice --------------------------------------------------------
{
  board(4);
  lockOn(h, { r: 6000, e: 9000 / 21000, argPeriDeg: 0, status: 'accepted' });
  for (let i = 0; i < 4; i++) h.step();
  const beltId = st().level.zones.find((zone) => zone.kind === 'belt')?.id ?? '?';
  const inBelt = (): boolean => zoneInside(st(), getPrediction())?.zoneId === beltId;
  const hitsNow = (): number => h.zoneHits().filter((hit) => hit.zoneId === beltId).reduce((sum, hit) => sum + hit.hits, 0);
  // To the first window (the trim at ▼ passed on the way), then wait it out by hand.
  hold();
  holdUntilSpent(30);
  release();
  h.stepUntil(() => st().landing.window === null && (windowLaunchInSec(st()) ?? 0) > 60 * tw(), 60);
  hold();
  const toBelt = holdUntilSpent(30);
  const aheadTac = (nextZoneEntry(st(), getPrediction())?.inSec ?? NaN) / tw();
  check(`HARD: the first entry into the belt on this ship ends the hold at its lead (BELT AHEAD, ${ZONE_TACTICAL_LEAD_TAC} tac s)`,
    spent() === `${'BELT'} AHEAD` && near(aheadTac, ZONE_TACTICAL_LEAD_TAC, 1), `${spent()} at ${aheadTac.toFixed(1)} tac s, ${toBelt.wall.toFixed(1)} s`);
  release();
  h.step();

  // A fresh press: through the belt capped, no dwell on top of the stop; then the second crossing (SOFT), then the window.
  hold();
  const t0 = h.wall();
  const passes: { enter: number; exit: number | null; hits0: number; hits: number; paces: Set<Pace>; gameSec: number; t0: number }[] = [];
  const loopT0 = st().clock.tSec;
  let dwells = 0;
  let dwellOpen = false;
  let firstCapped: number | null = null;
  const loop = holdUntilSpent(60, () => {
    const pace = st().clock.pace;
    if (firstCapped === null && pace === 'fast') firstCapped = h.wall() - t0;
    const dwelling = fastForwardView().running && pace === 'tactical' && st().clock.skipWarp === null;
    if (dwelling && !dwellOpen) dwells++;
    dwellOpen = dwelling;
    const current = passes[passes.length - 1];
    if (inBelt()) {
      if (current === undefined || current.exit !== null) passes.push({ enter: h.wall(), exit: null, hits0: hitsNow(), hits: 0, paces: new Set([pace]), gameSec: 0, t0: st().clock.tSec });
      else current.paces.add(pace);
    } else if (current !== undefined && current.exit === null) {
      current.exit = h.wall();
      current.gameSec = st().clock.tSec - current.t0;
      current.hits = hitsNow() - current.hits0;
    }
  });
  const passWalls = passes.map((pass) => (pass.exit ?? NaN) - pass.enter);
  check('the fresh press runs capped at once (no soft dwell on the entry it stopped at)', firstCapped !== null && firstCapped < 0.5,
    `first FAST tick after ${String(firstCapped)} s`);
  check(`both crossings CAPPED: FAST on the tick integrator (never a Kepler jump inside), about ${FF_ZONE_PASS_WALL_SEC} wall s each`,
    passes.length === 2 && passes.every((pass) => pass.paces.size === 1 && pass.paces.has('fast'))
      && passWalls.every((wall) => wall > 1.5 && wall <= FF_ZONE_PASS_WALL_SEC + 1),
    passes.map((pass, i) => `${passWalls[i]!.toFixed(2)} s [${[...pass.paces].join()}] ${pass.hits} hits`).join(' · '));
  check('…and the belt hits land in them as they would at TACTICAL (the damage per game second is unchanged)',
    passes.every((pass) => pass.hits > 0), passes.map((pass) => pass.hits).join(', '));
  check('SOFT: the second entry is met already: one dwell at its lead, then on', dwells === 1, `${dwells} dwells`);
  const windowLabel = spent() ?? '';
  check(`note 24: the hold goes window to window across both crossings in under 30 wall s: ${loop.wall.toFixed(1)} s`,
    /^LZ-[A-D] WINDOW$/.test(windowLabel) && loop.wall < 30, `${windowLabel}, ${loop.wall.toFixed(1)} s`);
  // The director alone over the same stretch: CRUISE, and TACTICAL from each entry's lead to its exit (§6.8).
  const { cruiseWarp, tacticalWarp } = st().level;
  const insideSec = passes.reduce((sum, pass) => sum + pass.gameSec, 0);
  const leadSec = passes.length * ZONE_TACTICAL_LEAD_TAC * tacticalWarp;
  const directorSec = (st().clock.tSec - loopT0 - insideSec - leadSec) / cruiseWarp + (insideSec + leadSec) / tacticalWarp;
  console.log(`INFO  note 24: belt passes ${passWalls.map((wall) => wall.toFixed(1)).join(' s, ')} s (${passes.map((pass) => pass.gameSec.toFixed(0)).join(', ')} game s); `
    + `held window to window ${loop.wall.toFixed(1)} wall s; the director alone about ${(directorSec / 60).toFixed(1)} wall minutes`);
  check('…where the director alone takes minutes', directorSec > 300, `${directorSec.toFixed(0)} s`);
  release();
}

// --- The landing over: the hold refuses, the button says so ---------------------------------------------------------------
{
  const refusal = fastForwardBlockReason(st(), getPrediction());
  check('a hand window open or soon: the button names it, struck out', refusal === LANDING_SKIP_REFUSAL.windowOpen
    || /WINDOW$/.test(refusal ?? '') || refusal === null, String(refusal));
}

finish();
