import type { PlanetParams, Ring } from '@/types/orbit';
import type { PresetMode } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import type { SegmentRole } from '@/types/segment';
import type { ZoneDef } from '@/types/zone';
import type { ShipLandingDef } from '@/types/landing';
import type { ShipThreatDef } from '@/types/threat';
import {
  NAME_MAX_CHARS, INTEGRITY_MAX, SHRINK_MARGIN_TAC, SHRINK_MARGIN_MIN_TAC, SHRINK_SMALL_LOOP_FACTOR,
  SHRINK_REACTION_TAC, HALCYON_SMALL_LOOP_FACTOR, HALCYON_EDGE_BACK_OFF_TAC, KESTREL_SMALL_LOOP_FACTOR, KESTREL_EDGE_BACK_OFF_TAC,
  VESPER_SMALL_LOOP_FACTOR, VESPER_EDGE_BACK_OFF_TAC, LAST_LIGHT_SMALL_LOOP_FACTOR, LAST_LIGHT_EDGE_BACK_OFF_TAC,
} from '@data/tuning';
import { validateLandingDef } from '@data/landing-def';
import { validateZoneDefs } from '@systems/zones';
import {
  RACK_A, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, UNIT_RACKS_START, MEMORY_TOTAL_BLOCKS, buildShipMemory, validatePodRacks,
  rootSlotRack, maxRootFor, type ShipMemoryDef,
} from '@data/memory';
import { freeSegment } from '@systems/memory-ops';
import { createRng } from '@systems/rng';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { HOLLOW_STAGES } from '@data/threats';
import { ARES_RUN1_FAMILIES, ADA, HARD_WORDS_POOL } from '@data/souls';
import { hurtDriversFor, rootSlotNeighbours } from '@data/driver-damage';

// Per-ship flight data. Units: km, km/s, km/s², μ in km³/s²; radii from the planet centre.
// Everything that differs between ships lives here; global rules live in tuning.ts.

export interface ShipStart {
  r0: number;          // start radius
  rp0: number;         // periapsis of the arrival hyperbola (below R = impact course)
  vInf: number;        // hyperbolic excess speed
  omega0: number;      // argument of periapsis (orients the picture on the plot)
  sas: PresetMode;     // preset engaged at start, so the ship already points the right way
}

export interface ShipFlightDef {
  planet: PlanetParams;
  ring: Ring;
  start: ShipStart;
  tacticalWarp: number;  // game s per real s at TACTICAL pace (crash courses, burns, holds)
  cruiseWarp: number;    // game s per real s at CRUISE pace (quiet coasts)
  dvBudgetKmS: number;   // FUEL 100% in Δv
  aNominalKmS2: number;  // engine acceleration at full POWER with no caps
}

// HOLLOW's config is no longer the ship's (phase 3 slice 2): it is chosen per ship by the threat ladder
// (systems/threat-plan.ts planThreat) from data/threats.ts's stages. The types and the validator are re-exported here so
// phase 2's callers keep their imports.
export type { HollowDef, HollowWake, SeedTarget, HollowStoryKind, VerbDef, SeedDef } from '@/types/threat';
export { validateHollowDef } from '@data/threats';

// Scripted damage on arrival (§6.9: KESTREL's Sensor Interp to at most 45%, VESPER's Thrust Ctrl at 31%). A role the
// unit carries (Sensor Interp) is cut after the transit hits and named on the boot's own ECC line (systems/carry.ts);
// a role in rack A is the ship's own file ("rack A belongs to the ship", §6.9), built damaged with the ship's memory
// (data/memory.ts) and, like every ship file, hidden until scanned (§3.2): the boot does not name it, the `?` pip
// and the engine firing by itself do (WP10).
export interface ArrivalDamage {
  role: SegmentRole;
  maxIntegrity: number;
}

// How a unit gets to this ship (§6.9): the link's bandwidth in blocks (the files plus the charge that
// fit), how many seeded transit hits the crossing deals, the distance the TRANSMIT screen names, and
// the ship's own arrival damage. null on ship 1: the unit arrives there fresh from ARRIVAL CONTROL.
export interface ShipArrivalDef {
  linkBlocks: number;
  transitHits: number;
  distanceLy: number;
  damage: readonly ArrivalDamage[];
}

// A licence ARRIVAL CONTROL issues on this ship this many AI seconds into the flight (§6.5: MOVE at
// HALCYON boot + 25 s), or, with atCoast, as soon as the coast begins if that is sooner (the strip's
// first WAIT: the tool arrives for the fight it is for, WP7), or, with atFirstSeed, at the first seed's
// telegraph (§6.5: DELETE at KESTREL's first seed, WP9: the tool arrives with the thing it removes).
// afterAiSec null: only the moment issues it. A licence never issued by then (the ship was lost first) is
// issued at the next ship's start: the tools a later ship expects are always there. With atFirstGhost, at the
// ship's first uncommanded burst (§6.5: SWAP at VESPER's first ghost onset, WP10: the fix arrives with the problem).
export interface TimedLicence {
  kind: FsToolKind;
  afterAiSec: number | null;
  atCoast: boolean;
  atFirstSeed: boolean;
  atFirstGhost: boolean;
}

// The SHRINK THE LOOP stop rule in tactical seconds of RETRO (WP1-rules 2, LEAD-1; predict.ts
// planShrink), per ship: the over-hold margins and the reaction allowance are about a kid's hands, so
// they are tactical seconds on every ship, but where the ring's inner edge falls along a shrink
// depends on the ship's ring, gravity and warp, so each ship carries its own (see the values' WHY).
// • marginTac: the over-hold margin on a small loop once ▼ is below the ring;
// • marginMinTac: everywhere else (every second of braking on a big loop saves minutes of SKIP). It is
//   also the floor of the shrink's FUEL reserve (LEAD-1): near the end of a FUEL-limited shrink the trims
//   left are small, so SHRINK_FUEL_RESERVE_FRAC of them was close to nothing, and a kid who let go 1.2 s
//   late emptied the tank (ORBIT ACCEPTED instead of LOCKED). It is the same late release the over-hold
//   margin forgives for ▼: one promise for both, retuned together;
// • smallLoopFactor: "already small" means ▲ within this multiple of the ring's outer edge;
// • reactionTac: a kid's reaction: the spare FUEL a stop keeps for a release that late;
// • edgeBackOffTac: a shrink that would hand over with ▼ at the ring's inner edge stops this much RETRO
//   earlier (LEAD-1's reaction allowance: a release this late keeps ▼ in the ring, so the fix stays two
//   burns), which also sets the over-hold left before IMPACT at that hand-over.
export interface ShrinkTuning {
  marginTac: number;
  marginMinTac: number;
  smallLoopFactor: number;
  reactionTac: number;
  edgeBackOffTac: number;
}

export interface ShipDef {
  id: string;
  name: string;
  world: string;
  flight: ShipFlightDef;
  shrink: ShrinkTuning;
  arrival: ShipArrivalDef | null;
  // Hazard zones on this ship's way in (§6.8, WP9: KESTREL's debris cloud; LAST LIGHT's belt in WP11).
  zones: readonly ZoneDef[];
  licences: readonly TimedLicence[];
  // LAST LIGHT (WP11): the fleet's last ship. Losing it ends the run (FLAGSHIP LOST, §4.3); its ORBIT LOCK opens the
  // root duel and its finale (PURGE or MERGE) ends the run. Exactly one ship is the flagship, and it is the last.
  flagship: boolean;
  memory: ShipMemoryDef;
  // Where and how this ship's pods land (01-landing §3.5–§3.6): the LZs, the planet's forgiveness and terrain, its no-go
  // arcs, the run-1 colony name, drag. Copied into state.landing when the ship is built (never re-read at runtime), and
  // checked by validateLandingDef, which slice 3's roller reuses.
  landing: ShipLandingDef;
  // The ship's layer on the arm (01-landing §3.15's table): it sets the rolled driver arrival damage (data/driver-damage.ts:
  // one more FAILING driver from DRIVER_FAILING_FROM_LAYER). Slice 3's map gives every generated ship its layer; the fixed
  // five carry theirs (1, 2, 3, 5, 8: the run-1 route's).
  layer: number;
  // What the map will supply in slice 3 (04 §3.4, §3.8): the seeds the beam INTO this ship carries, and whether a final ship
  // is one hop from it (02-map M3). HOLLOW's config, stage and root are not here: the ladder (systems/threat-plan.ts
  // planThreat) decides them per run from these facts, the depth, TRACE and HOLLOW's age.
  threat: ShipThreatDef;
}

// Ship 1: the tutorial crash course. rp0 3,000 is underground, so the page opens on a red
// line and IMPACT 02:43 (3,265 game s at x20). OUT for about 8 tactical s lifts ▼ into the
// sweet zone, and the capture at ▼ costs about 1.0 of the 2.8 km/s budget, leaving ~36%
// FUEL for mistakes (the design's ship-1 probe, docs/design-v2.md).
const ARES_VII: ShipDef = {
  id: 'ares-vii',
  name: 'ARES-VII',
  world: 'Kepler-186f',
  flight: {
    planet: { R: 3390, rAtm: 3790, mu: 43000 },
    ring: { min: 5000, max: 9000 },
    start: { r0: 12000, rp0: 3000, vInf: 1.0, omega0: -0.6, sas: 'radial-out' },
    tacticalWarp: 20,
    cruiseWarp: 60,
    dvBudgetKmS: 2.8,
    aNominalKmS2: 0.005,
  },
  // The WP1-rules / LEAD-1 values, tuned on this ship (tuning.ts has their WHY): a shrink that starts with
  // ▼ in the ring and the ship near ▼ stops with ▼ at the ring's inner edge, which here happens to leave
  // 4–5 s of over-hold, so the 5 s margin and the ring-edge stop coincide (WP1-rules review round 1).
  shrink: {
    marginTac: SHRINK_MARGIN_TAC, marginMinTac: SHRINK_MARGIN_MIN_TAC, smallLoopFactor: SHRINK_SMALL_LOOP_FACTOR,
    reactionTac: SHRINK_REACTION_TAC, edgeBackOffTac: SHRINK_REACTION_TAC,
  },
  arrival: null,
  zones: [],
  // REPAIR is licensed by its own rule (systems/licences.ts: the first look inside, or the first line
  // that needs it), on whichever ship that happens.
  licences: [],
  flagship: false,
  // A calm ship (phase 3 slice 2, 04 §3.2, 01-landing §3.16): three pods at the start of rack B and no root slot (no
  // HOLLOW aboard). POD 01 OKAFOR is Ada's family, first in the credits. POD 02 BRANDT arrives at 44% (it would land hard:
  // the coast's one REPAIR, 01-landing §3.8's scripted damage). Still FULL 384 (memory classes are slice 3).
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P _40', C: '_64', D: '_64' },
    aiFiles: { E: FRESH_UNIT_RACK_E, F: FRESH_UNIT_RACK_F },
    drivers: {
      familiesSeedStream: 'families',
      damage: 'scripted',
      hurt: [{ pod: 2, integrity: 44 }],
      lead: 1,
      firstRun: { families: ARES_RUN1_FAMILIES, leadIndex: 0, lead: ADA },
    },
  },
  // Kepler-186f: one WIDE site for 3 pods on a GENTLE plain. LZ-A at 160° places the first window about 1–4 minutes of
  // TACTICAL after a typical lock near ▼ (ω ≈ −34°, the dot about 80° ahead), the spec's `LZ-A in 3:40`.
  landing: {
    lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 3 }],
    forgiveness: 'gentle',
    terrain: 'PLAINS',
    noGo: [],
    colonyFirstRun: 'RIVERSIDE',
    drag: false,
  },
  // Layer 1 (01-landing §3.15): calm, no beam seeds (04 §3.1: depth 1), and no final ship one hop away.
  layer: 1,
  threat: { beamSeeds: { kind: 'none' }, oneHopFromFinal: false },
};

// Ship 2: steer IN (§4.2, §5.1 2:20). The path arrives far too wide (▼ at 14,000 km, the ring is
// 5,000–7,500): a dashed FLYBY that passes outside the ring, `TOO WIDE — hold [SPACE]` with IN already
// engaged. About 5 s of IN pulls ▼ into the ring, then the long coast (≈166 s at CRUISE without SKIP)
// is the MIND's maintenance phase: a calm ship since phase 3 slice 2 (04 §3.2: no adversary), whose work is the transit
// hits, Sensor Interp arriving at 62 at most (risk 10) and one degraded driver. The ring is
// narrower than ship 1's, and FUEL a little tighter (2.4 km/s for a 1.73 km/s need).
const HALCYON: ShipDef = {
  id: 'halcyon',
  name: 'HALCYON',
  world: 'Tessaly',
  flight: {
    planet: { R: 3390, rAtm: 3790, mu: 43000 },
    ring: { min: 5000, max: 7500 },
    start: { r0: 30000, rp0: 14000, vInf: 1.2, omega0: 2.4, sas: 'radial-in' },
    tacticalWarp: 25,
    cruiseWarp: 80,
    dvBudgetKmS: 2.4,
    aNominalKmS2: 0.005,
  },
  // WP7 (the lead's per-ship shrink tuning, swept with tests/unit/wp1-rules and tests/unit/lead1 under AP_SHIP=1):
  // • at ×25 a tactical second of RETRO sinks ▼ a quarter faster than on ship 1, and from the ring's inner
  //   edge ▼ reaches the surface in about 2.8 tac s, so the ring-edge hand-over with ship 1's 0.6 s
  //   back-off left 3.2–3.6 s of over-hold before IMPACT (ship 1: 4–5 s). Backing off HALCYON_EDGE_BACK_OFF_TAC
  //   instead gives the same 4–5 s, and a release up to that late still keeps the two-burn fix;
  // • "already small" is the same distance as on ship 1 (22,500 km: the same planet, so the same periods and
  //   the same seconds of SKIP to the next pass), which on this narrower ring is 3 × its outer edge.
  shrink: {
    marginTac: SHRINK_MARGIN_TAC, marginMinTac: SHRINK_MARGIN_MIN_TAC, smallLoopFactor: HALCYON_SMALL_LOOP_FACTOR,
    reactionTac: SHRINK_REACTION_TAC, edgeBackOffTac: HALCYON_EDGE_BACK_OFF_TAC,
  },
  // §6.9's link and hits; then the ship's own scripted arrival damage (slice-2-plan risk 10): Sensor Interp to at most 62,
  // so ship 2's lesson (a degraded sensor widens the dot, and LZ-B's STANDARD bracket shows it) never hangs on a seeded
  // transit hit missing it.
  arrival: { linkBlocks: 120, transitHits: 3, distanceLy: 22, damage: [{ role: 'sensor', maxIntegrity: 62 }] },
  zones: [],
  // No licence (slice-2-plan §3.2): with no HOLLOW here MOVE would have no job until KESTREL's debris, so it moved there
  // ("the tool arrives for the fight it is for", WP7).
  licences: [],
  flagship: false,
  // A calm ship (01-landing §3.16): five pods at the start of rack B, no root slot; the families are seeded, and
  // ceil(5 ÷ 5) = 1 driver arrives degraded (data/driver-damage.ts). POD 05 leads the credits.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P _24', C: '_64', D: '_64' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
      damage: 'rolled',
      hurt: [],
      lead: 5,
      firstRun: null,
    },
  },
  // Tessaly: two sites, LZ-A 3 and LZ-B 2 (the lesson is the split), GENTLE grassland.
  landing: {
    lzs: [
      { label: 'LZ-A', centreDeg: 40, width: 'wide', pods: 3 },
      { label: 'LZ-B', centreDeg: 190, width: 'standard', pods: 2 },
    ],
    forgiveness: 'gentle',
    terrain: 'GRASSLAND',
    noGo: [],
    colonyFirstRun: null,
    drag: true,
  },
  // Layer 2: calm (04 §3.1: depth 2), nothing rides the beam in.
  layer: 2,
  threat: { beamSeeds: { kind: 'none' }, oneHopFromFinal: false },
};

// Ship 3: flying blind, debris ahead (§4.2, §5.1 4:40, §9 WP9). The path arrives too wide (▼ at 9,000 km,
// ring 5,000–7,000) and runs straight through a debris cloud (900 km across, on the arrival path at
// 14,000 km, about 225 tactical s in) that names the rack it will hit. The unit arrives with Sensor Interp at
// 45% (PATH UNCERTAIN: a grey band and `HIT?`), so the first move is a REPAIR; then an early IN correction
// pulls ▼ into the ring and, because it is early, off the cloud (the design's probe: started by 80 tac s it
// clears it by 160+ km; WP9 review round 1: held through the sweet zone as the strip asks, it still dodges from
// up to about 152 tac s in, judged with both Core threads busy (LEAD-2), and the strip counts that down). FUEL 2.1 km/s for a 1.56–1.67 need.
// Since phase 3 slice 2 HOLLOW is not aboard (04 §3.1: depth 3 is the SEEDS act): the beam brings seeds instead, laid out
// behind the files they rode with (run 1: one next to Telemetry, the RM lesson), and DELETE is licensed at the start.
const KESTREL: ShipDef = {
  id: 'kestrel',
  name: 'KESTREL',
  world: 'Brine',
  flight: {
    planet: { R: 3390, rAtm: 3790, mu: 43000 },
    ring: { min: 5000, max: 7000 },
    start: { r0: 25000, rp0: 9000, vInf: 1.4, omega0: 0.9, sas: 'radial-in' },
    tacticalWarp: 25,
    cruiseWarp: 80,
    dvBudgetKmS: 2.1,
    aNominalKmS2: 0.005,
  },
  // WP9 (the lead's per-ship shrink tuning, swept with tests/unit/wp1-rules and tests/unit/lead1 under AP_SHIP=2): see the
  // constants' WHY in tuning.ts.
  shrink: {
    marginTac: SHRINK_MARGIN_TAC, marginMinTac: SHRINK_MARGIN_MIN_TAC, smallLoopFactor: KESTREL_SMALL_LOOP_FACTOR,
    reactionTac: SHRINK_REACTION_TAC, edgeBackOffTac: KESTREL_EDGE_BACK_OFF_TAC,
  },
  // §4.2/§6.9: link 112 blocks, 4 transit hits; then KESTREL's own arrival damage (Sensor Interp to at most 45).
  arrival: { linkBlocks: 112, transitHits: 4, distanceLy: 27, damage: [{ role: 'sensor', maxIntegrity: 45 }] },
  // §4.2: rack C on the written run (the story's C07–C12), rack B or C (seeded) on a later one.
  zones: [{ kind: 'debris', id: 'kestrel-debris', centre: { onInboundAtR: 14000 }, r: 900, rack: 'C', laterRacks: ['B', 'C'] }],
  // Slice-2-plan §3.2: DELETE at the flight's first tick (the beam seeds are already in memory by then: the tool arrives
  // with the thing it removes), MOVE as the coast begins (its first job is the debris lesson, `DEBRIS HITS RACK C`, so it
  // is known before VESPER's walls).
  licences: [
    { kind: 'delete', afterAiSec: 0, atCoast: false, atFirstSeed: false, atFirstGhost: false },
    { kind: 'move', afterAiSec: null, atCoast: true, atFirstSeed: false, atFirstGhost: false },
  ],
  flagship: false,
  // Twelve pods, six in rack B and six in rack C (the debris's rack on the written run: the story's C07–C12), no root
  // slot (01-landing §3.16: HOLLOW never boards before depth 4); rack D is empty (room to MOVE them out of the debris's
  // rack). POD 10 leads the credits. ceil(12 ÷ 5) = 3 drivers arrive degraded (data/driver-damage.ts).
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P _16', C: 'P P P P P P _16', D: '_64' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
      damage: 'rolled',
      hurt: [],
      lead: 10,
      firstRun: null,
    },
  },
  // Brine: an ocean world, HARSH (off-site pods score nothing), so its three sites are all WIDE, 4 pods each, and it has
  // no no-go arcs (§3.15: it may be a calm ship). 12 pods keep today's 2,400 colonists (risk 2).
  landing: {
    lzs: [
      { label: 'LZ-A', centreDeg: 20, width: 'wide', pods: 4 },
      { label: 'LZ-B', centreDeg: 140, width: 'wide', pods: 4 },
      { label: 'LZ-C', centreDeg: 260, width: 'wide', pods: 4 },
    ],
    forgiveness: 'harsh',
    terrain: 'OCEAN',
    noGo: [],
    colonyFirstRun: null,
    drag: true,
  },
  // Layer 3, depth 3: the SEEDS act (04 §3.1). The tutorial run's beam carries one seed next to Telemetry (risk 4: it
  // garbles, it never strands); a later run rolls NOISY (2) odds.
  layer: 3,
  threat: { beamSeeds: { kind: 'scripted', firstRun: [{ role: 'telemetry' }], later: 2 }, oneHopFromFinal: false },
};

// Ship 4: the engine fires by itself (§4.2, §5.3 moment 11, §9 WP10). The path arrives already in the ring (▼ at
// 5,600 km, ring 5,000–7,000) with RETRO engaged, so the flight opens on a WAIT for the capture at ▼ (a coast of about
// 114 s at CRUISE). But the ship's own Thrust Ctrl arrives at 31% (failing, hidden until scanned): the engine fires by
// itself along RETRO at a failing controller's rate and strength (GHOST_BY_BAND in tuning.ts, WP12's tuning: about
// every 10 tactical s for 1 tac s at 30% thrust), and each burst drags ▼ about 120 km down, 1,500–4,500 km over the
// coast: a kid who never SWAPs loses VESPER (STRANDED, or FLEW AWAY on an empty tank), while one who follows the pip
// lesson after the second burst locks it. FUEL 1.8 km/s for a 1.32 need plus the drift fixes. The first burst is the
// alarm (UNCOMMANDED THRUST, SWAP is licensed with it), and the cure is a file: SWAP to Thrust.alt.
// Since phase 3 slice 2 HOLLOW boards on the beam into VESPER (04 §3.8: depth 4, one hop from the final ship), a 10-block
// root in the bay's slot, and plays ARRIVAL with WALLS folded in (04 §3.9): silent until the loop closes, then the fight.
const VESPER: ShipDef = {
  id: 'vesper',
  name: 'VESPER',
  world: 'Cinder',
  flight: {
    planet: { R: 3390, rAtm: 3790, mu: 43000 },
    ring: { min: 5000, max: 7000 },
    start: { r0: 25000, rp0: 5600, vInf: 1.6, omega0: -2.2, sas: 'retrograde' },
    tacticalWarp: 30,
    cruiseWarp: 80,
    dvBudgetKmS: 1.8,
    aNominalKmS2: 0.005,
  },
  // WP10 (the lead's item 2: the shrink's constants swept on VESPER with AP_SHIP=3, as after its SWAP; with the ghost
  // live the same suites are a measurement, not a gate): see the constants' WHY in tuning.ts.
  shrink: {
    marginTac: SHRINK_MARGIN_TAC, marginMinTac: SHRINK_MARGIN_MIN_TAC, smallLoopFactor: VESPER_SMALL_LOOP_FACTOR,
    reactionTac: SHRINK_REACTION_TAC, edgeBackOffTac: VESPER_EDGE_BACK_OFF_TAC,
  },
  // §4.2/§6.9: link 104 blocks, 5 transit hits; then the ship's own Thrust Ctrl, built at 31% (rack A is the ship's).
  arrival: { linkBlocks: 104, transitHits: 5, distanceLy: 31, damage: [{ role: 'thrust-ctrl', maxIntegrity: 31 }] },
  zones: [],
  // §6.5: COPY at the boot (the flight's first moment: the tool is there before the seeds come for your tools), SWAP at
  // the first uncommanded burst (the fix arrives with the problem).
  licences: [
    { kind: 'copy', afterAiSec: 0, atCoast: false, atFirstSeed: false, atFirstGhost: false },
    { kind: 'swap', afterAiSec: null, atCoast: false, atFirstSeed: false, atFirstGhost: true },
  ],
  flagship: false,
  // Twelve pods (01-landing §3.16): six in rack B, five in rack C around the root slot `S` (POD 08 a 2-block GAP on its
  // left, POD 09 a 1-block GAP on its right, so the scripted bite takes POD 09), and POD 12 in rack D, whose 56 free
  // blocks are the room to MOVE drivers behind a WALL. The slot's rack ends in 21 free: the 10-block root lands there
  // (it takes its blocks off that tail), and a fed root up to PRE_FINAL_ROOT_CAP still fits. POD 09 leads the credits.
  // ceil(12 ÷ 5) = 3 drivers arrive degraded and one failing (layer 5), never POD 09 or the slot's neighbours.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P _16', C: 'P P _2 S _1 P P P _21', D: 'P _56' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
      damage: 'rolled',
      hurt: [],
      lead: 9,
      firstRun: null,
    },
  },
  // Cinder: ROUGH volcanic ground, three sites at 5 · 4 · 3 (the NARROW LZ takes the smallest count, §3.15). Two lava
  // no-go arcs on the dot's path (slice 1b, plan §2.1): 5° at 187.4°, 90 km past LZ-B's edge (a late launch or a wide dot),
  // and 6° at 293.4°, 88 km before NARROW LZ-C (an early one). A healthy sure launch at 6,000 km (±78 km) never reaches
  // them; a degraded Sensor Interp (±117 km) or a failing driver does: §3.6's "a wide dot is a real risk".
  landing: {
    lzs: [
      { label: 'LZ-A', centreDeg: 60, width: 'standard', pods: 5 },
      { label: 'LZ-B', centreDeg: 180, width: 'standard', pods: 4 },
      { label: 'LZ-C', centreDeg: 300, width: 'narrow', pods: 3 },
    ],
    forgiveness: 'rough',
    terrain: 'VOLCANIC',
    noGo: [{ centreDeg: 187.4, widthDeg: 5, word: 'LAVA' }, { centreDeg: 293.4, widthDeg: 6, word: 'LAVA' }],
    colonyFirstRun: null,
    drag: true,
  },
  // Layer 5, depth 4, one hop from LAST LIGHT: HOLLOW boards here whatever TRACE says (04 §3.8). A clean beam (noise 0,
  // slice-2-plan risk 2): one ship of HOLLOW before the finale is already full of first-time mechanics.
  layer: 5,
  threat: { beamSeeds: { kind: 'noise', noise: 0 }, oneHopFromFinal: true },
};

// Ship 5: LAST LIGHT, the flagship, the climax (§4.2, §9 WP11). It opens like ship 1, on a crash course (▼ at 3,200
// km is underground: IMPACT about 03:04 at ×30) with OUT engaged, so the first lesson of the game is the first thing it
// asks again; then the coast crosses a radiation belt (9,000–12,000 km, about 0:36 inside at TACTICAL) that peppers
// racks A–B (§6.8: −8 to a random file in them about every 200 game s, ≈5 hits): the ship's files and rack B's seven
// drivers, so the kid moves drivers out of rack B before it, or REPAIRs them after. FUEL 2.5 km/s for a 1.76 need.
// HOLLOW is at its worst, the FINALE stage (data/threats.ts; THE DEAL folded in when the run has not had it): the root is
// 16 blocks in rack C's slot between POD 11 and POD 12 (GAPs of 2 and 1), it bites every 12 s at 5 %/s (heal 18.5 %/s
// still beats 1.5 × its worst 10), drops a seed into your walls every 35 s, and uses your own verbs (MV, RM) every 12 s of
// calm. Its ORBIT LOCK opens the root for the duel.
const LAST_LIGHT: ShipDef = {
  id: 'last-light',
  name: 'LAST LIGHT',
  world: 'New Haven',
  flight: {
    planet: { R: 3390, rAtm: 3790, mu: 43000 },
    ring: { min: 5000, max: 7000 },
    start: { r0: 18000, rp0: 3200, vInf: 1.5, omega0: 1.6, sas: 'radial-out' },
    tacticalWarp: 30,
    cruiseWarp: 60,
    dvBudgetKmS: 2.5,
    aNominalKmS2: 0.005,
  },
  // WP11 (the lead's per-ship tuning, swept on LAST LIGHT with AP_SHIP=4): see the constants' WHY in tuning.ts.
  shrink: {
    marginTac: SHRINK_MARGIN_TAC, marginMinTac: SHRINK_MARGIN_MIN_TAC, smallLoopFactor: LAST_LIGHT_SMALL_LOOP_FACTOR,
    reactionTac: SHRINK_REACTION_TAC, edgeBackOffTac: LAST_LIGHT_EDGE_BACK_OFF_TAC,
  },
  // §6.9: 6 transit hits (the longest crossing), the last 36 LY of the route. Link 98 blocks, not phase 2's 96 (slice 2,
  // Track OPENING's re-fly): 046.log rides in every packet (2 locked blocks, 05 §3.2), and on the last crossing the link,
  // not the charge, is what limits the charge that arrives (its files are 82–84 blocks by then), so the log cost MERGE's 20 at the choice
  // in most runs (wp11/full-run, RUN_SEEDS=8: 3 of 8 before). The 2 blocks are given back here; the log stays paid
  // everywhere else.
  arrival: { linkBlocks: 98, transitHits: 6, distanceLy: 36, damage: [] },
  // §9 WP11 item 1: the belt (WP9's belt kind) hits racks A–B.
  zones: [{ kind: 'belt', id: 'last-light-belt', rIn: 9000, rOut: 12000, racks: ['A', 'B'] }],
  // Every tool is licensed by now (a licence a lost ship never issued comes at this ship's start: licences.ts).
  licences: [],
  flagship: true,
  // 01-landing §3.16's final-ship layout (plan §2, risk 4: it moves the boss geometry, so boss-sim is re-measured):
  // sixteen pods, seven in rack B (the belt hits A–B), the root slot `S` in rack C between POD 11 (a 2-block GAP) and
  // POD 12 (a 1-block GAP, bitten first), and four in rack D with its last 32 blocks free. The slot's rack ends in 21 free:
  // the 16-block root takes its blocks off that tail (5 left, as phase 2's `R16 _1 P _5`), and slice 7's 18-block MERGE
  // root still fits (FINAL_ROOT_MAX_BLOCKS). POD 12 leads the credits. Layer 8: four drivers arrive degraded and one
  // failing (data/driver-damage.ts), never POD 12 or the slot's neighbours.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P P _8', C: 'P P P P _2 S _1 P _21', D: 'P P P P _32' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
      damage: 'rolled',
      hurt: [],
      lead: 12,
      firstRun: null,
    },
  },
  // New Haven: GENTLE plains, the final ship's 16 pods over four sites, STANDARD ×3 and NARROW ×1 (§3.15's layer 8). The
  // tutorial run calls its colony FIRST LIGHT. Its cliffs (slice 1b, plan §2.1): 6° at 286.6°, 88 km past NARROW LZ-D's
  // edge, so the guard reads `LAUNCH INTO CLIFFS? scores 0`.
  landing: {
    lzs: [
      { label: 'LZ-A', centreDeg: 10, width: 'standard', pods: 4 },
      { label: 'LZ-B', centreDeg: 100, width: 'standard', pods: 4 },
      { label: 'LZ-C', centreDeg: 190, width: 'standard', pods: 4 },
      { label: 'LZ-D', centreDeg: 280, width: 'narrow', pods: 4 },
    ],
    forgiveness: 'gentle',
    terrain: 'PLAINS',
    noGo: [{ centreDeg: 286.6, widthDeg: 6, word: 'CLIFFS' }],
    colonyFirstRun: 'FIRST LIGHT',
    drag: true,
  },
  // Layer 8, the final ship (flagship): it plays FINALE whatever came before (04 §3.9). A clean beam (risk 2).
  layer: 8,
  threat: { beamSeeds: { kind: 'noise', noise: 0 }, oneHopFromFinal: false },
};

// Throws on any ship whose numbers would make the flight impossible or the rules
// contradictory. Runs for every entry at module load: bad data fails the page loudly
// instead of producing a flight nobody can win.
export function validateShipDef(ship: ShipDef): void {
  const { planet, ring, start, tacticalWarp, cruiseWarp, dvBudgetKmS, aNominalKmS2 } = ship.flight;
  const fail = (why: string): never => { throw new Error(`ShipDef ${ship.id}: ${why}`); };
  const positives: [string, number][] = [
    ['planet.R', planet.R], ['planet.rAtm', planet.rAtm], ['planet.mu', planet.mu],
    ['ring.min', ring.min], ['ring.max', ring.max],
    ['start.r0', start.r0], ['start.rp0', start.rp0], ['start.vInf', start.vInf],
    ['tacticalWarp', tacticalWarp], ['cruiseWarp', cruiseWarp],
    ['dvBudgetKmS', dvBudgetKmS], ['aNominalKmS2', aNominalKmS2],
  ];
  for (const [name, value] of positives) {
    if (!(value > 0) || !Number.isFinite(value)) fail(`${name} must be a positive number (got ${value})`);
  }
  if (planet.rAtm <= planet.R) fail('the atmosphere must sit above the surface');
  if (ring.min <= planet.rAtm) fail('ring.min must be above the atmosphere');
  if (ring.min >= ring.max) fail('ring.min must be below ring.max');
  if (start.r0 <= ring.max) fail('start.r0 must be outside the ring');
  if (cruiseWarp <= tacticalWarp) fail('cruiseWarp must be faster than tacticalWarp');
  // Lines like "Hello, Unit 47! ARES-VII is about to hit a planet. :)" are checked against the
  // strip width with a name this long (tests/unit/wp2/say.test.ts).
  if (ship.name.length > NAME_MAX_CHARS) fail(`name '${ship.name}' is longer than ${NAME_MAX_CHARS} characters`);
  const { marginTac, marginMinTac, smallLoopFactor, reactionTac, edgeBackOffTac } = ship.shrink;
  if (!(marginMinTac > 0 && marginTac >= marginMinTac)) fail(`shrink margins must be positive with marginTac ≥ marginMinTac (got ${marginTac}, ${marginMinTac})`);
  if (!(smallLoopFactor > 1)) fail(`shrink.smallLoopFactor must be above 1 (got ${smallLoopFactor})`);
  if (!(reactionTac >= 0 && reactionTac < marginMinTac)) fail(`shrink.reactionTac must be in [0, marginMinTac) (got ${reactionTac})`);
  if (!(edgeBackOffTac >= reactionTac && edgeBackOffTac < marginTac)) fail(`shrink.edgeBackOffTac must be in [reactionTac, marginTac) (got ${edgeBackOffTac})`);
  if (ship.arrival !== null) {
    const { linkBlocks, transitHits, distanceLy } = ship.arrival;
    if (!(Number.isInteger(linkBlocks) && linkBlocks > 0)) fail(`arrival.linkBlocks must be a positive integer (got ${linkBlocks})`);
    if (!(Number.isInteger(transitHits) && transitHits >= 0)) fail(`arrival.transitHits must be a whole number (got ${transitHits})`);
    if (!(distanceLy > 0)) fail(`arrival.distanceLy must be positive (got ${distanceLy})`);
  }
  if ((ship.arrival === null) !== (ship.memory.aiFiles !== null)) fail('a ship meets a fresh unit (written racks E–F) exactly when nothing arrives by transmission');
  for (const licence of ship.licences) {
    if (licence.afterAiSec !== null && !(licence.afterAiSec >= 0)) fail(`licence ${licence.kind} afterAiSec must be ≥ 0 (got ${licence.afterAiSec})`);
    // A licence that waits for a seed needs a ship whose threat brings seeds (beam seeds, or a HOLLOW stage that drops its
    // own: the ladder decides those per run, so only the beam is checkable here), or another moment that issues it.
    const otherMoment = licence.afterAiSec !== null || licence.atCoast || licence.atFirstGhost;
    if (licence.atFirstSeed && !beamBringsSeeds(ship) && !otherMoment) fail(`licence ${licence.kind} waits for a seed on a ship whose beam brings none`);
    if (licence.afterAiSec === null && !licence.atCoast && !licence.atFirstSeed && !licence.atFirstGhost) {
      fail(`licence ${licence.kind} has no moment that issues it`);
    }
  }
  // The ship's own arrival damage on a rack-A file must leave the file hurt but alive (data/memory.ts builds it damaged;
  // a role rack A does not hold is skipped there, and RACK_A holds every role a rule names today).
  for (const rule of ship.arrival?.damage ?? []) {
    if (!(rule.maxIntegrity > 0 && rule.maxIntegrity < INTEGRITY_MAX)) fail(`arrival damage to ${rule.role} must leave it hurt but alive (got ${rule.maxIntegrity})`);
  }
  validateZoneDefs(ship.id, ship.zones, ship.flight);
  const firstRun = ship.memory.drivers.firstRun;
  if (firstRun && firstRun.leadIndex !== ship.memory.drivers.lead - 1) fail('the first run\'s lead colonist must be in the lead pod');
  validateLandingDef(ship.id, ship.landing, ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0), planet.R);
  validatePodRacks(ship);
  // The memory layout is validated by building it, both ways (the first run's written families and
  // the seeded ones): buildShipMemory throws on a rack that does not fill 64 blocks, an unknown
  // token or a duplicate role. A bad layout fails the page at load, not when the kid reaches that
  // ship. A ship whose racks E–F are carried in is built with those racks empty (carry.ts packs the
  // real ones on arrival, and throws if they do not fit).
  const emptyUnit = { startAddr: UNIT_RACKS_START, segs: [freeSegment(MEMORY_TOTAL_BLOCKS - UNIT_RACKS_START)] };
  // A ship with a root slot is built both empty and holding the largest root it may ever get (maxRootFor), so a slot
  // that can't take it fails here too.
  const roots: ({ blocks: number } | null)[] = rootSlotRack(ship) === null ? [null] : [null, { blocks: maxRootFor(ship) }];
  for (const firstRun of [true, false]) {
    for (const root of roots) {
      const memory = buildShipMemory(ship, ship.memory.aiFiles ? null : emptyUnit, createRng(0), firstRun, UNNAMED_HOLLOW, root);
      const drivers = memory.filter((seg) => seg.type === 'driver').length;
      // The LANDING REPORT never repeats a hard-landing line on one ship.
      if (drivers > HARD_WORDS_POOL.length) fail(`${drivers} pods, but only ${HARD_WORDS_POOL.length} hard-landing lines`);
      // A root comes from the ladder now, into the layout's `S` slot (01-landing §3.16); a written `R` would be a HOLLOW
      // the ladder never chose, so no layout may hold one, and the built memory holds exactly the root it was given.
      const built = memory.filter((seg) => seg.type === 'hollow' && seg.root).length;
      if (built !== (root === null ? 0 : 1)) fail(`the rack layout holds ${built} HOLLOW root(s) for ${root === null ? 'no' : 'one'} root: roots come from the threat ladder into an S slot`);
    }
  }
  // The flagship's finale deletes one root in its duel: its layout must have the slot, and the ladder's FINALE (the stage
  // every final ship plays) must bring the verbs (data/threats.ts validates the stages).
  if (ship.flagship && rootSlotRack(ship) === null) fail('the flagship has no root slot (an S token) for the FINALE\'s root');
  if (ship.flagship && HOLLOW_STAGES.finale.hollow.verbs === null) fail('the FINALE stage has no verbs for the flagship\'s duel');
  // A ship one hop from a final ship is where HOLLOW is forced aboard (04 §3.8): its root needs a slot.
  if (ship.threat.oneHopFromFinal && rootSlotRack(ship) === null) fail('HOLLOW boards here (one hop from the final ship), but the layout has no root slot');
  if (!(Number.isInteger(ship.layer) && ship.layer >= 1)) fail(`layer must be a whole number ≥ 1 (got ${ship.layer})`);
  // Driver arrival damage (01-landing §3.8): a scripted ship writes its hurt drivers, a rolled one leaves the layer's roll
  // to data/driver-damage.ts, so a written list there would be silently ignored. The roll must have room: it never hurts
  // the lead or the root slot's neighbours (slice-2-plan risk 9). Rolled on a few seeds, so a ship too small fails here.
  const { damage, hurt } = ship.memory.drivers;
  if ((damage === 'scripted') !== (hurt.length > 0)) fail(`drivers.damage '${damage}' with ${hurt.length} written hurt driver(s)`);
  const avoid = rootSlotNeighbours(ship);
  for (const seed of [0, 1, 2]) {
    for (const firstRun of [true, false]) {
      const rolled = hurtDriversFor(ship, firstRun, createRng(seed));
      if (rolled.some((driver) => driver.pod === ship.memory.drivers.lead || avoid.includes(driver.pod))) {
        fail('driver arrival damage hurt the lead or a driver beside the root slot');
      }
    }
  }
  const seeds = ship.threat.beamSeeds;
  if (seeds.kind === 'scripted' && seeds.firstRun.length === 0) fail('a scripted beam seed source with no first-run seed (use { kind: \'none\' })');
}

// The beam into this ship can bring seeds at all (04 §3.4): a scripted source, or noise above CLEAN.
export function beamBringsSeeds(ship: ShipDef): boolean {
  const seeds = ship.threat.beamSeeds;
  if (seeds.kind === 'none') return false;
  if (seeds.kind === 'noise') return seeds.noise > 0;
  return true;
}

// The fleet as a whole: it ends with its one flagship (§4.2: LAST LIGHT is ship 5). A run ends after the last ship,
// and the flagship's finale is that end, so any other order would leave a ship after the climax, or none with it.
export function validateFleet(ships: readonly ShipDef[]): void {
  const flagships = ships.filter((ship) => ship.flagship);
  if (flagships.length !== 1) throw new Error(`ShipDef fleet: ${flagships.length} flagships, not exactly one`);
  if (ships[ships.length - 1] !== flagships[0]) throw new Error(`ShipDef fleet: the flagship ${flagships[0]!.id} is not the last ship`);
}

export const SHIPS: readonly ShipDef[] = [ARES_VII, HALCYON, KESTREL, VESPER, LAST_LIGHT];
SHIPS.forEach(validateShipDef);
validateFleet(SHIPS);

// The last ship of the fleet: the flagship (validateFleet). A run ends after it (§4.1).
export function isLastShip(index: number): boolean {
  return index === SHIPS.length - 1;
}

export function getShip(index: number): ShipDef {
  const ship = SHIPS[index];
  if (!ship) throw new Error(`No ship at index ${index} (have ${SHIPS.length})`);
  return ship;
}
