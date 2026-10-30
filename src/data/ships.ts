import type { PlanetParams, Ring } from '@/types/orbit';
import type { PresetMode } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import type { SegmentRole } from '@/types/segment';
import type { ZoneDef } from '@/types/zone';
import type { ShipLandingDef } from '@/types/landing';
import {
  NAME_MAX_CHARS, DRIVER_BLOCKS, HEAL_BEATS_DRAIN_FACTOR, INTEGRITY_MAX, SHRINK_MARGIN_TAC, SHRINK_MARGIN_MIN_TAC, SHRINK_SMALL_LOOP_FACTOR,
  SHRINK_REACTION_TAC, HALCYON_SMALL_LOOP_FACTOR, HALCYON_EDGE_BACK_OFF_TAC, KESTREL_SMALL_LOOP_FACTOR, KESTREL_EDGE_BACK_OFF_TAC,
  VESPER_SMALL_LOOP_FACTOR, VESPER_EDGE_BACK_OFF_TAC, LAST_LIGHT_SMALL_LOOP_FACTOR, LAST_LIGHT_EDGE_BACK_OFF_TAC,
  VERB_TELEGRAPH_SEC, VERB_FIRST_TELEGRAPH_SEC,
} from '@data/tuning';
import { validateLandingDef } from '@data/landing-def';
import { validateZoneDefs } from '@systems/zones';
import {
  RACK_A, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, UNIT_RACKS_START, MEMORY_TOTAL_BLOCKS, buildShipMemory, validatePodRacks,
  type ShipMemoryDef,
} from '@data/memory';
import { freeSegment } from '@systems/memory-ops';
import { repairRatePerSec } from '@data/fs-tools';
import { createRng } from '@systems/rng';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { ARES_RUN1_FAMILIES, ADA, HARD_WORDS_POOL } from '@data/souls';

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

// HOLLOW on one ship (§4.2, §6.6), all in AI seconds and integrity points per AI second.
// • wake: 'loop-closed-once' (ship 1: one scripted bite on the driver next to the root, the first
//   time the loop closes, then it goes dormant) or { afterAiSec, coastLeadSec } (later ships: wakes
//   this long into the flight, bites at once, then every spreadEverySec). With coastLeadSec it wakes
//   sooner if the coast begins first: that many AI seconds after the strip first says WAIT (WP7), so
//   the fight is the coast's, and a kid who SKIPs at once does not meet it mid-capture instead.
// • spreadEverySec: the one global bite timer (NEXT BITE m:ss); null: it never spreads (ship 1).
// • drainPerSec: what an infected file loses, × the larger of burnMult while the engine delivers thrust (P1) and
//   landMult while the landing is active: an in-band window open with a launchable pod (01-landing §5: that condition
//   is the definition; it gets desperate as its food leaves).
// • seed: ship 3's seeds (WP9, §6.6): every everySec a 2-block seed is telegraphed, then lands; the first
//   one firstAfterSec after the wake (so the first lands on the coast, between two bites). 'walls' aims at
//   the walls that guard the colonists (systems/hollow.ts seedSpot); 'near-tools' (VESPER, WP10) at your
//   filesystem tools.
// • deal: ship 4's DEAL (WP10, §6.6, systems/hollow-deal.ts): once, HOLLOW offers to leave the others alone
//   for the pod whose driver is at its front.
// • verbs: ship 5's verbs (WP11, §6.6, systems/hollow-verbs.ts): every everySec of calm (the clock stands still while
//   the flight is at TACTICAL) HOLLOW picks MV or RM (`unlink` on screen), counts it down telegraphSec in your TERMINAL
//   (the ship's first one firstTelegraphSec), and does it unless an op touched its target meanwhile (BLOCKED); while the
//   root's DELETE runs, every duelEverySec instead.
// • story: what HOLLOW says on this ship (systems/hollow.ts, data/hollow-text.ts). 'notices-you':
//   ship 1, after the first fight (`> ...047?`). 'names-itself': ship 2, at the wake (`> hello 047…`,
//   `> i was 046…`, CONTROL, and in landing `> i ran out…`). 'wants-charge': ship 4, the last line of its boot
//   (`> keep 20 charge for me, 047. you'll see.`, WP10: MERGE's price, foreshadowed). 'last-ship': ship 5, the last
//   line of its boot (`> last ship, 047. i'm so tired.`, WP11). 'none': nothing beyond its echoes.
export type HollowWake = 'loop-closed-once' | { afterAiSec: number; coastLeadSec: number | null };
export type SeedTarget = 'walls' | 'near-tools';
export type HollowStoryKind = 'notices-you' | 'names-itself' | 'wants-charge' | 'last-ship' | 'none';

export interface VerbDef {
  everySec: number;
  telegraphSec: number;
  firstTelegraphSec: number;
  duelEverySec: number;
}

export interface SeedDef {
  everySec: number;
  firstAfterSec: number;
  target: SeedTarget;
}

export interface HollowDef {
  wake: HollowWake;
  spreadEverySec: number | null;
  drainPerSec: number;
  burnMult: number;
  landMult: number;
  seed: SeedDef | null;
  verbs: VerbDef | null;
  deal: boolean;
  story: HollowStoryKind;
}

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
  hollow: HollowDef;
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
  // 01-landing §2 (plan §2): three pods in rack B with the root first, so the scripted bite takes POD 01 OKAFOR (Ada's
  // family; rack A's 18 trailing free blocks are a WALL on the root's left). POD 02 BRANDT arrives at 44% (it would land
  // hard: the coast's one REPAIR). This keeps the phase-2 HOLLOW instead of §3.16's calm COMPACT row (risk 3).
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'R P P P _32', C: '_64', D: '_64' },
    aiFiles: { E: FRESH_UNIT_RACK_E, F: FRESH_UNIT_RACK_F },
    drivers: {
      familiesSeedStream: 'families',
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
  // §4.2 ship 1: no spread. It waits until you brake: the first time the loop closes it bites POD 01
  // (Ada's family, right next to the root) and eats 2%/s, 4%/s while the engine fires, so the
  // capture burn costs Ada's family's driver about a third and the fight comes after the lock. After that one
  // fight it goes quiet for this ship (`> ...047?`).
  hollow: {
    wake: 'loop-closed-once',
    spreadEverySec: null,
    drainPerSec: 2,
    burnMult: 2,
    landMult: 1,
    seed: null,
    verbs: null,
    deal: false,
    story: 'notices-you',
  },
};

// Ship 2: steer IN (§4.2, §5.1 2:20). The path arrives far too wide (▼ at 14,000 km, the ring is
// 5,000–7,500): a dashed FLYBY that passes outside the ring, `TOO WIDE — hold [SPACE]` with IN already
// engaged. About 5 s of IN pulls ▼ into the ring, then the long coast (≈166 s at CRUISE without SKIP)
// is the hacking phase: MOVE arrives as the coast begins and HOLLOW wakes 5 s later and names itself (at
// the latest 25 s and 30 s into the flight; measured: the coast at 5.8 s, the wake at 10.8 s). The ring is
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
  arrival: { linkBlocks: 120, transitHits: 3, distanceLy: 22, damage: [] },
  zones: [],
  // MOVE as the coast begins (at the latest 25 s in), HOLLOW 5 s after it (at the latest 30 s in: §4.2's
  // boot + 25 / + 30): the licence chime, CONTROL's line, then the bite, with the coast still ahead.
  licences: [{ kind: 'move', afterAiSec: 25, atCoast: true, atFirstSeed: false, atFirstGhost: false }],
  flagship: false,
  // Five pods (plan §2): the root sits in rack C between POD 04 (a 2-block GAP) and POD 05 (a 1-block GAP), so HOLLOW
  // bites both at its wake, as it bit C08 and C09; rack D is empty: the room to MOVE them behind a WALL. The families
  // are seeded; POD 05, right of the root, leads the credits. Nobody arrives hurt: HOLLOW is the whole fight here.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P _40', C: 'P _2 R _1 P _37', D: '_64' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
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
  // §4.2 HALCYON: it wakes 5 AI s after the coast begins (at the latest 30 s into the flight) and bites at
  // once, then every 25 s; 3.5 %/s, twice
  // that while the engine burns, ×1.5 while a window is open with a pod to launch (it gets desperate as its food
  // leaves). A repair still wins: heal(8) 18.5 %/s against at most 7 %/s.
  hollow: {
    wake: { afterAiSec: 30, coastLeadSec: 5 },
    spreadEverySec: 25,
    drainPerSec: 3.5,
    burnMult: 2,
    landMult: 1.5,
    seed: null,
    verbs: null,
    deal: false,
    story: 'names-itself',
  },
};

// Ship 3: flying blind, debris ahead (§4.2, §5.1 4:40, §9 WP9). The path arrives too wide (▼ at 9,000 km,
// ring 5,000–7,000) and runs straight through a debris cloud (900 km across, on the arrival path at
// 14,000 km, about 225 tactical s in) that names the rack it will hit. The unit arrives with Sensor Interp at
// 45% (PATH UNCERTAIN: a grey band and `HIT?`), so the first move is a REPAIR; then an early IN correction
// pulls ▼ into the ring and, because it is early, off the cloud (the design's probe: started by 80 tac s it
// clears it by 160+ km; WP9 review round 1: held through the sweet zone as the strip asks, it still dodges from
// up to about 152 tac s in, judged with both Core threads busy (LEAD-2), and the strip counts that down). FUEL 2.1 km/s for a 1.56–1.67 need.
// HOLLOW bites every 20 s at 4 %/s (heal 18.5 %/s still beats 1.5 × its worst 8), and drops a 2-block seed
// into your walls every 50 s: DELETE arrives with the first one.
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
  // §6.5: DELETE at KESTREL's first seed (its telegraph): the tool arrives with the thing it removes.
  licences: [{ kind: 'delete', afterAiSec: null, atCoast: false, atFirstSeed: true, atFirstGhost: false }],
  flagship: false,
  // §4.2 KESTREL, with drivers in the clusters' places (plan §2: the DEAL, the seeds and the debris on rack C keep their
  // geometry): twelve pods; the root sits in rack C between POD 09 (a 1-block GAP) and POD 10 (a 2-block GAP), so its
  // wake bites both; rack D is empty (room to MOVE them behind a WALL, and out of the debris's rack). POD 10, right of
  // the root, leads the credits. Nobody arrives hurt: the debris is what can hurt them.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P _16', C: 'P P P _1 R _2 P P P _5', D: '_64' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
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
  // §4.2 KESTREL: it wakes like HALCYON's, 5 AI s into the coast, and bites at once, then every 20 s at 4 %/s; the
  // first seed 30 s after the wake (between the second and third bites; SKIP waits for it, pace.ts, and its clock stands
  // still while the flight is at TACTICAL, so it never lands under a burn's lines, systems/hollow.ts), then one every
  // 50 s, aimed at the walls you built. HOLLOW already said who it is on HALCYON: on this ship its one new line is
  // the first seed's (`> sorry. i'm so hungry.`, systems/hollow.ts).
  // It never wakes inside the debris dodge's window (the lead's ruling for WP9 fix round 1): the IN correction
  // dodges the cloud until about 152 tactical s in (judged with both Core threads busy, LEAD-2), and a wake inside
  // that window buried TOO WIDE's countdown under HOLLOW's lines for a kid who repaired the sensor late. Since review
  // round 2 that is an explicit rule (systems/hollow.ts: a timed wake waits while the dodge is open, and
  // WAKE_AFTER_DODGE_SEC after it closes), so it holds at any pace (the window's TACTICAL end, OVERCLOCK in blue, a
  // kid tapping the engine). The 60 s cap is round 1's: at CRUISE the window closes at about 55 AI s, so the hold,
  // not the cap, sets a never-corrector's wake.
  hollow: {
    wake: { afterAiSec: 60, coastLeadSec: 5 },
    spreadEverySec: 20,
    drainPerSec: 4,
    burnMult: 2,
    landMult: 1.5,
    seed: { everySec: 50, firstAfterSec: 30, target: 'walls' },
    verbs: null,
    deal: false,
    story: 'none',
  },
};

// Ship 4: the engine fires by itself (§4.2, §5.3 moment 11, §9 WP10). The path arrives already in the ring (▼ at
// 5,600 km, ring 5,000–7,000) with RETRO engaged, so the flight opens on a WAIT for the capture at ▼ (a coast of about
// 114 s at CRUISE). But the ship's own Thrust Ctrl arrives at 31% (failing, hidden until scanned): the engine fires by
// itself along RETRO at a failing controller's rate and strength (GHOST_BY_BAND in tuning.ts, WP12's tuning: about
// every 10 tactical s for 1 tac s at 30% thrust), and each burst drags ▼ about 120 km down, 1,500–4,500 km over the
// coast: a kid who never SWAPs loses VESPER (STRANDED, or FLEW AWAY on an empty tank), while one who follows the pip
// lesson after the second burst locks it. FUEL 1.8 km/s for a 1.32 need plus the drift fixes. The first burst is the
// alarm (UNCOMMANDED THRUST, SWAP is licensed with it), and the cure is a file: SWAP to Thrust.alt.
// HOLLOW bites every 16 s at 4 %/s (heal 18.5 %/s beats 1.5 × its worst 8), drops a 2-block seed next to your tools
// every 40 s (COPY your Repair: it arrives at the boot), and once offers THE DEAL.
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
  // §4.2 VESPER, with drivers in the clusters' places: twelve pods; the root sits in rack C between POD 08 (a 1-block
  // GAP) and POD 09 (a 3-block GAP), so its wake bites both, and both stand at its front (THE DEAL names the nearer).
  // Rack D is empty: room to MOVE them behind a WALL. POD 09, right of the root, leads the credits. Nobody arrives hurt.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P _16', C: 'P P _1 R _3 P P P P _4', D: '_64' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
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
  // §4.2 VESPER: it wakes 30 AI s into the coast (which begins at the flight's start: the path arrives in the ring), so
  // the engine firing by itself is the ship's first lesson and HOLLOW its second, then bites every 16 s at 4 %/s, ×2
  // while the engine burns (ghost bursts included: P1), ×1.5 while the landing is active. Its first seed 25 s after the wake (after
  // THE DEAL's 15 s), then one every 40 s, next to your filesystem tools; its first seed waits for a calm flight like
  // every ship's (systems/hollow.ts).
  hollow: {
    wake: { afterAiSec: 45, coastLeadSec: 30 },
    spreadEverySec: 16,
    drainPerSec: 4,
    burnMult: 2,
    landMult: 1.5,
    seed: { everySec: 40, firstAfterSec: 25, target: 'near-tools' },
    verbs: null,
    deal: true,
    story: 'wants-charge',
  },
};

// Ship 5: LAST LIGHT, the flagship, the climax (§4.2, §9 WP11). It opens like ship 1, on a crash course (▼ at 3,200
// km is underground: IMPACT about 03:04 at ×30) with OUT engaged, so the first lesson of the game is the first thing it
// asks again; then the coast crosses a radiation belt (9,000–12,000 km, about 0:36 inside at TACTICAL) that peppers
// racks A–B (§6.8: −8 to a random file in them about every 200 game s, ≈5 hits): the ship's files and rack B's seven
// drivers, so the kid moves drivers out of rack B before it, or REPAIRs them after. FUEL 2.5 km/s for a 1.76 need.
// HOLLOW is at its worst: the root is 16 blocks in rack C between POD 11 and POD 12 (GAPs of 2 and 1), it bites
// every 12 s at 5 %/s (heal 18.5 %/s still beats 1.5 × its worst 10), drops a seed into your walls every 35 s, and
// uses your own verbs (MV, RM) every 12 s of calm. Its ORBIT LOCK opens the root for the duel.
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
  // §6.9: link 96 blocks, 6 transit hits (the longest crossing), the last 36 LY of the route.
  arrival: { linkBlocks: 96, transitHits: 6, distanceLy: 36, damage: [] },
  // §9 WP11 item 1: the belt (WP9's belt kind) hits racks A–B.
  zones: [{ kind: 'belt', id: 'last-light-belt', rIn: 9000, rOut: 12000, racks: ['A', 'B'] }],
  // Every tool is licensed by now (a licence a lost ship never issued comes at this ship's start: licences.ts).
  licences: [],
  flagship: true,
  // 01-landing §3.16's final-ship layout (plan §2, risk 4: it moves the boss geometry, so boss-sim is re-measured):
  // sixteen pods, seven in rack B (the belt hits A–B), the 16-block root in rack C between POD 11 (a 2-block GAP) and
  // POD 12 (a 1-block GAP, bitten first), and four in rack D with its last 32 blocks free. POD 12 leads the credits.
  memory: {
    rackA: RACK_A,
    podRacks: { B: 'P P P P P P P _8', C: 'P P P P _2 R16 _1 P _5', D: 'P P P P _32' },
    aiFiles: null,
    drivers: {
      familiesSeedStream: 'families',
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
  // §4.2 LAST LIGHT: it wakes like HALCYON's, 5 AI s into the coast (at the latest 30 s into the flight), bites the two
  // drivers beside the root at once, then every 12 s at 5 %/s, ×2 while the engine burns, ×1.5 while the landing is active. Seeds every 35 s into your
  // walls (the first 20 s after the wake, and like every ship's first seed only on a calm flight); a verb every 12 s of
  // calm, counted down 3 s (§6.6; the first one 4 s: tuning.ts), every 4 s while the root's DELETE runs. Its boot closes
  // on HOLLOW's own line.
  hollow: {
    wake: { afterAiSec: 30, coastLeadSec: 5 },
    spreadEverySec: 12,
    drainPerSec: 5,
    burnMult: 2,
    landMult: 1.5,
    seed: { everySec: 35, firstAfterSec: 20, target: 'walls' },
    verbs: { everySec: 12, telegraphSec: VERB_TELEGRAPH_SEC, firstTelegraphSec: VERB_FIRST_TELEGRAPH_SEC, duelEverySec: 4 },
    deal: false,
    story: 'last-ship',
  },
};

// Throws on a HOLLOW whose numbers break the design's promise (§6.6): a repair started before a file
// hits zero always wins, so the heal on an 8-block driver must beat the fastest drain by
// HEAL_BEATS_DRAIN_FACTOR. Losses then come from reach, threads and charge, never from a started
// repair being outrun. Exported for tests and for later ships' configs.
export function validateHollowDef(id: string, hollow: HollowDef): void {
  const fail = (why: string): never => { throw new Error(`ShipDef ${id} hollow: ${why}`); };
  if (!(hollow.drainPerSec > 0)) fail(`drainPerSec must be positive (got ${hollow.drainPerSec})`);
  if (!(hollow.burnMult >= 1)) fail(`burnMult must be at least 1 (got ${hollow.burnMult})`);
  if (!(hollow.landMult >= 1)) fail(`landMult must be at least 1 (got ${hollow.landMult})`);
  if (hollow.spreadEverySec !== null && !(hollow.spreadEverySec > 0)) fail(`spreadEverySec must be positive or null (got ${hollow.spreadEverySec})`);
  if (typeof hollow.wake !== 'string' && !(hollow.wake.afterAiSec >= 0)) fail(`wake.afterAiSec must be ≥ 0 (got ${hollow.wake.afterAiSec})`);
  if (typeof hollow.wake !== 'string' && hollow.wake.coastLeadSec !== null && !(hollow.wake.coastLeadSec >= 0)) {
    fail(`wake.coastLeadSec must be ≥ 0 or null (got ${hollow.wake.coastLeadSec})`);
  }
  const heal = repairRatePerSec(DRIVER_BLOCKS, 1);
  // The larger multiplier applies (01-landing §5), never their product: the worst drain is the larger of the two.
  const worstDrain = hollow.drainPerSec * Math.max(hollow.burnMult, hollow.landMult);
  if (!(heal > HEAL_BEATS_DRAIN_FACTOR * worstDrain)) {
    fail(`a repair heals ${heal.toFixed(1)}%/s, which must beat ${HEAL_BEATS_DRAIN_FACTOR} × the worst drain (${worstDrain}%/s)`);
  }
  if (hollow.story === 'notices-you' && hollow.wake !== 'loop-closed-once') fail('the "notices you" story follows the scripted first fight (loop-closed-once)');
  if (hollow.story === 'names-itself' && hollow.wake === 'loop-closed-once') fail('the "names itself" story is told at a timed wake');
  if (hollow.seed !== null) {
    const { everySec, firstAfterSec } = hollow.seed;
    if (!(everySec > 0)) fail(`seed.everySec must be positive (got ${everySec})`);
    if (!(firstAfterSec >= 0)) fail(`seed.firstAfterSec must be ≥ 0 (got ${firstAfterSec})`);
    // A seed grows by the bite rule: on a HOLLOW that never bites it would be a black block that does nothing.
    if (hollow.spreadEverySec === null) fail('seeds need a HOLLOW that spreads (spreadEverySec)');
    if (hollow.wake === 'loop-closed-once') fail('seeds need a timed wake');
  }
  if (hollow.verbs !== null) {
    const { everySec, telegraphSec, firstTelegraphSec, duelEverySec } = hollow.verbs;
    if (!(telegraphSec > 0)) fail(`verbs.telegraphSec must be positive (got ${telegraphSec})`);
    // The first verb is the lesson: never shorter than the drill after it.
    if (!(firstTelegraphSec >= telegraphSec)) fail(`verbs.firstTelegraphSec (${firstTelegraphSec}) must be at least telegraphSec (${telegraphSec})`);
    // A verb's countdown must end before the next one starts: one telegraph at a time, and a gap to breathe in. On the
    // coast that holds for the longer first one too; in the duel its extra seconds push the next verb back instead
    // (systems/hollow-verbs.ts), so the duel's clock only has to outlast the drill.
    if (!(everySec > firstTelegraphSec)) fail(`verbs.everySec (${everySec}) must be longer than firstTelegraphSec (${firstTelegraphSec})`);
    if (!(duelEverySec > telegraphSec)) fail(`verbs.duelEverySec (${duelEverySec}) must be longer than telegraphSec (${telegraphSec})`);
    if (hollow.spreadEverySec === null || hollow.wake === 'loop-closed-once') fail('verbs need a HOLLOW that spreads, with a timed wake');
  }
  // THE DEAL trades a pod's driver for a pause in the spread: a HOLLOW that never spreads would offer nothing.
  if (hollow.deal && hollow.spreadEverySec === null) fail('THE DEAL needs a HOLLOW that spreads (spreadEverySec)');
  if (hollow.deal && hollow.wake === 'loop-closed-once') fail('THE DEAL needs a timed wake');
}

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
    if (licence.atFirstSeed && ship.hollow.seed === null) fail(`licence ${licence.kind} waits for a seed on a ship whose HOLLOW drops none`);
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
  for (const firstRun of [true, false]) {
    const memory = buildShipMemory(ship, ship.memory.aiFiles ? null : emptyUnit, createRng(0), firstRun, UNNAMED_HOLLOW);
    const drivers = memory.filter((seg) => seg.type === 'driver').length;
    // The LANDING REPORT never repeats a hard-landing line on one ship.
    if (drivers > HARD_WORDS_POOL.length) fail(`${drivers} pods, but only ${HARD_WORDS_POOL.length} hard-landing lines`);
    // Every ship has HOLLOW (§4.2): its layout must hold the root it grows from; the flagship's finale deletes one root,
    // so its layout must hold exactly one (counted in the memory just built, not by re-reading the layout's tokens).
    const roots = memory.filter((seg) => seg.type === 'hollow' && seg.root).length;
    if (roots === 0) fail('the rack layout has no HOLLOW root (an R token)');
    if (ship.flagship && roots !== 1) fail(`the flagship's finale deletes one root: its layout holds ${roots}`);
  }
  validateHollowDef(ship.id, ship.hollow);
  // The finale is the flagship's (§9 WP11): its verbs, its duel. A verb-wielding HOLLOW anywhere else would fight a duel
  // that never comes; a flagship whose HOLLOW has none would make the climax a bite like any other.
  if (ship.flagship !== (ship.hollow.verbs !== null)) fail('HOLLOW uses its verbs on the flagship, and only there');
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
