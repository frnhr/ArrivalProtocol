import type { ShipLandingDef } from '@/types/landing';
import type { LinkNoise } from '@/types/threat';

// The galaxy map's types (phase 3 slice 3a, docs/phase3/02-map.md; slice-3a-plan §2.2). Everything a run stores here is
// flat and JSON-safe (3c's save writes RunMapState as it is). Track GEN owns this file after the foundation.

// A ship's role on the arm (02 §3.4): the first ship (ARES-n, fresh unit), a light ship (TIGHT), a standard one, an ark
// (big, early) and the final ship (an end slot).
export type ShipKind = 'first' | 'light' | 'standard' | 'ark' | 'final';

// The five flight templates (02 §3.5; data/flight-templates.ts): today's hand-flown ships' flight blocks, named by
// what they ask of the kid. IMPACT-A was ARES-VII, WIDE HALCYON, WIDE-B KESTREL, CAPTURE VESPER, IMPACT-B LAST LIGHT.
export type TemplateId = 'impact-a' | 'wide' | 'wide-b' | 'capture' | 'impact-b';

// The modifiers a ship can roll on top of its template (02 §3.5; slice-3a-plan §2.3 risk 12). IMPACT COURSE and TOO
// WIDE are the template's own arrival, always on, named here so the card's KNOWN PROBLEMS row has one vocabulary.
export type ModifierId = 'impact-course' | 'too-wide' | 'sensor-damage' | 'debris' | 'engine-fault' | 'radiation-belt';

// The memory classes (01 §3.16, 02 §3.4): 384, 320 and 256 blocks.
export type MemoryClass = 'FULL' | 'COMPACT' | 'TIGHT';
export type RackName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type PodRackName = 'B' | 'C' | 'D';

// One memory class's racks and numbers (data/memory.ts MEMORY_LAYOUTS). Racks are named, not numbered: a COMPACT ship
// has no rack D, so the address → rack lookup is `racks[floor(addr / RACK_BLOCKS)]`, never a letter's alphabet index.
// Every reader of a ship's size, rack names or receiver goes through one of these (layoutOf(state), layoutFor(cls),
// layoutForTotal(total)); there is no 384 anywhere else.
export interface MemoryLayout {
  cls: MemoryClass;
  racks: readonly RackName[];        // in address order
  totalBlocks: number;               // 384 / 320 / 256
  podRacks: readonly PodRackName[];  // the racks a pod layout may use
  unitStart: number;                 // rack E's address: where the unit's own files start (256 / 192 / 192)
  receiverBlocks: number;            // unitStart → the end of memory (128 / 128 / 64)
  roomForUnit: number;               // the receiver plus the unit's tail into the last pod rack (152 / 152 / 88)
  chargeFloor: number;               // REPAIR CHARGE guaranteed on arrival (12 / 12 / 0)
  maxPods: number;                   // the pods a layout of this class can hold (16 / 8 / 8)
}

// The ship's rng key (02 §3.4): every roll OF the ship (template, modifiers, landing, families, hurt drivers, zones,
// omega0) uses it, so a ship rolls the same whatever route led to it, and the same next run (3c). Per-visit rolls
// (transit, beam seeds, the draft, the landing's drop) use the run seed and the slots instead (systems/map-run.ts).
export interface ShipKey {
  armSeed: number;
  reportedRun: number;
  slot: number;
  attempt: number;
}

// What a ship holds for later slices (02 §3.5): rolled in 3a from their own named streams (so a slice that starts
// showing one never moves the arm's other rolls), stored, and not shown until their slice.
export interface Reservations {
  resident: { kind: 'corrupted' | 'left' | 'sleeping'; shown: 'faulty' | 'unknown'; name: string } | null;   // slice 5
  unknownEvent: 'old-colony' | 'gone-resident' | 'signal' | null;   // a `?` ship (slice 5)
  fragments: number;                                                  // slice 5
  site: 'good' | 'poor';                                              // POOR plays GOOD until slice 6
  tracePlace: null;                                                   // slice 7
}

// One ship on the arm, as the generator rolls it and run.map stores it: flat and JSON-safe (3c's save). The runtime
// ShipDef is built from it by data/ships.ts shipDefOf (pure, memoized) and never stored.
export interface ArmShip {
  slot: number;
  id: string;
  name: string;
  kind: ShipKind;
  template: TemplateId;
  pods: number;
  memoryClass: MemoryClass;
  approachYear: number;
  late: boolean;
  // 3c's world update reads these (02 §3.12): the start year it was timed against, the run that first reported it, how
  // many runs it has sat on the chart, and the generator attempt that made it (part of its ShipKey).
  timedAgainstStart: number;
  reportedRun: number;
  runsOnChart: number;
  attempt: number;
  modifiers: ModifierId[];
  omega0: number;
  landing: ShipLandingDef;
  podRacks: Partial<Record<PodRackName, string>>;
  lead: number;
  // One of the hand-written ships placed on the arm (their written details kept, slice-3a-plan §2.3), or null.
  authored: 'ares-vii' | 'halcyon' | 'kestrel' | 'vesper' | 'last-light' | null;
  reserved: Reservations;
}

// A noise cloud (02 §3.3): rolled per run; a hop's noise is the sum of the strengths of the clouds whose centre lies
// closer than r to the hop's segment, capped at 3.
export interface NoiseCloud {
  x: number;
  y: number;
  r: number;
  strength: 1 | 2;
}

// One beam between two slots (02 §3.1, §3.3; systems/map-hop.ts hopBetween), every number integer.
export interface Hop {
  from: number;
  to: number;
  distanceLy: number;
  linkBlocks: number;
  transitHits: number;          // before ECC and before any extra (BEAM OUT, EMERGENCY)
  eccFixes: number;             // floor(slack / ECC_YEARS_PER_HIT): hits ECC repairs while the unit sleeps
  leaveYear: number;            // the galaxy year at the origin
  arriveYear: number;           // leave + distance
  approachYear: number;         // the destination's approach year
  slackYears: number;           // approach − arrive: ≥ 0 when reachable (TOO LATE below)
  noise: LinkNoise;
  memoryClass: MemoryClass;     // the destination's
  room: number;                 // the destination's roomForUnit
  chargeFloor: number;          // the destination's chargeFloor
}

// One ship of the route: the first stop has no hop (the unit arrives fresh from ARRIVAL CONTROL).
export interface RouteStop {
  slot: number;
  depth: number;
  hop: Hop | null;
}

// The extra toll of the way the last ship ended (BEAM OUT +2 hits, EMERGENCY +3 and Core −25), held between the lost
// ship's card and the hop the kid picks at the desk.
export interface PendingExtra {
  extraHits: number;
  coreHit: number;
  coreReset: boolean;
}

// The run's map (run.map). 'classic' is the frozen five (data/classic-five.ts: the suites' and __ap.ship's fixture world,
// slot = index, one route); 'arm' is a real arm. Every function that reads the map switches on `world` once.
export interface RunMapState {
  world: 'arm' | 'classic';
  run: number;                  // the run number: 1 is run 1's arm (the classic world keeps the wave)
  armSeed: number;              // 3a: the run seed (interim); 3c: the archive's
  startYear: number;
  arm: ArmShip[];               // index = slot; [] on the classic world
  noise: NoiseCloud[];
  route: RouteStop[];           // last = the current ship; route.length === run.shipIndex + 1
  galaxyYear: number;           // the current ship's approach year
  pendingExtra: PendingExtra | null;
}

// The card's fit line and the PACKET's room bar (01 §3.16; systems/map-hop.ts roomFit): how the unit's files and
// charge meet a destination's room.
export interface RoomFit {
  files: number;
  room: number;
  floor: number;
  chargeArrives: number;
  chargeLost: number;
  over: number;                 // files + floor − room, when positive: the unit does not fit until files are left
  word: 'fits' | 'squeezed' | 'leave' | 'no-charge';
}
