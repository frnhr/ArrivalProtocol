import type { GameState, ShipOutcome } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  DropFactors, DropSolution, ForgivenessClass, LandingTally, LaunchAsk, LaunchRefusal, LaunchSource, LzResult, LzState,
  LzWindow, NoGoArcState, OnTargetTally, ParkReason, Place, PodFate, PodRecord, PodSummary, ShipLandingDef, Touch,
} from '@/types/landing';
import type { Capabilities } from '@systems/capabilities';
import type { Rng } from '@systems/rng';
import { driversInMemory } from '@state/selectors';
import { angleDelta, secFromNow } from '@systems/landing-solve';
import { COLONY_NAME_POOL, familyColonyName } from '@data/landing-text';
import {
  BAND_DEGRADED_MIN, BAND_FAILING_MIN, COLONISTS_PER_POD, COLONY_FAMILY_NAME_CHANCE, HARD_LANDING_FACTOR, MISLANDED_FACTOR,
  OFF_SITE_SCORE_BY_CLASS, STAR_ON_TARGET_FRAC,
} from '@data/tuning';

// The landing's rules (01-landing §3.3–§3.10), pure: they read GameState (or plain data) and change nothing, so the sim
// (landing.ts), the guidance table, the views, AUTODROP and the tests share one answer. Only landing.ts writes state.

// --- Drivers and the bay -----------------------------------------------------------------------------------------------

// A driver the bay may launch now (§3.4): not being eaten, not worked on, not moving, repairing or offline, and not dead
// (integrity ≥ BAND_FAILING_MIN). A repair started before its turn therefore always finishes first.
export function isLaunchable(d: Readonly<DriverSegment>): boolean {
  if (d.infected || d.operating) return false;
  if (d.state === 'transferring' || d.state === 'repairing' || d.state === 'offline') return false;
  return d.integrity >= BAND_FAILING_MIN;
}

// How a driver lands (§3.8): the failing band (below BAND_DEGRADED_MIN) lands HARD. A dead one never launches.
export function driverTouch(integrity: number): Touch {
  return integrity < BAND_DEGRADED_MIN ? 'hard' : 'soft';
}

export function podRecord(state: Readonly<GameState>, pod: number): PodRecord {
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (!record) throw new Error(`podRecord: no pod ${pod} on this ship (${state.landing.pods.length} pods)`);
  return record;
}

export function podsWithFate(state: Readonly<GameState>, kind: PodFate['kind']): PodRecord[] {
  return state.landing.pods.filter((record) => record.fate.kind === kind);
}

// The launch order (§3.4): LOAD NEXT's pod first if it can launch, then the lowest address that can. Launchable
// drivers only: the bay count is a budget, so an infection never ejects anything, it just skips that driver.
export function launchQueue(state: Readonly<GameState>): DriverSegment[] {
  const launchable = driversInMemory(state).filter(isLaunchable);
  const pinned = launchable.find((driver) => driver.pod === state.landing.loadNext);
  return pinned ? [pinned, ...launchable.filter((driver) => driver !== pinned)] : launchable;
}

export function nextToLaunch(state: Readonly<GameState>): DriverSegment | null {
  return launchQueue(state)[0] ?? null;
}

// What the bay shows as ready (`BAY ▮▮▮▯ 3/4`): its loaded slots, but never more than the pods that could go.
export function bayShown(state: Readonly<GameState>): number {
  return Math.min(state.landing.bay.loaded, launchQueue(state).length);
}

// The MIND's BAY / NEXT tags (§3.4): the drivers the bay would launch next, in order, and the very next one.
export function bayMembers(state: Readonly<GameState>): { bay: number[]; next: number | null } {
  const queue = launchQueue(state);
  return { bay: queue.slice(0, bayShown(state)).map((driver) => driver.pod), next: queue[0]?.pod ?? null };
}

// A pod can still launch some day: it is aboard and its driver is in memory (a dead one can be repaired).
export function canEverLaunch(state: Readonly<GameState>, pod: number): boolean {
  return podRecord(state, pod).fate.kind === 'aboard' && driversInMemory(state).some((driver) => driver.pod === pod);
}

// --- Where a pod lands -------------------------------------------------------------------------------------------------

// The bracket a surface angle lies in (brackets never overlap: validateLandingDef), or null.
export function lzAt(lzs: readonly LzState[], rad: number): LzState | null {
  return lzs.find((lz) => Math.abs(angleDelta(lz.centreRad, rad)) <= lz.halfWidthRad) ?? null;
}

export function noGoAt(noGo: readonly NoGoArcState[], rad: number): NoGoArcState | null {
  return noGo.find((arc) => Math.abs(angleDelta(arc.centreRad, rad)) <= arc.halfWidthRad) ?? null;
}

// Pods per LZ label: `down` counts pods already down in it (touchdown order: what decides MISLANDED, §3.5); `projected`
// adds the falling pods whose landing point lies in it (the guard at [L] and AUTODROP's remaining counts, risk 12).
export type LzFill = Record<string, number>;

function emptyFill(lzs: readonly LzState[]): LzFill {
  const fill: LzFill = {};
  for (const lz of lzs) fill[lz.label] = 0;
  return fill;
}

export function lzDownFill(state: Readonly<GameState>): LzFill {
  const fill = emptyFill(state.landing.lzs);
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'down' || record.fate.touchdown.lz === null) continue;
    fill[record.fate.touchdown.lz] = (fill[record.fate.touchdown.lz] ?? 0) + 1;
  }
  return fill;
}

export function lzProjectedFill(state: Readonly<GameState>): LzFill {
  const fill = lzDownFill(state);
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'falling') continue;
    const lz = lzAt(state.landing.lzs, record.fate.launch.landingRad);
    if (lz !== null) fill[lz.label] = (fill[lz.label] ?? 0) + 1;
  }
  return fill;
}

// Pods each LZ still has room for, by the projected fill (never negative).
export function lzRemaining(state: Readonly<GameState>): Record<string, number> {
  const fill = lzProjectedFill(state);
  const remaining: Record<string, number> = {};
  for (const lz of state.landing.lzs) remaining[lz.label] = Math.max(0, lz.pods - (fill[lz.label] ?? 0));
  return remaining;
}

export interface Placement {
  place: Place;
  lz: string | null;
}

// Where a landing point counts (§3.9): a no-go arc first (none in 1a), then a bracket (with room: 'lz'; already at its
// count by `fill`: 'mislanded'), else off-site.
export function classifyLanding(lzs: readonly LzState[], noGo: readonly NoGoArcState[], rad: number, fill: Readonly<LzFill>): Placement {
  if (noGoAt(noGo, rad) !== null) return { place: 'no-go', lz: null };
  const lz = lzAt(lzs, rad);
  if (lz === null) return { place: 'off-site', lz: null };
  return { place: (fill[lz.label] ?? 0) >= lz.pods ? 'mislanded' : 'lz', lz: lz.label };
}

// How far outside the nearest bracket a landing point is, in km of surface (the report's near misses); null inside one.
export function missKm(lzs: readonly LzState[], rad: number, R: number): number | null {
  if (lzAt(lzs, rad) !== null) return null;
  let best = Infinity;
  for (const lz of lzs) best = Math.min(best, (Math.abs(angleDelta(lz.centreRad, rad)) - lz.halfWidthRad) * R);
  return Number.isFinite(best) ? best : null;
}

// --- Scoring (§3.9) ----------------------------------------------------------------------------------------------------

export function placeValue(place: Place, cls: ForgivenessClass): number {
  switch (place) {
    case 'lz': return 1;
    case 'mislanded': return MISLANDED_FACTOR;
    case 'off-site': return OFF_SITE_SCORE_BY_CLASS[cls];
    case 'no-go': return 0;
    default: throw new Error(`placeValue: unknown place '${String(place)}'`);
  }
}

// Points for one pod: colonists × place × touch, always a whole number (every factor is a quarter or a half of 200).
export function podPoints(place: Place, touch: Touch, cls: ForgivenessClass, colonists: number): number {
  const points = colonists * placeValue(place, cls) * (touch === 'hard' ? HARD_LANDING_FACTOR : 1);
  if (!Number.isInteger(points)) throw new Error(`podPoints: ${colonists} × ${place} × ${touch} on ${cls} is ${points}, not whole`);
  return points;
}

// --- The launch path's checks (§3.3) -----------------------------------------------------------------------------------

// The drop width's multipliers for `driver` (§3.8). All 1 in 1a: 1b fills the Sensor Interp and Nav Plotter factors
// from `caps.drop` and the driver's from its band. Only the factor sources change then (plan §1.7).
export function dropFactors(_caps: Readonly<Capabilities>, _driver: Readonly<DriverSegment> | null): DropFactors {
  return { sensor: 1, plotter: 1, driver: 1 };
}

// The in-band window open now (the dot's centre in a bracket while the ship is in the band, risk 13), or null. Times are
// rebased from the solution's asOfTSec to `nowTSec`.
export function openInBandWindow(sol: Readonly<DropSolution> | null, nowTSec?: number): LzWindow | null {
  if (sol === null || sol.block !== null) return null;
  const now = nowTSec ?? sol.asOfTSec;
  return sol.windows.find((w) => w.inBand && secFromNow(sol, w.openInSec, now) <= 0 && secFromNow(sol, w.closeInSec, now) > 0) ?? null;
}

export function anyInBandWindowOpen(sol: Readonly<DropSolution> | null, nowTSec?: number): boolean {
  return openInBandWindow(sol, nowTSec) !== null;
}

// The driver a launch would take: `pod`'s if named (it must be in memory), else nextToLaunch.
function driverFor(state: Readonly<GameState>, pod: number | undefined): DriverSegment | null {
  if (pod === undefined) return nextToLaunch(state);
  return driversInMemory(state).find((driver) => driver.pod === pod) ?? null;
}

// Why a launch can't go now, in the order of the LaunchRefusal union; null: it can. SHIP SCREEN applies to the kid's
// [L] only: a controller that may launch from MIND (LandingController.launchesFromMind) is asked by landing.ts.
export function launchRefusal(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null, source: LaunchSource, pod?: number,
): LaunchRefusal | null {
  if (state.run.phase !== 'landing') return 'NOT LANDING';
  if (state.landing.ended !== null) return 'LANDING OVER';
  if (state.clock.paused) return 'PAUSED';
  if (source === 'player' && state.ui.mode === 'memory') return 'SHIP SCREEN';
  if (state.burn.lastTickDvKmS > 0) return 'ENGINE FIRING';
  if (sol === null || sol.block !== null || sol.dot === null) return 'NO DROP SOLUTION';
  if (!sol.dot.inBand) return 'OUT OF THE LAUNCH BAND';
  const driver = driverFor(state, pod);
  if (driver === null || !isLaunchable(driver)) return 'NO POD READY';
  if (state.landing.bay.cadenceLeftTac > 0) return 'RELOADING';
  if (state.landing.bay.loaded < 1) return 'BAY EMPTY';
  return null;
}

export interface LaunchGuard {
  ask: LaunchAsk;
  points: number;
  lz: string | null;   // the full LZ ('full'), else null
}

// The inline confirm a launch needs first (§3.3), or null: the dot outside every bracket asks `LAUNCH OFF-SITE? …
// scores 100`, a bracket already full by the projected fill asks `LZ-A IS FULL — LAUNCH ANYWAY? scores 150`. The
// points are what the pod would score landing at the dot's centre.
export function launchGuard(state: Readonly<GameState>, sol: Readonly<DropSolution>, pod?: number): LaunchGuard | null {
  const driver = driverFor(state, pod);
  if (driver === null || sol.dot === null) return null;
  const { landing } = state;
  const touch = driverTouch(driver.integrity);
  const placement = classifyLanding(landing.lzs, landing.noGo, sol.dot.rad, lzProjectedFill(state));
  const points = podPoints(placement.place, touch, landing.forgiveness, driver.colonists);
  if (placement.place === 'off-site' || placement.place === 'no-go') return { ask: 'off-site', points, lz: null };
  if (placement.place === 'mislanded') return { ask: 'full', points, lz: placement.lz };
  return null;
}

// --- The ship's result -------------------------------------------------------------------------------------------------

// Outcomes after which the ship is still in orbit: pods still aboard are released and parked (§3.10). Any other ending
// (crashed, escaped, abandoned) took them out of orbit with the ship: NOT LAUNCHED.
export function endsInOrbit(outcome: ShipOutcome): boolean {
  return outcome === 'locked' || outcome === 'partial' || outcome === 'stranded' || outcome === 'emergency';
}

// Why a pod still aboard is parked when the landing ends in orbit.
export function parkReasonOf(record: Readonly<PodRecord>): ParkReason {
  return record.driverLost ?? 'no-time';
}

// The fate a pod still aboard gets when the ship's landing is over with `outcome` (landing.ts parkAboard writes it).
export function finalFateOfAboard(record: Readonly<PodRecord>, outcome: ShipOutcome): PodFate {
  if (!endsInOrbit(outcome)) return { kind: 'not-launched' };
  const why = parkReasonOf(record);
  return { kind: 'parked', why, restorable: why === 'eaten' };
}

// The landing half of the ship's result (§5 "To 02"), folded from the pods. Pods still aboard count as they will end
// (parked or not launched, by `outcome`); a pod still falling has no result yet, so asking then is a bug.
export function landingResult(state: Readonly<GameState>, outcome: ShipOutcome): LandingTally {
  const { landing } = state;
  const rows = new Map<string, LzResult>();
  for (const lz of landing.lzs) rows.set(lz.label, { lz: lz.label, count: lz.pods * COLONISTS_PER_POD, landed: 0, mislanded: 0, hard: 0 });
  const tally: LandingTally = {
    colonistsAboard: 0, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedOnTarget: 0, points: 0,
    colony: landing.colony, pods: [],
  };
  for (const record of landing.pods) {
    const fate = record.fate.kind === 'aboard' ? finalFateOfAboard(record, outcome) : record.fate;
    tally.colonistsAboard += record.colonists;
    if (record.restored) tally.restored += record.colonists;
    const summary: PodSummary = {
      pod: record.pod, family: record.family, colonists: record.colonists, fate: fate.kind, place: null, lz: null, touch: null,
      points: 0, parkedWhy: null, restored: record.restored,
    };
    switch (fate.kind) {
      case 'falling':
        throw new Error(`landingResult: ${record.pod} is still falling (landing.ts settles every fall before the result)`);
      case 'aboard':
        throw new Error('landingResult: a pod aboard was not given its final fate');
      case 'parked':
        tally.parked.push({ pod: record.pod, why: fate.why });
        summary.parkedWhy = fate.why;
        break;
      case 'not-launched':
        tally.notLaunched += record.colonists;
        break;
      case 'down': {
        const { place, lz, points } = fate.touchdown;
        summary.place = place;
        summary.lz = lz;
        summary.touch = fate.launch.touch;
        summary.points = points;
        tally.points += points;
        if (place === 'off-site') tally.offSite += record.colonists;
        else if (place === 'no-go') tally.noGo += record.colonists;
        else {
          const row = rows.get(lz ?? '');
          if (!row) throw new Error(`landingResult: pod ${record.pod} landed in an unknown LZ '${lz}'`);
          if (place === 'lz') { row.landed += record.colonists; tally.landedOnTarget += record.colonists; } else row.mislanded += record.colonists;
          if (fate.launch.touch === 'hard') row.hard += record.colonists;
        }
        break;
      }
      default:
        throw new Error(`landingResult: unknown fate '${String((fate as PodFate).kind)}'`);
    }
    tally.pods.push(summary);
  }
  tally.lzs = [...rows.values()];
  return tally;
}

// ★ ON TARGET (§3.9), live or final. A pod counts once it is down soft in an LZ with room; the denominator is every pod
// the ship arrived with, launched or not.
export function onTargetTally(state: Readonly<GameState>): OnTargetTally {
  let onTargetPods = 0;
  let onTargetColonists = 0;
  let colonists = 0;
  let stillOpen = 0;  // colonists whose landing is not decided yet: aboard with a driver in memory, or falling
  const inMemory = new Set(driversInMemory(state).map((driver) => driver.pod));
  for (const record of state.landing.pods) {
    colonists += record.colonists;
    const { fate } = record;
    if (fate.kind === 'down' && fate.touchdown.place === 'lz' && fate.launch.touch === 'soft') {
      onTargetPods++;
      onTargetColonists += record.colonists;
    } else if (fate.kind === 'falling' || (fate.kind === 'aboard' && inMemory.has(record.pod))) {
      stillOpen += record.colonists;
    }
  }
  const needed = STAR_ON_TARGET_FRAC * colonists;
  return {
    onTargetPods, pods: state.landing.pods.length, onTargetColonists, colonists,
    earned: colonists > 0 && onTargetColonists >= needed,
    possible: colonists > 0 && onTargetColonists + stillOpen >= needed,
  };
}

// --- The colony ----------------------------------------------------------------------------------------------------------

// The colony's one name per ship (05 §), given at the first touchdown: the run-1 written name where the def has one
// (RIVERSIDE), else `{FAMILY} LANDING` after the first family down half the time (COLONY_FAMILY_NAME_CHANCE), else one
// from the pool. `rng` is childRng(seed, shipIndex, 'colony'), so a ship's colony replays from the run's seed.
export function colonyName(def: Pick<ShipLandingDef, 'colonyFirstRun'>, firstFamily: string, rng: Rng, firstRun: boolean): string {
  if (firstRun && def.colonyFirstRun !== null) return def.colonyFirstRun;
  if (rng() < COLONY_FAMILY_NAME_CHANCE) return familyColonyName(firstFamily);
  const name = COLONY_NAME_POOL[Math.floor(rng() * COLONY_NAME_POOL.length)];
  if (name === undefined) throw new Error('colonyName: the colony name pool is empty');
  return name;
}
