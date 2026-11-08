// Slices 4c–4e: the lead owns this file (slice-4cde-plan.md §7.2); tracks ask by message.
import type { BurnStatus, GameState, ShipOutcome } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  DropDot, DropFactors, DropSolution, ForgivenessClass, GoLowerFit, LandingEnd, LandingTally, LandingView, LandingWindow, LaunchAsk, LaunchRecord,
  LaunchRefusal, LaunchSource, LzResult, LzState, LzWindow, NoGoArcState, OnTargetTally, ParkReason, Place, PodFate, PodFateKind,
  PodRecord, PodSummary, RepairHint, ShipLandingDef, TerrainWord, TooWide, Touch, Touchdown, LzGround,
} from '@/types/landing';
import type { SegmentRole } from '@/types/segment';
import type { Capabilities } from '@systems/capabilities';
import type { PredictOutcome } from '@systems/predict';
import type { Rng } from '@systems/rng';
import { autoburnHoldsLandingOrbit, driversInMemory, filesWithRole, integrityBand, repairPossible } from '@state/selectors';
import { bayCapability, capabilitiesNow, roleHealth } from '@systems/capabilities';
import { groundAt } from '@state/survey-selectors';
import { angleDelta, dropHalfWidthKm, secFromNow } from '@systems/landing-solve';
import {
  decayForecast, decayWarned, dragLineKm, goLowerFit, highestFittingRadius, sureTacAt, timeToAngle, travelSign,
} from '@systems/landing-orbit';
import { COLONY_NAME_POOL, LAUNCH_CONFIRM_TEXT, familyColonyName } from '@data/landing-text';
import {
  BAND_DEGRADED_MIN, BAND_FAILING_MIN, COLONISTS_PER_POD, COLONY_FAMILY_NAME_CHANCE, DRAG_LIFT_MARGIN_KM, DRIVER_DROP_FACTOR_BY_BAND, GO_LOW_FLOOR_MARGIN_KM,
  HARD_LANDING_FACTOR, MISLANDED_FACTOR, OFF_SITE_SCORE_BY_CLASS, STAR_ON_TARGET_FRAC,
} from '@data/tuning';

// The landing's rules (01-landing §3.3–§3.10), pure: they read GameState (or plain data) and change nothing, so the sim
// (landing.ts), the guidance table, the views, AUTODROP and the tests share one answer. Only landing.ts writes state.

// --- Drivers and the bay -----------------------------------------------------------------------------------------------

// A driver the bay may launch now (§3.4): not being eaten, not worked on, not moving, repairing or offline, and not dead
// (integrity ≥ BAND_FAILING_MIN). A repair started before its turn therefore always finishes first. Slice 5 (plan R7): and
// not locked by a corrupted resident (DriverSegment.lockedBy), so the queue, the bay's count and AUTODROP's view (all from
// launchQueue) leave a locked pod out.
export function isLaunchable(d: Readonly<DriverSegment>): boolean {
  if (d.lockedBy !== undefined) return false;
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

export function podsWithFate(state: Readonly<GameState>, kind: PodFateKind): PodRecord[] {
  return state.landing.pods.filter((record) => record.fate.kind === kind);
}

// How many pods have each fate now: the one count the sim, pace, the table and the views share.
export type PodCounts = Record<PodFateKind, number>;

export function podCounts(state: Readonly<GameState>): PodCounts {
  const counts: PodCounts = { aboard: 0, falling: 0, down: 0, parked: 0, 'not-launched': 0 };
  for (const record of state.landing.pods) counts[record.fate.kind]++;
  return counts;
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

// Slice 5 review M3: whether a resident's lock can still be freed on this ship. The corrupted resident's module answers
// (resident-corrupted.ts lockRemedy: a DELETE in hand, the charge for the cure, its DEAL standing or still to come, or an op
// already on its file); with none registered every lock counts as freeable (plan R7). A resolver of the state, no data of its
// own (as landing-controller.ts's registry), so this module stays free of the residents' stateful imports.
type LockFreeable = (state: Readonly<GameState>) => boolean;
let lockFreeable: LockFreeable | null = null;

export function registerLockRemedy(resolve: LockFreeable): () => void {
  if (lockFreeable !== null) throw new Error('registerLockRemedy: a lock remedy is already registered');
  lockFreeable = resolve;
  return () => {
    if (lockFreeable === resolve) lockFreeable = null;
  };
}

export function lockCanBeFreed(state: Readonly<GameState>): boolean {
  return lockFreeable === null || lockFreeable(state);
}

// A driver in memory can launch some day (review M2): at or above the failing band it only waits for what holds it (an
// infection is cured or eats it, an op ends); below it (dead) it needs a REPAIR: one already running on it, or one the
// kid can still start (selectors repairPossible: a usable Repair and charge ≥ 1, as the root's duel judges its Rm).
// Without that its pod can never launch, so L12 and the risk-7 auto-end take over instead of a landing open for good.
// Slice 5 (plan R7): a lock (lockedBy) does not change it while it can be freed (the resident deleted, cured or paid), so
// the auto-end never ends a landing the kid could still free; END LANDING parks it. Review M3: a lock nothing aboard can
// free is a pod that can never launch, as a dead driver with no REPAIR is: L12 and the auto-end take over, and it parks
// locked. A remedy that comes later (a DELETE, a spare for the DEAL) makes it launchable again.
export function driverCanEverLaunch(state: Readonly<GameState>, driver: Readonly<DriverSegment>): boolean {
  if (driver.lockedBy !== undefined && !lockCanBeFreed(state)) return false;
  if (driver.integrity >= BAND_FAILING_MIN || driver.state === 'repairing') return true;
  return repairPossible(state);
}

// A pod can still launch some day: it is aboard and its driver is in memory and can launch some day.
export function canEverLaunch(state: Readonly<GameState>, pod: number): boolean {
  if (podRecord(state, pod).fate.kind !== 'aboard') return false;
  const driver = driversInMemory(state).find((candidate) => candidate.pod === pod);
  return driver !== undefined && driverCanEverLaunch(state, driver);
}

// The drivers of the pods aboard that can launch some day (the table's anyCanEver, the auto-end, the moment's `awaited`).
export function driversThatCanEverLaunch(state: Readonly<GameState>): DriverSegment[] {
  const aboard = new Set(state.landing.pods.filter((record) => record.fate.kind === 'aboard').map((record) => record.pod));
  return driversInMemory(state).filter((driver) => aboard.has(driver.pod) && driverCanEverLaunch(state, driver));
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

// A driver's own factor on the drop width (§3.8's table, DRIVER_DROP_FACTOR_BY_BAND): ok 1, degraded 1.5, failing 2. A
// dead driver never launches, but DetailPanel asks for every driver, so dead has a (display-only) factor too.
export function driverDropFactor(integrity: number): number {
  return DRIVER_DROP_FACTOR_BY_BAND[integrityBand(integrity)];
}

// The drop width's multipliers for `driver` (§3.8): caps.drop's Sensor Interp and Nav Plotter factors, and the driver's
// from its band (driverDropFactor; 1 for null: no pod named). Never throws, whatever the bands: DetailPanel calls it for
// every driver in memory, the dead ones included, and drop-cache, launchRecordFor and L9 for the next pod.
// The three factors stay separate (not one product) because L9 asks what each REPAIR would take off (bestRepairForDrop).
// Their product is taken in exactly one place, landing-solve dropHalfWidthKm, so MERGE's blind drop (slice 7) is one
// more factor there (an optional `DropFactors.blind`, 1 when absent), not a change to every DropFactors literal.
export function dropFactors(caps: Readonly<Capabilities>, driver: Readonly<DriverSegment> | null): DropFactors {
  return {
    sensor: caps.drop.sensorFactor,
    plotter: caps.drop.plotterFactor,
    driver: driver === null ? 1 : driverDropFactor(driver.integrity),
  };
}

// Bay Ctrl is missing (§3.4's BAY OFFLINE): no pod can launch on this ship any more (a ship file with no backup, risk 8).
// Read from the file's health directly through capabilities bayCapability (the one rule), so the pure rules below need
// no Capabilities passed in and never depend on the ops core's threads.
export function bayOfflineIn(state: Readonly<GameState>): boolean {
  return bayCapability(roleHealth(state, 'bay').band).offline;
}

// --- Slice 1b: L9, the no-go reach, the stuck landing (Track DROP) ----------------------------------------------------

// Whole orbits until decay takes ▼ out of the band, when that is within DECAY_WARN_ORBITS (L10's warning), else null:
// the landing goes on, the ship has drag, and the forecast says so (landing-orbit decayForecast). L10 and L9's
// `goLower` read this one rule, so GO LOWER is never offered while L10 asks for the 'lift' burn.
export function decayWarnOrbits(state: Readonly<GameState>): number | null {
  const { landing, level } = state;
  if (!landing.drag || landing.ended !== null) return null;
  const orbits = decayForecast(state.orbit, level.planet.mu, level.ring, landing.drag).orbitsToLeave;
  return decayWarned(orbits) ? orbits : null;
}

// The window has a sure part (the whole dot inside the bracket) inside its in-band span: a launch there lands in the LZ
// whatever u rolls. The one test launchMomentInSec and L9 share.
function sureInBand(w: Readonly<LzWindow>): boolean {
  return w.inBandOpenInSec !== null && w.inBandCloseInSec !== null && w.sureOpenInSec !== null && w.sureCloseInSec !== null
    && w.sureOpenInSec < w.inBandCloseInSec && w.sureCloseInSec > w.inBandOpenInSec;
}

// L9 (§3.11, plan §1.5): the awaited LZ (landingMoment's target) has no sure window this pass (no sure part inside its
// in-band span), and a REPAIR (bestRepairForDrop) or GO LOWER (landing-orbit goLowerFit !== null) would give one; null
// otherwise, and with neither (then L5 shows at the window). Never `{ repair: null, goLower: null }`: that is null (the
// table throws on it). `goLower` is false while decay is warned (decayWarnOrbits: L10's 'lift' burn goes up, and GO
// LOWER would fight it); L10 sits above L9 in the table anyway. The factors are the next pod's (dropFactors with
// nextToLaunch), the ones drop-cache solved the window with.
// The 'lift' burn's HOLD (review fix 2; predict landingInRingBurn plans to it), or null for the normal lift (▼ back over
// the DRAG line plus DRAG_LIFT_MARGIN_KM, and the kicks stop). The lift's job is to keep the orbit in the band (§3.7:
// "holding that orbit costs about 1% per orbit"), not to undo a GO LOWER the landing still needs. While an LZ with
// room would have no sure part from the normal lift's height (its L9 and GO LOWER would come back: GO LOWER and the
// lift took turns), the lift HOLDS the low orbit instead:
// - ▼ no lower than `rpKm`: the band floor plus GO_LOW_FLOOR_MARGIN_KM, or the highest radius where those LZs get GO
//   LOWER's sure window (landing-orbit highestFittingRadius, GO LOWER's target on a circle), whichever is higher, never
//   over the normal target;
// - ▲ no lower than `raKm`, the middle of the band: under the DRAG line each kick at ▼ takes the far side down (KESTREL
//   from 5,100 km: about 24 m/s, ~1% of FUEL, a kick), and a PRO burn at ▼ puts it back, every few orbits, before the
//   loop turns and ▼ sinks out of the band.
// Once no LZ with room needs the low orbit (filled, or none too wide from the line), the normal lift applies again.
export interface LiftHold {
  rpKm: number;
  raKm: number;
}

export function liftHold(state: Readonly<GameState>): LiftHold | null {
  const { ring, planet, tacticalWarp } = state.level;
  const normal = dragLineKm(ring) + DRAG_LIFT_MARGIN_KM;
  if (!state.landing.pods.some((record) => record.fate.kind === 'aboard')) return null;
  const remaining = lzRemaining(state);
  const factors = dropFactors(capabilitiesNow(state), nextToLaunch(state));
  const needLow = state.landing.lzs.filter((lz) => (remaining[lz.label] ?? 0) > 0
    && sureTacAt(normal, Math.sqrt(planet.mu / normal), lz, factors, planet.R, tacticalWarp) <= 0);
  if (needLow.length === 0) return null;
  const floorKm = ring.min + GO_LOW_FLOOR_MARGIN_KM;
  const fitting = highestFittingRadius(needLow, factors, { min: ring.min, max: normal }, planet.R, planet.mu, tacticalWarp, floorKm);
  return { rpKm: Math.min(normal, Math.max(floorKm, fitting ?? floorKm)), raKm: Math.max(normal, (ring.min + ring.max) / 2) };
}

// L9 says `or fly lower` only when GO LOWER's choice (goLowerChoice) is this very LZ (this pass's window, or its next pass
// when the ◇ comes after this one), so the line never asks for a burn that can't reach its window in time (review fix 1).
export function dropTooWide(state: Readonly<GameState>, sol: Readonly<DropSolution>, caps: Readonly<Capabilities>): TooWide | null {
  if (sol.block !== null || caps.bay.offline) return null;
  const target = landingMoment(state, sol, state.clock.tSec, caps.bay.offline).target;
  if (target === null || sureInBand(target.window)) return null;
  const lz = state.landing.lzs.find((candidate) => candidate.label === target.lz);
  if (lz === undefined) throw new Error(`dropTooWide: the awaited LZ '${target.lz}' is not on this ship`);
  const { window } = target;
  const repair = bestRepairForDrop(state, caps, lz, window.launchRadius);
  const decayWarned = decayWarnOrbits(state) !== null;
  const choice = decayWarned ? null : goLowerChoice(state, sol, caps);
  return tooWideVerdict(lz.label, window.launchRad, repair, choice?.lz === lz.label ? choice.fit : null, decayWarned);
}

// GO LOWER's window (§3.7, review fix 1): the burn is RETRO at the ◇, half an orbit before the launch point, so it only
// helps a window whose launch moment comes after the ◇. With LZs less than half an orbit apart (KESTREL) the ◇ of the
// window the landing awaits always came after that window, and GO LOWER could never be flown in time. The choice: the
// soonest window, this pass or the next, of an in-band LZ with room and no sure part, whose ◇ is still ahead of it,
// that goLowerFit fits and the tank pays for. Usually another LZ further round this pass, or the same LZ's next pass
// (one LZ). null: none, the landing not waiting on windows, or decay warned (L10's lift goes up first).
// landing.ts builds GO LOWER's aim from it; dropTooWide's `or fly lower` is the same answer for the awaited LZ.
export interface GoLowerChoice {
  lz: string;
  launchRad: number;
  fit: GoLowerFit;
  launchInSec: number;   // game s from now to that window's launch moment (the pass the burn is for)
}

// Slice 4e (plan R16): none while AUTOBURN v3 holds the landing orbit: it goes lower itself, and L9's slot is its own.
export function goLowerChoice(state: Readonly<GameState>, sol: Readonly<DropSolution>, caps: Readonly<Capabilities>): GoLowerChoice | null {
  if (autoburnHoldsLandingOrbit(state)) return null;
  if (sol.block !== null || caps.bay.offline || decayWarnOrbits(state) !== null) return null;
  const moment = landingMoment(state, sol, state.clock.tSec, caps.bay.offline);
  if (!moment.awaited) return null;
  const { level, orbit } = state;
  const mu = level.planet.mu;
  const passes = sol.periodSec > 0 ? [0, sol.periodSec] : [0];
  const candidates = moment.upcoming
    .filter((w) => !w.full && !sureInBand(w.window))
    .flatMap((w) => passes.map((extra) => ({ w, at: w.launchInSec + extra })))
    .sort((a, b) => a.at - b.at);
  const factors = dropFactors(caps, nextToLaunch(state));
  const fuelDvKmS = (state.burn.fuelPct / 100) * level.dvBudgetKmS;
  for (const { w, at } of candidates) {
    const launchRad = w.window.launchRad;
    if (!(timeToAngle(orbit, mu, launchRad - Math.PI * travelSign(orbit)) < at)) continue;
    const lz = state.landing.lzs.find((candidate) => candidate.label === w.lz);
    if (lz === undefined) throw new Error(`goLowerChoice: the window's LZ '${w.lz}' is not on this ship`);
    const fit = goLowerFit({
      lz, factors, ring: level.ring, R: level.planet.R, mu, warp: level.tacticalWarp, orbit, launchRad, fuelDvKmS,
    });
    if (fit !== null) return { lz: lz.label, launchRad, fit, launchInSec: at };
  }
  return null;
}

// L9's verdict from its parts (dropTooWide's last step; its own function so the GO LOWER cases are tested on crafted
// inputs whatever goLowerFit returns): GO LOWER counts only while decay is not warned (L10's 'lift' burn goes up), and
// with neither a REPAIR nor GO LOWER there is no L9 (null, never `{ repair: null, goLower: null }`).
export function tooWideVerdict(
  lz: string, launchRad: number, repair: RepairHint | null, fit: GoLowerFit | null, decayWarned: boolean,
): TooWide | null {
  const goLower = decayWarned ? null : fit;
  return repair === null && goLower === null ? null : { lz, repair, goLower, launchRad };
}

// An instrument whose REPAIR the kid can start now: its file is there and online (not already repairing or moving: L8
// and the plot say so), not a ship file (REPAIR refuses those: SWAP only), and a REPAIR with charge is at hand.
function instrumentRepairable(state: Readonly<GameState>, role: Extract<SegmentRole, 'sensor' | 'navplot'>): boolean {
  const health = roleHealth(state, role);
  if (health.band === 'missing' || health.offline !== null || !repairPossible(state)) return false;
  return filesWithRole(state, role).some((seg) => seg.type !== 'ship' && seg.type !== 'ship-backup');
}

// The REPAIR that gives `lz` a sure window from `launchRadius` (plan §1.5): the largest factor > 1 among the next pod's
// driver (when it is repairable and selectors repairPossible), Sensor Interp, then Nav Plotter, ties in that order. A
// repair "gives one" when the width with that factor at 1 is below the LZ's half-width. null: no single repair does.
// The largest factor leaves the narrowest dot, so if it gives no sure window no smaller one does; "gives one" is still
// tested per candidate, so a repair that can't help is never named.
export function bestRepairForDrop(
  state: Readonly<GameState>, caps: Readonly<Capabilities>, lz: Readonly<LzState>, launchRadius: number,
): RepairHint | null {
  const driver = nextToLaunch(state);
  const factors = dropFactors(caps, driver);
  const R = state.level.planet.R;
  const gives = (without: Partial<DropFactors>): boolean => dropHalfWidthKm(launchRadius, R, { ...factors, ...without }) < lz.widthKm / 2;
  const candidates: RepairHint[] = [];
  if (driver !== null && factors.driver > 1 && repairPossible(state) && gives({ driver: 1 })) {
    candidates.push({ file: 'driver', pod: driver.pod, factor: factors.driver });
  }
  if (factors.sensor > 1 && instrumentRepairable(state, 'sensor') && gives({ sensor: 1 })) candidates.push({ file: 'sensor', factor: factors.sensor });
  if (factors.plotter > 1 && instrumentRepairable(state, 'navplot') && gives({ plotter: 1 })) {
    candidates.push({ file: 'navplot', factor: factors.plotter });
  }
  let best: RepairHint | null = null;
  for (const candidate of candidates) if (best === null || candidate.factor > best.factor) best = candidate;
  return best;
}

// The no-go arc the dot's span (centre ± halfWidthKm) reaches, or null (risk 13: L5's `WIDE DROP, LAVA in reach`): a
// centre-based guard can't warn of a wide dot's edge. The nearest one when two are in reach. AUTODROP (4c) reads it to
// hold a launch.
export function noGoInReach(noGo: readonly NoGoArcState[], dot: Readonly<DropDot>, R: number): NoGoArcState | null {
  const spanRad = dot.halfWidthKm / R;
  let best: NoGoArcState | null = null;
  let bestGap = Infinity;
  for (const arc of noGo) {
    const gap = Math.abs(angleDelta(arc.centreRad, dot.rad)) - arc.halfWidthRad;
    if (gap <= spanRad && gap < bestGap) {
      best = arc;
      bestGap = gap;
    }
  }
  return best;
}

// Why END LANDING can't end the landing now, in this order; null: it can (§3.10, review B1). 'IMPACT': the ship is on a
// path into the planet (the prediction's outcome, passed in so this stays pure). Ending there parked the pods in orbit
// and scored the ship as in orbit a moment before it hit the ground (p1: KESTREL, ▼ at 1,000 km); the strip's F4 names
// the burn that saves it, and the landing ends by itself once the ship is safe, or lost ('ship-lost'). The auto-ends
// (every pod away, landingStuck's) hold while it is 'IMPACT' too (landing.ts landingEndHeld).
export type EndLandingRefusal = 'NOT LANDING' | 'LANDING OVER' | 'PAUSED' | 'IMPACT';

export function endLandingRefusal(state: Readonly<GameState>, outcome: PredictOutcome): EndLandingRefusal | null {
  if (state.run.phase !== 'landing') return 'NOT LANDING';
  if (state.landing.ended !== null) return 'LANDING OVER';
  if (state.clock.paused) return 'PAUSED';
  if (outcome === 'impact') return 'IMPACT';
  return null;
}

// Why the landing must end by itself (landing.ts noneLeftTick waits LANDING_NONE_LEFT_SEC, then ends it with this
// reason), or null: pods aboard and Bay Ctrl missing ('bay-offline': a ship file with no backup never comes back on this
// ship; first, as L12-bay leads the table), no driver that can ever launch ('no-driver-left', risk 7), or no drop dot on
// this orbit with the tank empty ('no-drop', review M1: an open path or an orbit outside the solver's domain that no
// burn can change; L12-nodrop says END LANDING). `sol`: drop-cache's solution (null outside the landing).
// landing.ts holds every auto-end while the ship is on a path into the planet (review B1).
export function landingStuck(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): LandingEnd | null {
  const aboard = state.landing.pods.some((record) => record.fate.kind === 'aboard');
  if (!aboard) return null;
  if (bayOfflineIn(state)) return 'bay-offline';
  if (driversThatCanEverLaunch(state).length === 0) return 'no-driver-left';
  if (sol !== null && sol.block === null && sol.dot === null && state.burn.fuelPct <= 0) return 'no-drop';
  return null;
}

// The in-band window open now (the dot's centre in a bracket while the ship is in the band, risk 13), or null: inside the
// window's in-band span (LzWindow.inBandOpenInSec/inBandCloseInSec, the window intersected with the band crossings), so
// it agrees with launchRefusal's OUT OF THE LAUNCH BAND on a window that straddles a band edge. Times are rebased from
// the solution's asOfTSec to `nowTSec`. landing.ts turns this into LandingState.window each AI tick; everything else
// reads that STATE (windowOpenNow / state.landing.window), never the drop cache.
export function openInBandWindow(sol: Readonly<DropSolution> | null, nowTSec?: number): LzWindow | null {
  if (sol === null || sol.block !== null) return null;
  const now = nowTSec ?? sol.asOfTSec;
  return sol.windows.find((w) => w.inBandOpenInSec !== null && w.inBandCloseInSec !== null
    && secFromNow(sol, w.inBandOpenInSec, now) <= 0 && secFromNow(sol, w.inBandCloseInSec, now) > 0) ?? null;
}

export function anyInBandWindowOpen(sol: Readonly<DropSolution> | null, nowTSec?: number): boolean {
  return openInBandWindow(sol, nowTSec) !== null;
}

// LandingState.window for a solution (landing.ts writes it): the in-band window open now, SURE while the whole dot fits.
export function windowOpenNow(sol: Readonly<DropSolution> | null, nowTSec: number): LandingWindow | null {
  const open = openInBandWindow(sol, nowTSec);
  if (open === null || sol === null) return null;
  const sure = open.sureOpenInSec !== null && open.sureCloseInSec !== null
    && secFromNow(sol, open.sureOpenInSec, nowTSec) <= 0 && secFromNow(sol, open.sureCloseInSec, nowTSec) > 0;
  return { lz: open.lz, sure };
}

// The solution's windows as they stand at `nowTSec` (times still relative to its asOfTSec): one that has closed since
// the solution was solved comes round again a period later, because the orbit repeats exactly between kicks (and a kick
// bumps orbitEpoch, which re-solves). Without it a cache up to a refresh old shows no next window for that LZ for a tick
// after its window closed (ARES-VII, one LZ: the strip had no row for that tick). Likewise an in-band span that is
// over while the window is still open: the next in-band span is a period later.
export function windowsAsOf(sol: Readonly<DropSolution>, nowTSec: number): LzWindow[] {
  const elapsed = nowTSec - sol.asOfTSec;
  const period = sol.periodSec;
  if (!(period > 0)) return [...sol.windows];
  const turns = (closeInSec: number): number => (closeInSec > elapsed ? 0 : Math.floor((elapsed - closeInSec) / period) + 1);
  const shift = (sec: number | null, k: number): number | null => (sec === null ? null : sec + k * period);
  return sol.windows.map((w) => {
    const k = turns(w.closeInSec);
    const moved: LzWindow = k === 0 ? w : {
      ...w, openInSec: w.openInSec + k * period, closeInSec: w.closeInSec + k * period,
      sureOpenInSec: shift(w.sureOpenInSec, k), sureCloseInSec: shift(w.sureCloseInSec, k),
      inBandOpenInSec: shift(w.inBandOpenInSec, k), inBandCloseInSec: shift(w.inBandCloseInSec, k),
    };
    if (moved.inBandCloseInSec === null || moved.inBandCloseInSec > elapsed) return moved;
    const j = turns(moved.inBandCloseInSec);
    return { ...moved, inBandOpenInSec: shift(moved.inBandOpenInSec, j), inBandCloseInSec: shift(moved.inBandCloseInSec, j) };
  }).sort((a, b) => a.openInSec - b.openInSec);
}

// The moment a window is worth a launch (the guidance table's GET READY and its beeps count down to it), in game s from
// `nowTSec`: the opening of its sure part inside the in-band span when this pass has one (from there the whole dot fits:
// LAUNCH NOW), else its in-band opening (a wide drop: LAUNCH — WIDE DROP from the start). null: no in-band span.
// Why not the opening alone: the centre enters the bracket a few tactical seconds before the dot's edges do, and a kid
// told to launch at the opening sends the first pod half off-site (plan Deviations, Track SIM).
export function launchMomentInSec(sol: Readonly<DropSolution>, w: Readonly<LzWindow>, nowTSec: number): number | null {
  if (w.inBandOpenInSec === null || w.inBandCloseInSec === null) return null;
  const at = sureInBand(w) ? Math.max(w.inBandOpenInSec, w.sureOpenInSec!) : w.inBandOpenInSec;
  return secFromNow(sol, at, nowTSec);
}

// --- The launch moment: the one answer for every reader (review M3) ----------------------------------------------------

// One in-band window as of now: the window (its times still relative to the solution's asOfTSec, rolled by
// windowsAsOf), and in game seconds from now its in-band opening and close and its launch moment (launchMomentInSec).
export interface MomentWindow {
  lz: string;
  window: LzWindow;
  openInSec: number;      // ≤ 0: the in-band span has opened
  closeInSec: number;     // > 0 for every window listed (a span that is over rolls on a period)
  launchInSec: number;    // ≤ 0: the launch moment has come
  full: boolean;          // its LZ has no projected room: a pod launched in it is MISLANDED
}

// The window open now (state.landing.window, the ONE "open now"), with its moment when the solution has it.
export interface MomentOpen {
  lz: string;
  sure: boolean;
  full: boolean;
  window: MomentWindow | null;  // null only for a solution a tick behind the state
  launchCome: boolean;          // the launch moment has come (the whole dot fits, or never will this pass)
  awaited: boolean;             // the landing waits on it (see `target`): TACTICAL, WINDOW OPEN, the chip's OPEN
}

export interface LandingMoment {
  // The landing waits on windows: it goes on (LANDING, not ended), and a pod aboard can launch some day.
  awaited: boolean;
  canLaunch: boolean;           // a pod can launch right now (nextToLaunch)
  noBand: boolean;              // windows exist and none is ever in the band on this orbit (L12's twin)
  roomInBand: boolean;          // an in-band window's LZ has projected room (else: NO ROOM IN THE BAND, L3b)
  upcoming: MomentWindow[];     // every in-band window, by in-band opening (an open one first): the ground track's list
  open: MomentOpen | null;
  // The window the landing waits on next: the next in-band window of an LZ with room, else (no room in the band) the next
  // in-band window, full (its launch asks LZ-A IS FULL — LAUNCH ANYWAY?, and lands MISLANDED); null while not awaited.
  target: MomentWindow | null;
}

// The launch moment for every reader (01-landing §3.2, §3.11, §3.12): pace's TACTICAL lead, WINDOW OPEN and the SKIP's
// target, the guidance table's GET READY / WAIT / L3, the 5…1 beeps, the countdown chip, the mini-HUD and the ground
// track all read this, so they can't drift apart again (they did: five copies with different gating). Pure; `sol` is
// drop-cache's getDropSolution(), `nowTSec` the clock. The seam AUTODROP (4c) and 1b's kicks lean on.
// Only in-band windows count (risk 13): an LZ whose window is never in the band is not waited on, named or counted
// down to (review M1: L3 named LZ-B out of band and the strip looped `hold the pods for LZ-B` for ever).
// `bayOffline` (capabilities bay.offline, passed in so this stays pure): with Bay Ctrl missing no pod can launch, so
// nothing is awaited (no TACTICAL, no WINDOW OPEN, no GET READY) and canLaunch is false; the table shows L12-bay.
export function landingMoment(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null, nowTSec: number, bayOffline: boolean,
): LandingMoment {
  const { landing } = state;
  const awaited = state.run.phase === 'landing' && landing.ended === null && !bayOffline && driversThatCanEverLaunch(state).length > 0;
  const canLaunch = state.run.phase === 'landing' && !bayOffline && nextToLaunch(state) !== null;
  const remaining = lzRemaining(state);
  const full = (lz: string): boolean => (remaining[lz] ?? 0) <= 0;
  const solved = sol !== null && sol.block === null ? sol : null;
  const rolled = solved === null ? [] : windowsAsOf(solved, nowTSec);
  const upcoming: MomentWindow[] = solved === null ? [] : rolled
    .flatMap((w): MomentWindow[] => {
      if (w.inBandOpenInSec === null || w.inBandCloseInSec === null) return [];
      const closeInSec = secFromNow(solved, w.inBandCloseInSec, nowTSec);
      const launchInSec = launchMomentInSec(solved, w, nowTSec);
      if (closeInSec <= 0 || launchInSec === null) return [];
      return [{ lz: w.lz, window: w, openInSec: secFromNow(solved, w.inBandOpenInSec, nowTSec), closeInSec, launchInSec, full: full(w.lz) }];
    })
    .sort((a, b) => a.openInSec - b.openInSec);
  const roomInBand = upcoming.some((w) => !w.full);
  const now = landing.window;
  let open: MomentOpen | null = null;
  if (now !== null) {
    const window = upcoming.find((w) => w.lz === now.lz) ?? null;
    const isFull = full(now.lz);
    open = {
      lz: now.lz, sure: now.sure, full: isFull, window,
      launchCome: now.sure || window === null || window.launchInSec <= 0,
      awaited: awaited && (!isFull || !roomInBand),
    };
  }
  const target = !awaited ? null : upcoming.find((w) => !w.full) ?? (roomInBand ? null : upcoming[0] ?? null);
  return {
    awaited, canLaunch, roomInBand, upcoming, open, target,
    noBand: solved !== null && rolled.length > 0 && rolled.every((w) => !w.inBand),
  };
}

// The driver a launch would take: `pod`'s if named (it must be in memory), else nextToLaunch.
function driverFor(state: Readonly<GameState>, pod: number | undefined): DriverSegment | null {
  if (pod === undefined) return nextToLaunch(state);
  return driversInMemory(state).find((driver) => driver.pod === pod) ?? null;
}

// A pod aboard whose driver is held by a resident's lock (slice 5): what makes an empty queue POD LOCKED, not NO POD READY.
function lockedPodAboard(state: Readonly<GameState>): boolean {
  return driversInMemory(state).some((driver) => driver.lockedBy !== undefined && podRecord(state, driver.pod).fate.kind === 'aboard');
}

// Who is asking for a launch: the source, and whether it may launch while the kid is in the MIND (the blue screen).
// requestLaunch derives fromMind: false for the player, the active controller's launchesFromMind otherwise.
export interface LaunchFrom {
  source: LaunchSource;
  fromMind: boolean;
}

// Why a launch can't go now, in the order of the LaunchRefusal union; null: it can. SHIP SCREEN applies whenever the
// screen is the MIND and the asker may not launch from there. BAY OFFLINE (Bay Ctrl missing) comes next: nothing done on
// the ship screen changes it, so it outranks every flight and drop reason.
export function launchRefusal(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null, from: LaunchFrom, pod?: number,
): LaunchRefusal | null {
  if (state.run.phase !== 'landing') return 'NOT LANDING';
  if (state.landing.ended !== null) return 'LANDING OVER';
  if (state.clock.paused) return 'PAUSED';
  if (state.ui.mode === 'memory' && !from.fromMind) return 'SHIP SCREEN';
  if (bayOfflineIn(state)) return 'BAY OFFLINE';
  if (state.burn.lastTickDvKmS > 0) return 'ENGINE FIRING';
  if (sol === null || sol.block !== null || sol.dot === null) return 'NO DROP SOLUTION';
  if (!sol.dot.inBand) return 'OUT OF THE LAUNCH BAND';
  const driver = driverFor(state, pod);
  // Slice 5 (plan R7): the asked-for pod is locked, or, asked for none, nothing is ready but a locked pod.
  if (driver?.lockedBy !== undefined || (driver === null && pod === undefined && lockedPodAboard(state))) return 'POD LOCKED';
  if (driver === null || !isLaunchable(driver)) return 'NO POD READY';
  if (state.landing.bay.cadenceLeftTac > 0) return 'RELOADING';
  if (state.landing.bay.loaded < 1) return 'BAY EMPTY';
  return null;
}

export interface LaunchGuard {
  ask: LaunchAsk;
  points: number;
  lz: string | null;   // the full LZ ('full'), else null
  word: string | null; // the no-go arc's word ('no-go': `LAUNCH INTO LAVA?`), else null
}

// The inline confirm a launch needs first (§3.3), or null: the dot's centre over a no-go arc asks in the arc's own word
// (`LAUNCH INTO LAVA? scores 0`, §3.6), the dot outside every bracket asks `LAUNCH OFF-SITE? … scores 100`, a bracket
// already full by the projected fill asks `LZ-A IS FULL — LAUNCH ANYWAY? scores 150`. The points are what the pod would
// score landing at the dot's centre. A wide dot whose EDGE reaches an arc asks nothing here (its centre is in a
// bracket): L5's `WIDE DROP, LAVA in reach` (noGoInReach) says so before the [L].
export function launchGuard(state: Readonly<GameState>, sol: Readonly<DropSolution>, pod?: number): LaunchGuard | null {
  const driver = driverFor(state, pod);
  if (driver === null || sol.dot === null) return null;
  const { landing } = state;
  const touch = driverTouch(driver.integrity);
  const placement = classifyLanding(landing.lzs, landing.noGo, sol.dot.rad, lzProjectedFill(state));
  const points = podPoints(placement.place, touch, landing.forgiveness, driver.colonists);
  if (placement.place === 'no-go') {
    const arc = noGoAt(landing.noGo, sol.dot.rad);
    if (arc === null) throw new Error('launchGuard: a no-go placement with no arc under the dot');
    return { ask: 'no-go', points, lz: null, word: arc.word };
  }
  if (placement.place === 'off-site') return { ask: 'off-site', points, lz: null, word: null };
  if (placement.place === 'mislanded') return { ask: 'full', points, lz: placement.lz, word: null };
  return null;
}

// The inline confirm's words for a guard (requestLaunch shows them), so a new ask never needs a change in landing.ts.
export function launchGuardText(guard: Readonly<LaunchGuard>, terrain: TerrainWord): string {
  switch (guard.ask) {
    case 'off-site': return LAUNCH_CONFIRM_TEXT.offSite(terrain, guard.points);
    case 'full':
      if (guard.lz === null) throw new Error('launchGuardText: a full-LZ ask without its LZ');
      return LAUNCH_CONFIRM_TEXT.full(guard.lz, guard.points);
    case 'no-go':
      if (guard.word === null) throw new Error('launchGuardText: a no-go ask without its word');
      return LAUNCH_CONFIRM_TEXT.noGo(guard.word, guard.points);
    default: throw new Error(`launchGuardText: unknown ask '${String(guard.ask)}'`);
  }
}

// Everything a controller may read (§3.14: AUTODROP, the resident, MERGE's landing), for the state and its drop solution.
// `cadenceTac` is Bay Ctrl's (capabilities.bay; null: BAY OFFLINE), passed in so this stays pure.
export function landingView(state: Readonly<GameState>, solution: Readonly<DropSolution>, cadenceTac: number | null): LandingView {
  const pods = state.landing.pods;
  return {
    solution: solution as DropSolution,
    bay: { ...state.landing.bay, cadenceTac, shown: bayShown(state) },
    queue: launchQueue(state).map((driver) => driver.pod),
    remaining: lzRemaining(state),
    aboard: pods.filter((record) => record.fate.kind === 'aboard').length,
    falling: pods.filter((record) => record.fate.kind === 'falling').length,
  };
}

// --- The ship's result -------------------------------------------------------------------------------------------------

// The outcome of the ship whose landing is ending (§3.10), from burn.status: in orbit (inOrbitOutcome), or, with the
// engine open in 1b, crashed or escaped during the landing (LandingEnd 'ship-lost': pods aboard go NOT LAUNCHED,
// finalFateOfAboard). endNow, the LANDING REPORT and the LOST card share it. Any other status never had a landing.
export function landingOutcome(status: BurnStatus): ShipOutcome {
  if (status === 'crashed' || status === 'escaped') return status;
  return inOrbitOutcome(status);
}

// The outcome of a ship whose landing runs in orbit (§3.10): ORBIT LOCKED, or an ACCEPTed loop ('partial'). The one rule
// the landing's end, its report and the run's ShipResult (run.ts shipOutcomeOf) share. Any other status has no landing.
export function inOrbitOutcome(status: BurnStatus): 'locked' | 'partial' {
  if (status === 'locked') return 'locked';
  if (status === 'accepted') return 'partial';
  throw new Error(`inOrbitOutcome: a ship ${status} does not land`);
}

// Outcomes after which the ship is still in orbit: pods still aboard are released and parked (§3.10). Any other ending
// (crashed, escaped, abandoned) took them out of orbit with the ship: NOT LAUNCHED.
export function endsInOrbit(outcome: ShipOutcome): boolean {
  return outcome === 'locked' || outcome === 'partial' || outcome === 'stranded' || outcome === 'emergency';
}

// Why a pod still aboard is parked when the landing ends in orbit.
export function parkReasonOf(record: Readonly<PodRecord>): ParkReason {
  return record.driverLost ?? 'no-time';
}

// How a pod comes down (Touchdown.touch), decided at touchdown: hard on ROCKY or WET ground (slice 6, 01 §3.13: "every
// landing there is hard"; the ground where it came down, state/survey-selectors.ts groundAt), else as its driver would at
// launch (LaunchRecord.predictedTouch keeps that meaning: REPAIR can't fix ground, so the L-rows stay driver-only). Every
// ground is FLAT until SURVEY_BUILT.poor is raised.
export function touchAtTouchdown(launch: Readonly<LaunchRecord>, ground: LzGround): Touch {
  return ground === 'flat' ? driverTouch(launch.driverIntegrity) : 'hard';
}

// A pod parked in orbit, with why (§3.10): only a driver HOLLOW ate is MERGE's to give back (restorable).
export function parkedFateOf(record: Readonly<PodRecord>): Extract<PodFate, { kind: 'parked' }> {
  const why = parkReasonOf(record);
  return { kind: 'parked', why, restorable: why === 'eaten' };
}

// The fate a pod still aboard gets when the ship's landing is over with `outcome` (state/actions parkPodsAboard writes it).
export function finalFateOfAboard(record: Readonly<PodRecord>, outcome: ShipOutcome): PodFate {
  return endsInOrbit(outcome) ? parkedFateOf(record) : { kind: 'not-launched' };
}

// Where the pods still falling will come down, in touchdown order against the pods already down (§3.5: an LZ fills in
// touchdown order), exactly as landing.ts touchDown will classify them. Where a pod lands was decided at launch; only
// the fill order was open. A ship that ends mid-fall (its Core eaten under a streak) counts them here.
export function pendingTouchdowns(state: Readonly<GameState>): Map<number, Touchdown> {
  const falling = state.landing.pods
    .flatMap((record) => (record.fate.kind === 'falling' ? [{ record, launch: record.fate.launch }] : []))
    .sort((a, b) => (a.launch.atAi + a.launch.descentSec) - (b.launch.atAi + b.launch.descentSec));
  const touchdowns = new Map<number, Touchdown>();
  if (falling.length === 0) return touchdowns;
  const { landing } = state;
  const fill = lzDownFill(state);
  for (const { record, launch } of falling) {
    const placement = classifyLanding(landing.lzs, landing.noGo, launch.landingRad, fill);
    if (placement.lz !== null) fill[placement.lz] = (fill[placement.lz] ?? 0) + 1;
    const touch = touchAtTouchdown(launch, groundAt(landing, placement.lz));
    touchdowns.set(record.pod, {
      place: placement.place,
      lz: placement.lz,
      points: podPoints(placement.place, touch, landing.forgiveness, record.colonists),
      missKm: missKm(landing.lzs, launch.landingRad, state.level.planet.R),
      touch,
      atAi: launch.atAi + launch.descentSec,
    });
  }
  return touchdowns;
}

// The landing half of the ship's result (§5 "To 02"), folded from the pods. Pods still aboard count as they will end
// (parked or not launched, by `outcome`); pods still falling count where they come down (pendingTouchdowns).
export function landingResult(state: Readonly<GameState>, outcome: ShipOutcome): LandingTally {
  const { landing } = state;
  const rows = new Map<string, LzResult>();
  for (const lz of landing.lzs) rows.set(lz.label, { lz: lz.label, count: lz.pods * COLONISTS_PER_POD, landed: 0, mislanded: 0, hard: 0 });
  const tally: LandingTally = {
    colonistsAboard: 0, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: 0, points: 0,
    colony: landing.colony, pods: [],
  };
  const pending = pendingTouchdowns(state);
  for (const record of landing.pods) {
    const settled = pending.get(record.pod);
    // A pod parked when the landing ended rode the ship's orbit: a ship that then left it (a crash during the linger,
    // review B1) took it along, NOT LAUNCHED (orbit-sim endLandingLost rewrites the state the same way).
    const fate: PodFate = record.fate.kind === 'aboard' ? finalFateOfAboard(record, outcome)
      : record.fate.kind === 'parked' && !endsInOrbit(outcome) ? { kind: 'not-launched' }
        : record.fate.kind === 'falling' && settled ? { kind: 'down', launch: record.fate.launch, touchdown: settled }
          : record.fate;
    tally.colonistsAboard += record.colonists;
    if (record.restored) tally.restored += record.colonists;
    const summary: PodSummary = {
      pod: record.pod, family: record.family, colonists: record.colonists, fate: fate.kind, place: null, lz: null, touch: null,
      points: 0, parkedWhy: null, restored: record.restored, featured: record.featured.map((colonist) => ({ name: colonist.name, age: colonist.age, line: colonist.line })),
    };
    switch (fate.kind) {
      case 'falling':
      case 'aboard':
        throw new Error(`landingResult: pod ${record.pod} was not given its final fate (${fate.kind})`);
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
        summary.touch = fate.touchdown.touch;
        summary.points = points;
        tally.points += points;
        if (place === 'off-site') tally.offSite += record.colonists;
        else if (place === 'no-go') tally.noGo += record.colonists;
        else {
          const row = rows.get(lz ?? '');
          if (!row) throw new Error(`landingResult: pod ${record.pod} landed in an unknown LZ '${lz}'`);
          if (place === 'lz') { row.landed += record.colonists; tally.landedInLz += record.colonists; } else row.mislanded += record.colonists;
          if (fate.touchdown.touch === 'hard') row.hard += record.colonists;
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

// ★ ON TARGET (§3.9), one rule (slice 7a review m2: onTargetTally, ending-rules shipOnTarget and the save codec's STAY
// check all read these): a pod counts once it is down soft in an LZ with room, and the ★ is earned when those colonists
// are at least STAR_ON_TARGET_FRAC of everyone the ship arrived with (its unlaunched pods count).
export function onTargetEarned(onTargetColonists: number, colonists: number): boolean {
  return colonists > 0 && onTargetColonists >= STAR_ON_TARGET_FRAC * colonists;
}

export function podOnTarget(record: Readonly<PodRecord>): boolean {
  const { fate } = record;
  return fate.kind === 'down' && fate.touchdown.place === 'lz' && fate.touchdown.touch === 'soft';
}

// A ship's pods, as they stand, earn the ★ (the final ship's live records; the codec's STAY check on the final ship).
export function podsOnTarget(pods: readonly Readonly<PodRecord>[]): boolean {
  let onTarget = 0;
  let colonists = 0;
  for (const record of pods) {
    colonists += record.colonists;
    if (podOnTarget(record)) onTarget += record.colonists;
  }
  return onTargetEarned(onTarget, colonists);
}

// ★ ON TARGET live or final, with what could still be earned (`possible`).
export function onTargetTally(state: Readonly<GameState>): OnTargetTally {
  let onTargetPods = 0;
  let onTargetColonists = 0;
  let colonists = 0;
  let stillOpen = 0;  // colonists whose landing is not decided yet: aboard with a driver in memory, or falling
  const inMemory = new Set(driversInMemory(state).map((driver) => driver.pod));
  for (const record of state.landing.pods) {
    colonists += record.colonists;
    const { fate } = record;
    if (podOnTarget(record)) {
      onTargetPods++;
      onTargetColonists += record.colonists;
    } else if (fate.kind === 'falling' || (fate.kind === 'aboard' && inMemory.has(record.pod))) {
      stillOpen += record.colonists;
    }
  }
  return {
    onTargetPods, pods: state.landing.pods.length, onTargetColonists, colonists,
    earned: onTargetEarned(onTargetColonists, colonists),
    possible: onTargetEarned(onTargetColonists + stillOpen, colonists),
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

// Slice 4 (Track FLIGHT; moved here from landing-orbit.ts by the review's m12, which broke the import cycle between them).
// Slice 4 (plan §2.9's landing window rule, §7 R2; Track FLIGHT; 4e reuses it for v3's top-ups): the LZ whose in-band
// window a burn that starts `startInSec` game seconds from now and lasts `burnSec` overlaps, or null (launches are refused
// while firing, and the planet does not rotate, so a blocked apsis is blocked every pass). Only an LZ with room counts, and
// only while a pod aboard can still launch: a window nobody can use costs nothing. The drop solution's windows carry no
// room or bay data, so the state is passed too. Each window is checked on this pass and the next two (a burn a loop away
// meets the window's next pass). Pure.
export function burnSpanBlocks(state: Readonly<GameState>, sol: Readonly<DropSolution>, startInSec: number, burnSec: number): string | null {
  if (state.run.phase !== 'landing' || sol.block !== null || !(sol.periodSec > 0)) return null;
  if (driversThatCanEverLaunch(state).length === 0) return null;
  const room = lzRemaining(state);
  const since = state.clock.tSec - sol.asOfTSec;
  const endInSec = startInSec + Math.max(0, burnSec);
  for (const window of sol.windows) {
    if (window.inBandOpenInSec === null || window.inBandCloseInSec === null || (room[window.lz] ?? 0) <= 0) continue;
    for (let pass = 0; pass < 3; pass++) {
      const openIn = window.inBandOpenInSec - since + pass * sol.periodSec;
      const closeIn = window.inBandCloseInSec - since + pass * sol.periodSec;
      if (startInSec < closeIn && endInSec > openIn) return window.lz;
    }
  }
  return null;
}
