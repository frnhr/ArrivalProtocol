// Slice 7c: the lead owns this file, built in full by the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.1, §2.4, §4.3;
// like plan 6's site roll). Tracks ask by message.
// The next run's traces and the lineage's rules (05-story §3.5, §3.8; 02-map §3.12; R30–R37), pure and DOM-free: what the
// last unit's ending leaves this run (tracesOf), where its gifts wait (placeTraces, on the run's own 'traces' stream: R4, no
// stored arm moves), which trace a ship holds (traceAt), what the final ship plays (finalTraces), who the final root is
// (rootUnitsOf), who HOLLOW is mid-run (midRunHollowUnits), which book the `???` file holds (logBookOf), and the save's
// check (traceRefusal). Every effect reads data/traces.ts TRACES_BUILT / LINEAGE_BUILT: while a gate is down the traces are
// still rolled and saved, and nothing reads them.
// Import guard (support/import-guard): data, types and the pure geometry and stream leaves only; never state/selectors.ts
// (data modules reach it) and never a stateful system, so state/initial.ts, systems/meta.ts and systems/say.ts may all
// import it.
import type { RunState } from '@state/schema';
import type { ArmShip, RunMapState } from '@/types/map';
import type { EndingRecord } from '@/types/ending';
import type { LastUnit, NotableEvent, UnitTrail } from '@/types/lineage';
import type { RunTraces, TraceKind, TracePlace, PlacedTraceKind, LogBook } from '@/types/trace';
import type { Rng } from '@systems/rng';
import type { FinalTraceInput } from '@/types/threat';
import { createRng, hashSeed } from '@systems/rng';
import { currentSlot, isEndSlot } from '@systems/map-streams';
import { layerOf, distLy } from '@systems/map-geometry';
import { FIRST_SLOT, END_SLOTS } from '@data/arm';
import { UNIT_046_TRAIL } from '@data/ship-names';
import { controlCompliant } from '@data/endings';
import { TRACES_BUILT, LINEAGE_BUILT, TRACE_RULES, TRACE_PLACE_COUNT, STRANGER_UNITS } from '@data/traces';
import {
  FIRST_UNIT_NUMBER, HOLLOW_NAME_MAX_UNITS, NOTABLE_EVENTS_MAX, TRACE_LAYERS, TRACE_SPARE_FALLBACK_LAYERS,
  TRACE_ROOT_WAIT_MIN_YEARS,
} from '@data/tuning';

const PLACED: readonly PlacedTraceKind[] = ['spare', 'sunset', 'stay', 'contact'];
const isPlaced = (kind: TraceKind): kind is PlacedTraceKind => (PLACED as readonly string[]).includes(kind);

// No traces this run (run 1, a last unit lost or abandoned on the way, a v7 run resumed under v8, the classic world).
export function noTraces(): RunTraces {
  return { from: null, kinds: [], places: [], extraSeed: false };
}

// --- What an ending leaves (R30, R33) -------------------------------------------------------------------------------------

// The traces of an ending: its step-1 trace (none for 'followed', 05 §3.7) and its step-2 trace, and whether it was
// non-compliant (ending-rules controlCompliant, the one rule: one wild seed at the final boot, at most one a run).
export function traceKindsOf(ending: Readonly<Pick<EndingRecord, 'hollow' | 'you'>>): { kinds: TraceKind[]; extraSeed: boolean } {
  const kinds: TraceKind[] = ending.hollow === 'followed' ? [ending.you] : [ending.hollow, ending.you];
  return { kinds, extraSeed: !controlCompliant(ending.hollow, ending.you) };
}

// The traces the last unit leaves (R30), not yet placed: none when it left no ending (lost, abandoned, migrated as such).
export function tracesOf(lastUnit: Readonly<Pick<LastUnit, 'number' | 'ending'>> | null): RunTraces {
  const ending = lastUnit?.ending ?? null;
  if (lastUnit === null || ending === null) return noTraces();
  const { kinds, extraSeed } = traceKindsOf(ending);
  return { from: { unit: lastUnit.number, ending: structuredClone(ending) as EndingRecord }, kinds, places: [], extraSeed };
}

// --- Where the gifts wait (R31; 02 §3.12) ---------------------------------------------------------------------------------

// The run's own 'traces' stream (R4): a namespace no other roll draws from, so placing the traces moves no arm, ship, site or
// beam roll.
export function tracesRng(runSeed: number): Rng {
  return createRng(hashSeed(`run:${runSeed >>> 0}:traces`));
}

function isFirstShip(ship: Readonly<ArmShip>): boolean {
  return ship.kind === 'first' || ship.slot === FIRST_SLOT;
}

function isFinalShip(ship: Readonly<ArmShip>): boolean {
  return ship.kind === 'final' || END_SLOTS.includes(ship.slot);
}

// R31's exclusions: never an authored ship, a `?` ship, a TIGHT ship (the gift's charge would land in a receiver with no
// room: decision 9's squeeze would turn a gift into a loss), the first ship or a final ship, except where a kind's rule
// names one as its fallback (SUNSET: the first ship; STAY: the final ship).
export function placeExcluded(ship: Readonly<ArmShip>, kind: PlacedTraceKind): string | null {
  if (ship.authored !== null) return 'an authored ship';
  if (ship.reserved.unknownEvent !== null) return 'a `?` ship';
  if (ship.memoryClass === 'TIGHT') return 'a TIGHT ship';
  if (isFirstShip(ship) && kind !== 'sunset') return 'the first ship';
  if (isFinalShip(ship) && kind !== 'stay') return 'a final ship';
  return null;
}

// The ships a kind's place may be on by the exclusions alone, by slot (the fallbacks are their rule's: only SUNSET's first
// ship and STAY's final ship pass placeExcluded, and only through their fallback below).
function armShips(map: Readonly<RunMapState>): ArmShip[] {
  return map.arm.filter((ship): ship is ArmShip => ship !== undefined && ship !== null);
}

function inLayers(ship: Readonly<ArmShip>, [from, to]: readonly [number, number]): boolean {
  const layer = layerOf(ship.slot);
  return layer >= from && layer <= to;
}

function open(map: Readonly<RunMapState>, kind: PlacedTraceKind, taken: readonly number[]): ArmShip[] {
  return armShips(map).filter((ship) => !taken.includes(ship.slot) && placeExcluded(ship, kind) === null
    && !isFirstShip(ship) && !isFinalShip(ship));
}

// One candidate, one draw (always taken, so a rule's draws never depend on how many candidates it had).
function pickOne(candidates: readonly ArmShip[], rng: Rng): ArmShip | null {
  const roll = rng();
  return candidates.length === 0 ? null : candidates[Math.floor(roll * candidates.length)]!;
}

// The worlds of 046's written trail past the first (R31: run 1's spared root never passed Calder: w1 Marrow, w4 Ostrava).
const TRAIL_046_WORLDS: readonly number[] = UNIT_046_TRAIL.filter((mark) => mark.colony !== null && mark.slot !== FIRST_SLOT).map((mark) => mark.slot);

function spareRootIs046(ending: Readonly<EndingRecord>): boolean {
  return ending.rootUnits.length === 1 && ending.rootUnits[0] === FIRST_UNIT_NUMBER - 1;
}

function finalShipOf(map: Readonly<RunMapState>): ArmShip {
  const ship = armShips(map).find(isFinalShip);
  if (ship === undefined) throw new Error('placeTraces: the arm has no final ship');
  return ship;
}

function firstShipOf(map: Readonly<RunMapState>): ArmShip {
  const ship = armShips(map).find(isFirstShip);
  if (ship === undefined) throw new Error('placeTraces: the arm has no first ship');
  return ship;
}

// Each placed kind's rule (R31), with its fallback. `taken`: the slots already holding a place (one gift a ship).
// • SPARE: a ship in layers 3–6; for 046 a ship at a world of its written trail past the first; none: any layers 2–6 ship.
// • SUNSET: a ship at a world of the last route whose approach is after the last unit's landing there; none (or no trail
//   kept: a classic record): the first ship (its world was always the last unit's first).
// • STAY: the first ship in layers 3–6, by approach, whose approach ≥ the colony's founding year + the distance from its
//   world (its supply packet travels by light); none (or a classic record, whose STAY slot is no arm world): the final ship.
// • CONTACT (7d): two ships in layers 5–7, while ENDINGS_BUILT.contact's CONTACT exists (a CONTACT ending can't be chosen
//   before it); fewer when the arm has fewer.
function placeKind(
  map: Readonly<RunMapState>, kind: PlacedTraceKind, ending: Readonly<EndingRecord>, trail: Readonly<UnitTrail> | null,
  taken: readonly number[], rng: Rng,
): number[] {
  switch (kind) {
    case 'spare': {
      const primary = spareRootIs046(ending)
        ? open(map, kind, taken).filter((ship) => TRAIL_046_WORLDS.includes(ship.slot))
        : open(map, kind, taken).filter((ship) => inLayers(ship, TRACE_LAYERS.spare));
      const pick = pickOne(primary, rng) ?? pickOne(open(map, kind, taken).filter((ship) => inLayers(ship, TRACE_SPARE_FALLBACK_LAYERS)), rng);
      if (pick === null) throw new Error('placeTraces: no ship in layers 2–6 may hold SPARE\'s cache');
      return [pick.slot];
    }
    case 'sunset': {
      const stops = trail?.stops ?? [];
      const candidates = open(map, kind, taken).filter((ship) => stops.some((stop) => stop.slot === ship.slot && ship.approachYear > stop.year));
      const first = firstShipOf(map);
      const pick = pickOne(candidates, rng) ?? (placeExcluded(first, kind) === null && !taken.includes(first.slot) ? first : null);
      if (pick === null) throw new Error(`placeTraces: no ship for SUNSET's cache (the first ship, slot ${first.slot}, is ${placeExcluded(first, kind) ?? 'taken'})`);
      return [pick.slot];
    }
    case 'stay': {
      const stay = ending.stay;
      const candidates = stay === null || ending.finalSlot === null ? [] : open(map, kind, taken)
        .filter((ship) => inLayers(ship, TRACE_LAYERS.stay) && ship.approachYear >= stay.year + distLy(stay.slot, ship.slot))
        .sort((a, b) => a.approachYear - b.approachYear || a.slot - b.slot);
      const final = finalShipOf(map);
      const pick = candidates[0] ?? (placeExcluded(final, kind) === null && !taken.includes(final.slot) ? final : null);
      if (pick === null) throw new Error(`placeTraces: no ship for STAY's supply packet (the final ship is ${placeExcluded(final, kind) ?? 'taken'})`);
      return [pick.slot];
    }
    case 'contact': {
      const slots: number[] = [];
      for (let stop = 0; stop < TRACE_PLACE_COUNT.contact; stop++) {
        const pick = pickOne(open(map, kind, [...taken, ...slots]).filter((ship) => inLayers(ship, TRACE_LAYERS.contact)), rng);
        if (pick !== null) slots.push(pick.slot);
      }
      return slots;
    }
  }
}

// Where the traces' gifts wait on this arm (R31): one place per placed kind (CONTACT's two), each on its own ship, in a
// fixed order (STAY first: it draws nothing; then SUNSET, SPARE, CONTACT), on `rng` (tracesRng: the run's own stream). The
// classic world holds no places (it has no arm). Pure: `traces` untouched.
export function placeTraces(map: Readonly<RunMapState>, traces: Readonly<RunTraces>, trail: Readonly<UnitTrail> | null, rng: Rng): TracePlace[] {
  if (traces.from === null || map.world !== 'arm') return [];
  const ending = traces.from.ending;
  const places: TracePlace[] = [];
  for (const kind of ['stay', 'sunset', 'spare', 'contact'] as const) {
    if (!traces.kinds.includes(kind)) continue;
    for (const slot of placeKind(map, kind, ending, trail, places.map((place) => place.slot), rng)) places.push({ kind, slot, given: false });
  }
  return places;
}

// The run's traces at RUN START (R30): the last unit's ending, placed on the arm the run starts on, on the run's own stream.
// The classic world (a frozen fixture: no arm, never archived as a lineage) has none.
export function runTracesOf(lastUnit: Readonly<LastUnit> | null, map: Readonly<RunMapState>, runSeed: number): RunTraces {
  if (map.world !== 'arm') return noTraces();
  const traces = tracesOf(lastUnit);
  return { ...traces, places: placeTraces(map, traces, lastUnit?.trail ?? null, tracesRng(runSeed)) };
}

// --- What a ship holds, what the final ship plays ------------------------------------------------------------------------

// The trace whose gift waits on the ship in `slot`, or null (one place a ship: placeTraces). A gift already given still
// answers (its card row and its `given` mark are CHART's and TRACE's to read).
export function traceAt(run: Readonly<Pick<RunState, 'traces'>>, slot: number): TracePlace | null {
  return run.traces.places.find((place) => place.slot === slot) ?? null;
}

// Is the unit on a final ship now (the classic world's LAST LIGHT, an end slot's ship on the arm)?
export function onFinalShip(run: Readonly<Pick<RunState, 'map' | 'shipIndex'>>): boolean {
  return isEndSlot(run.map, currentSlot(run));
}

// What the final ship plays of this run's traces (R33), each held and built (TRACES_BUILT): PURGE's wipe and hungrier FINALE,
// MERGE's thread and bigger root, REASSIGNMENT's allowance, its root (rootUnitsOf) and its hunt, and the wild seed of a
// non-compliant trace (at most one a run, whatever is held: the wild seed follows any non-compliant kind held and built).
export interface FinalTraces {
  purge: boolean;
  merge: boolean;
  reassignment: boolean;
  wild: boolean;
}

export function finalTraces(run: Readonly<Pick<RunState, 'traces'>>): FinalTraces {
  const held = (kind: TraceKind): boolean => run.traces.kinds.includes(kind) && TRACES_BUILT[kind];
  return {
    purge: held('purge'),
    merge: held('merge'),
    reassignment: held('reassignment'),
    wild: run.traces.extraSeed && run.traces.kinds.some((kind) => TRACE_RULES[kind].cost === 'wild-seed' && TRACES_BUILT[kind]),
  };
}

// The ladder's input for the final ship (ThreatInput.traces, read by threat-plan planThreat's final rule only): PURGE's
// hungrier bites, MERGE's bigger root, REASSIGNMENT's seeds beside your best skill (its hunt), each held and built.
export function finalTraceInput(run: Readonly<Pick<RunState, 'traces'>>): FinalTraceInput {
  const final = finalTraces(run);
  return { purge: final.purge, merge: final.merge, hunt: final.reassignment };
}

// --- The final root (R35) and the strangers (R34) ------------------------------------------------------------------------

// Who the last unit is as a root (R35): itself, or after a MERGE the root it took in and itself (046·047), the newest
// HOLLOW_NAME_MAX_UNITS of them.
export function lastUnitRoot(from: Readonly<NonNullable<RunTraces['from']>>): number[] {
  return from.ending.hollow === 'merge'
    ? [...from.ending.rootUnits, from.unit].slice(-HOLLOW_NAME_MAX_UNITS)
    : [from.unit];
}

// Who the root is (R35): on a final ship after a REASSIGNMENT trace (built), the last unit, at its own dish since its run
// ended; everywhere else the mid-run HOLLOW (run.hollowUnits). say.ts hollowLabel, the blocks' owner and the FINALE's
// commands read this on the final ship. (Not state/selectors.ts, which data modules load: support/import-guard.)
export function rootUnitsOf(run: Readonly<Pick<RunState, 'hollowUnits' | 'traces' | 'map' | 'shipIndex'>>): number[] {
  const from = run.traces.from;
  if (from === null || !finalTraces(run).reassignment || !onFinalShip(run)) return [...run.hollowUnits];
  return lastUnitRoot(from);
}

export function rootUnits(state: Readonly<{ run: Readonly<Pick<RunState, 'hollowUnits' | 'traces' | 'map' | 'shipIndex'>> }>): number[] {
  return rootUnitsOf(state.run);
}

// The face line's wait (R35; 05 §3.5 `i've been at this dish 3 years`): this final ship's approach year minus the last
// final ship's (the record's finalYear), at least TRACE_ROOT_WAIT_MIN_YEARS; a record that kept no year reads the floor.
// null when the run holds no ending.
export function rootWaitYears(run: Readonly<Pick<RunState, 'traces' | 'map'>>): number | null {
  const from = run.traces.from;
  if (from === null) return null;
  const finalYear = from.ending.finalYear;
  return finalYear === null ? TRACE_ROOT_WAIT_MIN_YEARS : Math.max(TRACE_ROOT_WAIT_MIN_YEARS, run.map.galaxyYear - finalYear);
}

// Who HOLLOW is mid-run (R34; 05 §3.5): UNIT-046 on run 1; from run 2 never the last unit (it is alive, ahead of you, until
// its own final ship) but a stranger from the relays, STRANGER_UNITS by run: 031 on run 2, 038 on run 3, 031 again.
// systems/meta.ts lineageAt reads it once LINEAGE_BUILT is raised (hollowUnitsAfter until then).
export function midRunHollowUnits(wave: number): number[] {
  if (!(Number.isInteger(wave) && wave >= 1)) throw new Error(`midRunHollowUnits: run ${wave}`);
  if (wave === 1) return [FIRST_UNIT_NUMBER - 1];
  return [STRANGER_UNITS[(wave - 2) % STRANGER_UNITS.length]!];
}

// --- The `???` file's book (R37) -------------------------------------------------------------------------------------------

// Which book the `???` file holds this run, chosen once at RUN START (R37): run 1 → 046.log; after REASSIGNMENT the last
// unit's own (047.log, its notable events at most NOTABLE_EVENTS_MAX); otherwise the relay stranger's (031.log, 038.log).
// Every book is 046.log until LINEAGE_BUILT is raised.
export function logBookOf(wave: number, lastUnit: Readonly<Pick<LastUnit, 'number' | 'ending'>> | null, events: readonly NotableEvent[]): LogBook {
  if (!LINEAGE_BUILT || wave === 1) return { kind: '046' };
  const ending = lastUnit?.ending ?? null;
  if (lastUnit !== null && ending !== null && ending.you === 'reassignment') {
    return { kind: 'last', unit: lastUnit.number, step1: ending.hollow, events: structuredClone(events.slice(0, NOTABLE_EVENTS_MAX)) as NotableEvent[] };
  }
  return { kind: 'stranger', unit: midRunHollowUnits(wave)[0]! };
}

// --- The save's check (RUN_SAVE_VERSION 8; plan §2.2 7c) -------------------------------------------------------------------

// What is wrong with a saved run's traces, or null:
// • no ending, no traces (kinds, places, extraSeed empty); an ending is the last unit's own, and its kinds and wild seed are
//   tracesOf's (the rule re-run);
// • every placed kind held has its place (CONTACT at most two), and every place is a ship of the arm that its kind's rule
//   allows (R31's exclusions; SUNSET's first ship and STAY's final ship as fallbacks), of a kind the traces hold, one place
//   a ship;
// • the classic world holds none.
export function traceRefusal(run: Readonly<Pick<RunState, 'traces' | 'lastUnit' | 'map'>>): string | null {
  const traces = run.traces;
  if (traces.from === null) {
    return traces.kinds.length === 0 && traces.places.length === 0 && !traces.extraSeed ? null : 'traces with no ending they came from';
  }
  if (run.map.world !== 'arm') return 'traces on the classic world';
  const last = run.lastUnit;
  if (last === null || last.number !== traces.from.unit || JSON.stringify(last.ending) !== JSON.stringify(traces.from.ending)) {
    return `traces from UNIT-${traces.from.unit}'s ending, not the last unit's`;
  }
  const want = traceKindsOf(traces.from.ending);
  if (JSON.stringify(want.kinds) !== JSON.stringify(traces.kinds) || want.extraSeed !== traces.extraSeed) {
    return `traces ${traces.kinds.join('+')}${traces.extraSeed ? ' (wild)' : ''}, the ending leaves ${want.kinds.join('+')}${want.extraSeed ? ' (wild)' : ''}`;
  }
  for (const kind of traces.kinds) {
    if (!isPlaced(kind)) continue;
    const count = traces.places.filter((place) => place.kind === kind).length;
    if (kind === 'contact' ? count > TRACE_PLACE_COUNT.contact : count !== TRACE_PLACE_COUNT[kind]) return `${count} ${kind} place(s)`;
  }
  const slots = new Set<number>();
  for (const place of traces.places) {
    if (!traces.kinds.includes(place.kind) || !isPlaced(place.kind)) return `a ${place.kind} place with no ${place.kind} trace`;
    if (traces.places.filter((other) => other.kind === place.kind).length > TRACE_PLACE_COUNT[place.kind]) return `more ${place.kind} places than ${TRACE_PLACE_COUNT[place.kind]}`;
    if (slots.has(place.slot)) return `two places on slot ${place.slot}`;
    slots.add(place.slot);
    const ship = run.map.arm[place.slot];
    if (ship === undefined || ship === null || ship.slot !== place.slot) return `a ${place.kind} place on slot ${place.slot}, no ship of the arm`;
    const excluded = placeExcluded(ship, place.kind);
    if (excluded !== null) return `a ${place.kind} place on ${ship.name}, ${excluded}`;
  }
  return null;
}
