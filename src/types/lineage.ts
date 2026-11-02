import type { ArmShip } from '@/types/map';
import type { ShipOutcome } from '@state/schema';

// What outlives a run besides the archive's counters (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.5; 02-map
// §3.12, 05-story §3.3, §3.5): the last unit and its trail, the arm the next unit starts on and why ships left it, the
// colonies, the routes and the notable events. Every type here is flat and JSON-safe: the archive (systems/meta.ts) and
// the run save (types/save.ts) store them as they are. The foundation lays them down; Track WORLD owns this file after.

// --- The last unit (systems/meta.ts's record; moved here so the pure lineage code never imports meta.ts) -----------------

// How a unit's run ended, as the next run remembers it (§4.5's causes, one for one with RunEndCause).
export type LastCause =
  | 'won-purge' | 'won-merge' | 'unresolved' | 'flagship-lost' | 'overwritten' | 'stayed' | 'abandoned';

// What HOLLOW's verbs on the final ship are weighted by (§4.5: "it fights like you did", WP11).
export interface UnitStats {
  moves: number;
  deletes: number;
}

// The last unit (§4.5), archive v2 (3c plan §2.5): `woke` became `landed` (01 risk 10: it always held the colonists
// landed on target), and 3a's interim `layer` / `worldSlot` gave way to the trail, whose grey cross places the ghost.
// `hollowUnits`: the HOLLOW it faced (a unit that STAYED never becomes HOLLOW, so the next run meets that one).
export interface LastUnit {
  number: number;
  landed: number;
  shipName: string;
  cause: LastCause;
  stats: UnitStats;
  hollowUnits: number[];
  // Its route with the year and outcome per ship, and where it was lost (null: the classic world, which keeps no trail).
  trail: UnitTrail | null;
  // Slice 4 (03 §3.11) fills it with the unit's skills; until then always null (the type widens then, no META bump).
  skills: null;
}

// --- The trail (02 §3.12 "the last unit's trail", 05 §3.5 the grey cross) ------------------------------------------------

export interface TrailStop {
  slot: number;                 // the arm slot (= the world) of the ship
  // The ship's name. null only on 046's written trail (05 §3.11 writes its worlds and years, never its ships).
  shipName: string | null;
  year: number;                 // the ship's approach year
  outcome: ShipOutcome | null;  // null: the ship the unit was on when its run was abandoned (it never ended)
  landed: number;               // colonists landed in an LZ (ShipResult.landedInLz)
  colony: string | null;        // the colony it founded, when a pod landed in an LZ
  writer: { name: string; age: number } | null;   // who writes its letter to the unit ahead (05 §3.3)
}

// Where the unit was lost (the grey cross): the causes flagship-lost, stayed, overwritten and abandoned, at the last stop.
export interface TrailLost {
  slot: number;
  year: number;
  pastLy: number;               // how far past the stop's world the cross is drawn, along the trail's last leg
  cause: LastCause;
}

export interface UnitTrail {
  unit: number;
  run: number;
  startYear: number;
  stops: TrailStop[];
  lost: TrailLost | null;
}

// --- The world update (02 §3.12; systems/map-update.ts) --------------------------------------------------------------------

// Why a ship left the chart between runs (02 §3.12 steps 1–5; 3c plan §4.2), and the words the chart says for it.
export type LeaveReason = 'done' | 'first-past' | 'drifted' | 'aged' | 'resolved' | 'off-pattern-ark' | 'made-room' | 'unreachable';
export type LeaveWords = 'colony' | 'no-colony' | 'core-coming' | 'own-way' | null;

export interface Departure {
  slot: number;
  name: string;
  reason: LeaveReason;
  words: LeaveWords;
}

// The content versions a stored arm (and a run save) was made by (3c plan §4.4). The archive's arm checks all but the
// catalogue; the save checks all five.
export interface ContentVersions {
  arm: number;          // data/arm.ts ARM_CONTENT_VERSION
  generator: number;    // systems/map-generator.ts MAP_GENERATOR_VERSION
  update: number;       // systems/map-update.ts MAP_UPDATE_VERSION
  mapState: number;     // data/map-state.ts MAP_STATE_VERSION
  catalogue: number;    // data/repository.ts REPO_CATALOGUE_VERSION
}

// The arm a run starts on (02 §3.12 "the arm state"): the world update's output, stored whole in the archive so a content
// change can never rewrite it silently (its `content` says what made it; a mismatch is a content reset, 02 §10).
export interface ArmState {
  armSeed: number;
  run: number;                  // the run this arm is for
  startYear: number;            // that run's start year (the last start + the gap, + the valve's years)
  gap: number;                  // the launch gap rolled for it (02 §3.1; 0 on run 1)
  valveYears: number;           // VALVE_YEARS when the time valve opened, else 0
  finalSerial: number;          // how many final ships have been named after LAST LIGHT (FINAL_SHIP_NAMES by serial)
  lastFinal: { name: string; year: number } | null;   // the last final ship that was on the chart (its floor; slice 7's wait)
  ships: ArmShip[];             // index = slot
  departures: Departure[];      // why the last arm's ships left (the opening desk's departures block)
  content: Omit<ContentVersions, 'catalogue'>;
}

// What the run's map remembers of the runs before it (RunMapState.history; empty on run 1 and the classic world).
export interface MapHistory {
  gap: number;
  valveYears: number;
  // The serial of the final ship this run's arm holds (0: LAST LIGHT, run 1's authored one): the update names the next new
  // one FINAL_SHIP_NAMES by serial (slice 3c foundation deviation: kept here so RUN END's update reads it off the map).
  finalSerial: number;
  lastUnitNumber: number | null;
  departures: Departure[];
  colonies: ColonyRecord[];
  routes: RouteRecord[];
}

// RUN END's bridging line (`UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303`): the next unit, from the world update.
export interface NextLaunch {
  unit: number;
  run: number;
  startYear: number;
  gap: number;
  valveYears: number;
}

// --- History records (archive v2) -----------------------------------------------------------------------------------------

export interface ColonyRecord {
  run: number;
  unit: number;
  slot: number;
  year: number;
  landed: number;
  name: string;
}

export interface RouteRecord {
  run: number;
  unit: number;
  slots: number[];
}

// At most NOTABLE_EVENTS_MAX a run (05 §3.8 ranks them; slice 7's 047.log reads them). Residents' events are slice 5's.
export interface NotableEvent {
  kind: 'deal-accepted' | 'best-colony' | 'ship-lost';
  slot: number;
  shipName: string;
  value: number;
}
