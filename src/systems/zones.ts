import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment, SoulSegment } from '@/types/segment';
import type { ShipFlightDef } from '@data/ships';
import type { Rng } from '@systems/rng';
import type { Vec2 } from '@/types/orbit';
import type { Zone, ZoneDef, DebrisZone, BeltZone } from '@/types/zone';
import { zoneRacks, zoneVerdict, type RackHazard } from '@/types/zone';
import type { Prediction } from '@systems/predict';
import { capabilitiesNow, type Capabilities } from '@systems/capabilities';
import { onGameTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import { childRng } from '@systems/rng';
import { lastTickTrack, type TickTrack } from '@systems/orbit-sim';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import { setIntegrity, recordClusterGone, lostClusterResult } from '@state/actions';
import { hasIntegrity, fileLabel, type HealthSegment } from '@state/selectors';
import { stateFromElements, inboundAnomalyAtRadius } from '@/types/orbit';
import { RACK_NAMES, MEMORY_TOTAL_BLOCKS, rackOf } from '@data/memory';
import { debrisHitLine, beltHitLine, zoneLostLine, type ZoneDamageItem } from '@data/zone-text';
import { IS_DEV } from '@/env';
import {
  RACK_BLOCKS, DEBRIS_HIT_DAMAGE, BELT_HIT_MEAN_SEC, BELT_HIT_DAMAGE, BELT_TARGET_REROLLS,
} from '@data/tuning';

// Hazard zones (§3.3 P3, §6.8, §9 WP9): where the physical layer reaches into the mind. The ship's flight
// sweeps through space; a debris cloud it enters hits a rack of memory once, a radiation belt peppers two
// racks while the ship is inside it. Every effect lands on files by ADDRESS (a rack is 64 blocks), so a file
// moved into the rack before contact is hit and one moved out is spared.
//
// • resolveZones turns the ship's data (ShipDef.zones) into this flight's zones (LevelState.zones): a
//   debris centre "on the unperturbed inbound path at r" becomes a point in the world frame, and its rack is
//   the written one on the tutorial run, drawn from laterRacks on a later run (§4.2: rack C, then B or C).
// • The geometry (zoneContains, zoneCrossings, chordInsideFrac) is shared by the predictor (the drawn path's
//   hazard spans and zoneHits) and the sim's swept test, so the label never disagrees with the hit.
// • mountZones applies the effects on world time, after orbit-sim, from the path the ship swept this tick
//   (orbit-sim lastTickTrack): a debris contact the first time a sub-step chord enters the circle (a SKIP
//   cannot tunnel through it), belt hits by the time spent inside (a Poisson process in game time, so the
//   same seed gives the same hits at ×30 and ×300), also while printing on a loop that clips the belt.

// --- Resolving a ship's zones --------------------------------------------------------------------------

// The point on the ship's arrival hyperbola at radius `radius`, on the way in (the path a kid who never
// touches the throttle flies: data/mission.ts createFlight places the ship on the same conic).
export function inboundPoint(flight: Readonly<ShipFlightDef>, radius: number): Vec2 {
  const { start, planet } = flight;
  const ecc = 1 + (start.rp0 * start.vInf * start.vInf) / planet.mu;
  const nu = inboundAnomalyAtRadius(start.rp0, ecc, radius);
  if (nu === null) throw new Error(`zones: the arrival path never reaches r ${radius} km`);
  const state = stateFromElements(start.rp0, ecc, start.omega0, nu, planet.mu);
  return { x: state.x, y: state.y };
}

// Throws on zone data that could not work: an unknown rack, a cloud off the arrival path or touching the
// planet, a belt inside the planet, two zones with one id. Runs for every ship at load (ships.ts).
export function validateZoneDefs(shipId: string, defs: readonly ZoneDef[], flight: Readonly<ShipFlightDef>): void {
  const fail = (why: string): never => { throw new Error(`ShipDef ${shipId} zones: ${why}`); };
  const ids = new Set<string>();
  const rackKnown = (rack: string): boolean => RACK_NAMES.includes(rack);
  for (const def of defs) {
    if (ids.has(def.id)) fail(`duplicate zone id '${def.id}'`);
    ids.add(def.id);
    if (def.kind === 'debris') {
      if (!(def.r > 0)) fail(`${def.id}: r must be positive (got ${def.r})`);
      const at = def.centre.onInboundAtR;
      if (!(at > flight.start.rp0 && at < flight.start.r0)) fail(`${def.id}: the centre must be on the way in, between rp0 and r0 (got r ${at})`);
      if (at - def.r <= flight.planet.rAtm) fail(`${def.id}: the cloud reaches into the atmosphere`);
      if (!rackKnown(def.rack)) fail(`${def.id}: unknown rack '${def.rack}'`);
      if (def.laterRacks.length === 0) fail(`${def.id}: laterRacks is empty (a later run draws its rack from it)`);
      for (const rack of def.laterRacks) if (!rackKnown(rack)) fail(`${def.id}: unknown later rack '${rack}'`);
      inboundPoint(flight, at);
    } else {
      if (!(def.rIn > flight.planet.rAtm && def.rOut > def.rIn)) fail(`${def.id}: the belt must lie above the atmosphere with rOut > rIn`);
      if (def.racks.length === 0) fail(`${def.id}: a belt hits at least one rack`);
      for (const rack of def.racks) if (!rackKnown(rack)) fail(`${def.id}: unknown rack '${rack}'`);
    }
  }
}

// This flight's zones. `written` is the tutorial run (state/initial.ts playsTutorial): the debris hits the
// rack the story is told with; a later run draws it from laterRacks with `rng` (its own stream).
export function resolveZones(defs: readonly ZoneDef[], flight: Readonly<ShipFlightDef>, written: boolean, rng: Rng): Zone[] {
  return defs.map((def): Zone => {
    if (def.kind === 'belt') return { kind: 'belt', id: def.id, rIn: def.rIn, rOut: def.rOut, racks: [...def.racks] };
    const rack = written ? def.rack : def.laterRacks[Math.floor(rng() * def.laterRacks.length)];
    if (rack === undefined) throw new Error(`zones: no rack drawn for ${def.id}`);
    return { kind: 'debris', id: def.id, centre: inboundPoint(flight, def.centre.onInboundAtR), r: def.r, rack };
  });
}

// --- Geometry ---------------------------------------------------------------------------------------

export function zoneContains(zone: Zone, point: Vec2): boolean {
  if (zone.kind === 'debris') return Math.hypot(point.x - zone.centre.x, point.y - zone.centre.y) < zone.r;
  const radius = Math.hypot(point.x, point.y);
  return radius >= zone.rIn && radius <= zone.rOut;
}

// Where the straight chord from→to crosses a circle, as fractions in (0, 1] (a tangent is no crossing).
// The chords are sub-steps of at most a few hundred km, so the true arc and the chord agree to metres.
function circleCrossings(from: Vec2, to: Vec2, centre: Vec2, radius: number): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const offsetX = from.x - centre.x;
  const offsetY = from.y - centre.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return [];
  const along = offsetX * dx + offsetY * dy;
  const discriminant = along * along - lengthSq * (offsetX * offsetX + offsetY * offsetY - radius * radius);
  if (discriminant <= 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-along - root) / lengthSq, (-along + root) / lengthSq].filter((frac) => frac > 0 && frac <= 1);
}

const ORIGIN: Vec2 = { x: 0, y: 0 };

// Every point along from→to where the chord goes into or out of the zone, as sorted fractions in (0, 1].
export function zoneCrossings(zone: Zone, from: Vec2, to: Vec2): number[] {
  const fracs = zone.kind === 'debris'
    ? circleCrossings(from, to, zone.centre, zone.r)
    : [...circleCrossings(from, to, ORIGIN, zone.rIn), ...circleCrossings(from, to, ORIGIN, zone.rOut)];
  return fracs.sort((a, b) => a - b);
}

function lerp(from: Vec2, to: Vec2, frac: number): Vec2 {
  return { x: from.x + frac * (to.x - from.x), y: from.y + frac * (to.y - from.y) };
}

// The share of the chord from→to that lies inside the zone (0..1): the pieces between crossings, each
// judged by its midpoint.
export function chordInsideFrac(zone: Zone, from: Vec2, to: Vec2): number {
  const cuts = [0, ...zoneCrossings(zone, from, to), 1];
  let inside = 0;
  for (let i = 1; i < cuts.length; i++) {
    const lo = cuts[i - 1]!;
    const hi = cuts[i]!;
    if (hi > lo && zoneContains(zone, lerp(from, to, (lo + hi) / 2))) inside += hi - lo;
  }
  return inside;
}

// Where along from→to the chord first enters the zone (0 when it starts inside), or null when it never does.
export function chordEntryFrac(zone: Zone, from: Vec2, to: Vec2): number | null {
  if (zoneContains(zone, from)) return 0;
  // The first crossing from outside is the way in (a grazing chord's two crossings: in, then out).
  return zoneCrossings(zone, from, to)[0] ?? null;
}

// The nearest the chord from→to passes to `point`: its distance and where (a fraction along the chord).
export function chordClosest(from: Vec2, to: Vec2, point: Vec2): { distance: number; frac: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const frac = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq)) : 0;
  const nearest = lerp(from, to, frac);
  return { distance: Math.hypot(nearest.x - point.x, nearest.y - point.y), frac };
}

// --- The effects ---------------------------------------------------------------------------------------

// The blocks of a segment (starting at `start`, `size` long) that lie in rack `rack` (the strip's lines ask it too).
export function blocksInRack(start: number, size: number, rack: string): number {
  const rackStart = RACK_NAMES.indexOf(rack) * RACK_BLOCKS;
  if (rackStart < 0) throw new Error(`zones: unknown rack '${rack}'`);
  return Math.max(0, Math.min(start + size, rackStart + RACK_BLOCKS) - Math.max(start, rackStart));
}

// The files a zone can hurt: everything with a health number (souls, ship files, your tools). HOLLOW, free
// space, REPAIR CHARGE and a FIREWALL have none (§6.8 "hollow is excluded").
const damageable = hasIntegrity;

// The AI Core lives in rack E, which no zone reaches: one in a hit rack is an undesigned state (what would a
// debris hit on the Core even mean for the run?), so the plans below throw on it rather than guess.

export interface ZoneDamage {
  segId: string;
  label: string;
  from: number;
  to: number;
}

// What a debris contact does (§6.8), without touching memory: every damageable file with blocks in the rack
// loses DEBRIS_HIT_DAMAGE × (its blocks in the rack ÷ its size). Pure.
export function debrisDamagePlan(memory: readonly Segment[], rack: string): ZoneDamage[] {
  const starts = segmentStarts(memory);
  const plan: ZoneDamage[] = [];
  memory.forEach((seg, index) => {
    const blocks = blocksInRack(starts[index]!, seg.size, rack);
    if (blocks === 0 || !damageable(seg)) return;
    if (seg.type === 'core') throw new Error(`zones: the AI Core sits in rack ${rack}, which debris hits`);
    const lost = DEBRIS_HIT_DAMAGE * (blocks / seg.size);
    plan.push({ segId: seg.id, label: fileLabel(seg), from: seg.integrity, to: Math.max(0, seg.integrity - lost) });
  });
  return plan;
}

// The belt's pick (§6.8): a random damageable file in its racks that no op holds; a pick an op holds is
// drawn again BELT_TARGET_REROLLS times, then the hit is lost (the op's file is busy, not hidden). Pure.
export function beltTarget(memory: readonly Segment[], racks: readonly string[], rng: Rng): HealthSegment | null {
  const starts = segmentStarts(memory);
  const candidates = memory.filter((seg, index): seg is HealthSegment =>
    damageable(seg) && racks.some((rack) => blocksInRack(starts[index]!, seg.size, rack) > 0));
  if (candidates.length === 0) return null;
  for (let roll = 0; roll <= BELT_TARGET_REROLLS; roll++) {
    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    if (pick.type === 'core') throw new Error(`zones: the AI Core sits in racks ${racks.join('–')}, which the belt hits`);
    if (!pick.operating) return pick;
  }
  return null;
}

// The belt's clock (§6.8): hits are a Poisson process in the game time spent inside, at most one a tick.
// The gap to the next hit is drawn from an exponential with mean BELT_HIT_MEAN_SEC and counted down only
// while inside, so a tick's chance of a hit is exactly 1 − exp(−dt/τ) and the same seed gives the same hits
// at any warp (a second hit due in the same tick waits for the next one). Pure, apart from `rng`.
export interface BeltClock {
  leftSec: number;  // inside-time until the next hit
}

function drawGap(rng: Rng): number {
  return -Math.log(1 - rng()) * BELT_HIT_MEAN_SEC;
}

export function newBeltClock(rng: Rng): BeltClock {
  return { leftSec: drawGap(rng) };
}

// Advances the clock by `insideSec`; true when a hit lands this tick.
export function beltClockTick(clock: BeltClock, insideSec: number, rng: Rng): boolean {
  if (!(insideSec > 0)) return false;
  clock.leftSec -= insideSec;
  if (clock.leftSec > 0) return false;
  clock.leftSec += drawGap(rng);
  return true;
}

// --- The live mount -------------------------------------------------------------------------------------

let beltRng: Rng | null = null;
const beltClocks = new Map<string, BeltClock>();

function resetZones(): void {
  beltRng = null;
  beltClocks.clear();
}

function beltStream(state: Readonly<GameState>): Rng {
  if (!beltRng) beltRng = childRng(state.run.seed, state.run.shipIndex, 'belt');
  return beltRng;
}

// The clusters a plan takes to 0, as they are in `memory`.
function soulsTakenToZero(memory: readonly Segment[], plan: readonly ZoneDamage[]): SoulSegment[] {
  return plan.flatMap((item) => {
    const seg = memory.find((candidate) => candidate.id === item.segId);
    return seg?.type === 'soul' && item.to <= 0 ? [seg] : [];
  });
}

// Applies a zone's damage in one update: the integrities, the debris cloud spent (with what it did), and every
// cluster taken to 0 out of memory (§6.8: it did not wake; nothing turns into HOLLOW).
// An op on a cluster the hit takes to 0 is aborted first (its own onAbort settles it: a MOVE puts its source
// back and drops the clone it was writing), and the plan is made again from the memory that leaves: the hit
// lands on what is really in the rack, and a jump MOVE's clone that dies leaves its source alive, like HOLLOW's
// consume (hollow.ts applyEvents). `planFor` makes the plan from a memory; it must not roll dice (the belt's
// pick is made once, before, and only from files no op holds). Then the TERMINAL's line and the moment.
function applyDamage(store: Store<GameState>, zone: Zone, planFor: (memory: readonly Segment[]) => ZoneDamage[]): void {
  let plan = planFor(store.getState().memory);
  for (;;) {
    const held = soulsTakenToZero(store.getState().memory, plan).filter((soul) => getOpsBySeg(soul.id).length > 0);
    if (held.length === 0) break;
    for (const soul of held) for (const operation of getOpsBySeg(soul.id)) abortOp(operation.id);
    plan = planFor(store.getState().memory);
  }
  const memory = store.getState().memory;
  const starts = segmentStarts(memory);
  // Where each hit landed, read before a lost cluster leaves memory (the view flashes that rack's rows).
  const hitRack = new Map<string, string>();
  for (const item of plan) {
    const index = memory.findIndex((candidate) => candidate.id === item.segId);
    if (index < 0 || !damageable(memory[index]!)) throw new Error(`zones: ${item.segId} is not a damageable file in memory`);
    hitRack.set(item.segId, rackOf(starts[index]!));
  }
  const lost = soulsTakenToZero(memory, plan);
  store.update((draft) => {
    for (const item of plan) {
      const seg = draft.memory.find((candidate) => candidate.id === item.segId);
      if (!seg || !damageable(seg)) throw new Error(`zones: ${item.segId} left memory before its hit`);
      setIntegrity(seg, item.to);
    }
    for (const soul of lost) {
      const start = requireAddr(draft.memory, soul);
      replaceRange(draft.memory, start, start + soul.size, [freeSegment(soul.size)], { opId: null, own: [soul] });
      recordClusterGone(draft, soul, lostClusterResult(soul));
    }
    if (lost.length > 0) mergeAdjacentFree(draft.memory);
    if (zone.kind === 'debris' && !draft.hazards.hitIds.includes(zone.id)) {
      draft.hazards.hitIds.push(zone.id);
      draft.hazards.debrisHits.push({ zoneId: zone.id, files: plan.length, worstLoss: Math.max(0, ...plan.map((item) => item.from - item.to)) });
    }
    draft.ui.memoryRev++;
  });
  if (IS_DEV) assertMemoryInvariants(store.getState().memory, MEMORY_TOTAL_BLOCKS);
  const items: ZoneDamageItem[] = plan.map((item) => ({ label: item.label, lost: item.from - item.to }));
  if (zone.kind === 'debris') say('mind-sys', debrisHitLine(zone.rack, items), { critical: true });
  else if (items[0]) say('mind-sys', beltHitLine(items[0]), { critical: true });
  for (const soul of lost) say('mind-sys', zoneLostLine(soul.cluster), { critical: true });
  emit('zone-hit', {
    zoneId: zone.id, kind: zone.kind, racks: [...zoneRacks(zone)],
    hits: plan.map((item) => ({ segId: item.segId, rack: hitRack.get(item.segId)!, from: item.from, to: item.to })),
    lostClusters: lost.map((soul) => soul.cluster),
  });
}

function sweepDebris(store: Store<GameState>, zone: DebrisZone, track: readonly Vec2[]): void {
  if (store.getState().hazards.hitIds.includes(zone.id)) return;
  for (let i = 1; i < track.length; i++) {
    if (chordEntryFrac(zone, track[i - 1]!, track[i]!) === null) continue;
    applyDamage(store, zone, (memory) => debrisDamagePlan(memory, zone.rack));
    return;
  }
}

function sweepBelt(store: Store<GameState>, zone: BeltZone, track: TickTrack): void {
  const { points, chordSec } = track;
  let insideSec = 0;
  for (let i = 1; i < points.length; i++) insideSec += chordInsideFrac(zone, points[i - 1]!, points[i]!) * chordSec[i - 1]!;
  if (insideSec <= 0) return;
  const state = store.getState();
  const rng = beltStream(state);
  let clock = beltClocks.get(zone.id);
  if (!clock) {
    clock = newBeltClock(rng);
    beltClocks.set(zone.id, clock);
  }
  if (!beltClockTick(clock, insideSec, rng)) return;
  const target = beltTarget(state.memory, zone.racks, rng);
  if (!target) return;
  const item: ZoneDamage = { segId: target.id, label: fileLabel(target), from: target.integrity, to: Math.max(0, target.integrity - BELT_HIT_DAMAGE) };
  applyDamage(store, zone, () => [item]);
}

let mounted = false;

// Mount after mountOrbitSim: each game tick reads the path the sim just swept.
export function mountZones(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountZones: already mounted');
  mounted = true;
  const offTick = onGameTick(() => {
    const state = store.getState();
    if (!isLivePhase(state) || state.level.zones.length === 0) return;
    const track = lastTickTrack();
    if (track.points.length < 2) return;
    for (const zone of state.level.zones) {
      if (zone.kind === 'debris') sweepDebris(store, zone, track.points);
      else sweepBelt(store, zone, track);
    }
  });
  const offReset = onWorldReset('zones', resetZones, () => ({ rolled: beltRng !== null, clocks: beltClocks.size }));
  return () => { offTick(); offReset(); resetZones(); mounted = false; };
}

// --- What the MIND knows of the zones ---------------------------------------------------------------------

type PlotCaps = Capabilities['plot'];

// The MIND's side of a zone (its rack tags, the MOVE preview) can't tell a hit from a miss under PATH UNCERTAIN, and NO
// SIGNAL knows no more about the path than that.
export function mindZonesBlind(plot: Readonly<PlotCaps>): boolean {
  return plot.mode === 'uncertain' || plot.mode === 'no-signal';
}

// The racks a hazard zone is known to hit: the 'hit' verdict that paints a rack's tag red (flight-hud.ts rackZoneTags,
// with the same verdict and the same blindness), one entry a rack. The MOVE preview warns about them, and the strip's
// bitten-again MOVE ask names a rack that is not one of them. Only while the ship is live (flight, printing). Pure.
export function knownHitRacks(state: Readonly<GameState>, pred: Prediction, plot: Readonly<PlotCaps> = capabilitiesNow(state).plot): RackHazard[] {
  if (state.run.phase !== 'flight' && state.run.phase !== 'printing') return [];
  const blind = mindZonesBlind(plot);
  const hazards: RackHazard[] = [];
  for (const zone of state.level.zones) {
    const hit = pred.zoneHits.find((candidate) => candidate.zoneId === zone.id);
    if (!hit) throw new Error(`knownHitRacks: the prediction has no zoneHit for zone '${zone.id}'`);
    if (zoneVerdict(hit, blind) !== 'hit') continue;
    for (const rack of zoneRacks(zone)) if (!hazards.some((hazard) => hazard.rack === rack)) hazards.push({ rack, kind: zone.kind });
  }
  return hazards;
}

// How deep the ship is inside a radiation belt right now (the geiger's rate, §7.2): 0 at either edge, 1 midway
// between them; null outside every belt (or in a phase where the world stands). Pure.
export function beltDepth(state: Readonly<GameState>): number | null {
  if (!isLivePhase(state)) return null;
  const radius = Math.hypot(state.orbit.x, state.orbit.y);
  let deepest: number | null = null;
  for (const zone of state.level.zones) {
    if (zone.kind !== 'belt' || radius < zone.rIn || radius > zone.rOut) continue;
    const half = (zone.rOut - zone.rIn) / 2;
    const depth = 1 - Math.abs(radius - (zone.rIn + half)) / half;
    deepest = Math.max(deepest ?? 0, depth);
  }
  return deepest;
}
