// Shared flight scripts for the WP1-rules suites: the verifier's misbehaving kids from
// PROGRESS.md (WP1 review round 2, Deferred 1, 3 and 4), written against the real systems.
import { TICK, type Harness } from '../wp1/harness';
import { getPrediction, getSensedPrediction, sweetZone } from '@systems/predict';
import { skipBlockReason, skipRefusalInZone, skipRefusalZoneAhead } from '@systems/pace';
import { buildFlightContext, flightObjective } from '@systems/guidance';
import type { ZoneHit } from '@/types/zone';
import type { GameState } from '@state/schema';
import { DT_WALL_MAX } from '@data/tuning';

export const text = (harness: Harness): string => harness.objective()?.text ?? '';

export function stepUntil(harness: Harness, done: () => boolean, maxWall: number): boolean {
  const end = harness.wall() + maxWall;
  while (harness.wall() < end && harness.status() === 'approaching') {
    harness.step();
    if (done()) return true;
  }
  return false;
}

// A snapshot put back the way the Rule 4 sweep restores its rows (tests/unit/lead1/fix2/rule4-sweep checks a restored
// row flies like a fresh one): the harness reset, the state copied in, a few ticks for the predictor to re-plan.
// Module state outside the store (held keys, a SKIP in flight) is not in it: snapshot only while coasting, hands off.
export function restoreState(harness: Harness, snapshot: GameState, settleTicks = 4): void {
  harness.reset();
  harness.store.update((d) => { Object.assign(d, structuredClone(snapshot)); });
  for (let i = 0; i < settleTicks; i++) harness.step();
}

// A long setup (an hour of ignoring, a WAIT that takes half an hour to come up) flown once per process under `key`
// and restored from its snapshot after that: the unit tier's time goes to the rows, not to re-flying their setup. The
// first call settles the same few ticks as a restore, so every call leaves the same state.
const setups = new Map<string, GameState>();
export function flyOnce(harness: Harness, key: string, fly: () => void): void {
  const saved = setups.get(key);
  if (saved) { restoreState(harness, saved); return; }
  fly();
  const snapshot = structuredClone(harness.store.getState());
  setups.set(key, snapshot);
  restoreState(harness, snapshot);
}

// Let go at CAPTURED and `ignoreSec` ignored (SHRINK THE LOOP comes up after about 40 s with a full tank): the
// verifier's state most of the shrink and Rule 4 suites start from. Flown once per ignore time per process.
export function ignoredAtCapture(harness: Harness, ignoreSec: number): void {
  flyOnce(harness, `ignored ${ignoreSec} s`, () => {
    releaseAtCapture(harness);
    idle(harness, ignoreSec);
  });
}

// Let go at CAPTURED and left alone until SHRINK THE LOOP has lapsed: the strip offers the brake at the next ▼, a WAIT
// of 10,000–35,000 tactical minutes (half an hour of wall time to get there on ship 1). Flown once per process, and
// hands off, so at the longest tick the clock takes (DT_WALL_MAX, a throttled tab's): the predictor re-plans the long
// loop on every tick, and five times fewer ticks is the difference between 40 s of CPU and 10.
export function longWait(harness: Harness): void {
  flyOnce(harness, 'longWait', () => {
    releaseAtCapture(harness);
    const end = harness.wall() + 4000;
    while (harness.wall() < end && harness.status() === 'approaching' && !/^WAIT — brake at ▼/.test(text(harness))) harness.step(DT_WALL_MAX);
    if (!/^WAIT — brake at ▼/.test(text(harness))) throw new Error(`longWait: no WAIT offered: "${text(harness)}"`);
  });
}

// idle at the longest tick the clock takes (DT_WALL_MAX, a throttled tab's): for long hands-off stretches only (minutes
// of ignoring), where the predictor re-planning a long loop on every 50 ms tick is most of a suite's time.
export function idleThrottled(harness: Harness, wallSec: number): void {
  const end = harness.wall() + wallSec;
  while (harness.wall() < end - 1e-9 && harness.status() === 'approaching') harness.step(Math.min(DT_WALL_MAX, end - harness.wall()));
}

export function idle(harness: Harness, wallSec: number): void {
  const end = harness.wall() + wallSec;
  while (harness.wall() < end && harness.status() === 'approaching') harness.step();
}

export function placeOrbit(harness: Harness, orbit: { x: number; y: number; vx: number; vy: number }): void {
  harness.store.mutate((d) => { d.orbit.x = orbit.x; d.orbit.y = orbit.y; d.orbit.vx = orbit.vx; d.orbit.vy = orbit.vy; });
}

// The opening flown by the book: OUT until RELEASE, RETRO, SKIP to the capture.
// WP10: VESPER (AP_SHIP=3) arrives with ▼ already in the ring and RETRO engaged, so its opening is the capture's WAIT
// itself (no correction); and its failing Thrust Ctrl's first burst ends a SKIP (the alarm), so F is pressed again
// whenever the WAIT offers it, until HOLD NOW.
export function flyToCapture(harness: Harness): void {
  harness.reset(1);
  harness.step();
  if (!/^WAIT/.test(text(harness))) {
    harness.keyDown('Space');
    // WP12 p3: on a fast ▼ correction (HALCYON's, KESTREL's, LAST LIGHT's) RELEASE now comes a human reaction before ▼
    // reaches the sweet zone's middle (tuning.ts RELEASE_LEAD_TAC), so a kid letting go 0.4–1.2 s later lands in the
    // ring. This scripted kid lets go with no reaction at all, so it holds on until ▼ is in the sweet zone (where the old
    // line said RELEASE, read like the line reads it: the instruments' ▼), the capture these suites were measured on.
    // Ship 1's slow correction is unchanged.
    const sweet = sweetZone(harness.store.getState().level.ring);
    const goingUp = harness.store.getState().burn.sasMode === 'radial-out';
    const reachedZone = (): boolean => {
      const sensedRp = getSensedPrediction().rp;
      return goingUp ? sensedRp >= sweet.lo : sensedRp <= sweet.hi;
    };
    stepUntil(harness, () => /^RELEASE/.test(text(harness)) && reachedZone(), 30);
    harness.keyUp('Space');
    stepUntil(harness, () => /TURN AROUND/.test(text(harness)), 5);
    harness.press('KeyS');
    stepUntil(harness, () => /^WAIT/.test(text(harness)), 10);
  }
  stepUntil(harness, () => {
    if (/^WAIT.*\[F\] SKIP/.test(text(harness)) && harness.store.getState().clock.skipWarp === null) harness.press('KeyF');
    return /HOLD \[SPACE\] NOW/.test(text(harness));
  }, 120);
}

// Deferred 3: the kid who lets go the moment the chip says CAPTURED (the loop just closed).
export function releaseAtCapture(harness: Harness): void {
  flyToCapture(harness);
  harness.keyDown('Space');
  stepUntil(harness, () => getPrediction().outcome === 'closed', 30);
  harness.keyUp('Space');
}

// Deferred 4: the opening correction stopped at `lowestKm` (▼ below or above the ring), the correction
// ignored by SKIPping past it, up to the capture's "brake anyway". WP7: the correction moves ▼ whichever way
// the ship's start preset does (ship 1's OUT raises it, HALCYON's IN lowers it: AP_SHIP=1), so the burn is
// held until ▼ reaches lowestKm from either side.
export function captureOffRing(harness: Harness, lowestKm: number): void {
  harness.reset(1);
  const raising = harness.rp() < lowestKm;
  // WP10: VESPER starts on RETRO (no correction to make): the correction's preset is chosen for the way ▼ must go,
  // and flown at 10% POWER, because at 25,000 km on VESPER's ×30 one full-POWER tick of RADIAL moves ▼ about 190 km
  // (it jumped from 3,575 to 3,388, under the surface, over the ▼ 3,450 this suite asks for).
  const sas = harness.store.getState().burn.sasMode;
  const presetless = sas !== 'radial-out' && sas !== 'radial-in';
  if (presetless) {
    harness.press(raising ? 'KeyD' : 'KeyA');
    harness.store.mutate((d) => { d.burn.thrustPct = 10; });
  }
  harness.keyDown('Space');
  while ((raising ? harness.rp() < lowestKm : harness.rp() > lowestKm) && harness.status() === 'approaching') harness.step();
  harness.keyUp('Space');
  if (presetless) harness.store.mutate((d) => { d.burn.thrustPct = 100; });
  harness.press('KeyS');
  for (let i = 0; i < 40; i++) harness.step();
  harness.press('KeyF');
  stepUntil(harness, () => /brake anyway|NOW|GET READY/.test(text(harness)), 600);
}

// The verifier's own strip-obeyer from .tmp/wp1fix2: releases on RELEASE / HOLD STEADY /
// TOO EARLY / WAIT / TURN AROUND, presses any named preset, holds on NOW / KEEP HOLDING /
// hold [SPACE], presses F whenever the line offers SKIP. Reacts at once; returns what it saw.
export interface ObeyLog {
  lines: string[];        // distinct lines, digits normalised, in order
  skipWallSec: number;    // wall seconds spent in SKIP (all SKIPs together)
  longestWaitTac: number; // the longest WAIT countdown shown, in tactical seconds
  longestSkipSec: number; // WP11: the longest single SKIP, wall seconds
  skips: number;          // WP11: how many SKIPs ran
  zoneHoldSec: number;    // WP11: wall seconds a hazard zone held a WAIT at TACTICAL (see zoneHolds)
  zoneHolds: number;      // WP11: ...in how many separate stretches
}

// WP11: §6.8 holds TACTICAL from a zone's lead to its exit, and LAST LIGHT's belt (9,000–12,000 km) lies across every
// loop still big after the capture, so the WAIT for ▼ crosses it at TACTICAL (twice after 60 s of ignoring: about
// 84 wall s each, PROGRESS.md WP11). Those seconds are the zone's, not the guidance's: counted here (the strip says
// WAIT, SKIP is refused for the zone, nothing else holds the pace) so a suite can keep its wall-time promises for the
// kid's own seconds. Each stretch can also split one SKIP into two.
const ZONE_KINDS: readonly ZoneHit['kind'][] = ['debris', 'belt'];
const ZONE_REFUSALS = new Set(ZONE_KINDS.flatMap((kind) => [skipRefusalZoneAhead(kind), skipRefusalInZone(kind)]));
function zoneHoldsWait(harness: Harness, holding: boolean): boolean {
  const state = harness.store.getState();
  if (holding || state.clock.pace !== 'tactical') return false;
  const pred = getPrediction();
  const reason = skipBlockReason(state, pred);
  if (reason === null || !ZONE_REFUSALS.has(reason)) return false;
  return flightObjective(buildFlightContext(state, pred))?.urgency === 'wait';
}

export function obey(harness: Harness, maxWall: number, onTick?: () => void): ObeyLog {
  let holding = false;
  const log: ObeyLog = { lines: [], skipWallSec: 0, longestWaitTac: 0, longestSkipSec: 0, skips: 0, zoneHoldSec: 0, zoneHolds: 0 };
  let skipRun = 0;
  let inZoneHold = false;
  const end = harness.wall() + maxWall;
  while (harness.wall() < end && harness.status() === 'approaching') {
    const line = text(harness);
    const normal = line.replace(/\d+:\d+/g, 'm:ss');
    if (log.lines[log.lines.length - 1] !== normal) log.lines.push(normal);
    const wait = line.match(/^WAIT — .* in (\d+):(\d+)/);
    if (wait) log.longestWaitTac = Math.max(log.longestWaitTac, Number(wait[1]) * 60 + Number(wait[2]));
    if (line.includes('[F]') && harness.store.getState().clock.skipWarp === null) harness.press('KeyF');
    const press = line.match(/press \[([WASD])\]/);
    if (press) harness.press(`Key${press[1]}`);
    if (holding && /RELEASE|HOLD STEADY|TOO EARLY|WAIT|TURN AROUND/.test(line)) { harness.keyUp('Space'); holding = false; }
    else if (!holding && /NOW|KEEP HOLDING|hold \[SPACE\]/.test(line)) { harness.keyDown('Space'); holding = true; }
    if (harness.store.getState().clock.pace === 'skip') {
      log.skipWallSec += TICK;
      if (skipRun === 0) log.skips++;
      skipRun += TICK;
      log.longestSkipSec = Math.max(log.longestSkipSec, skipRun);
    } else skipRun = 0;
    const zoneHold = zoneHoldsWait(harness, holding);
    if (zoneHold) log.zoneHoldSec += TICK;
    if (zoneHold && !inZoneHold) log.zoneHolds++;
    inZoneHold = zoneHold;
    harness.step();
    onTick?.();
  }
  if (holding) harness.keyUp('Space');
  return log;
}
