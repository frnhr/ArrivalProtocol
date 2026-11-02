import type { ShipDef } from '@data/ships';
import type { ShipThreatDef, BeamSeedSource } from '@/types/threat';
import type { TimedLicence } from '@systems/licences';
import { validateShipDef } from '@data/ships';
import { FLIGHT_TEMPLATES } from '@data/flight-templates';
import { RACK_A, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, rootSlotRack } from '@data/memory';
import { ARES_RUN1_FAMILIES, ADA } from '@data/souls';
import { WORLDS } from '@data/arm';
import { CLASSIC_WORLD_SLOTS, CLASSIC_FINAL_INDEX } from '@data/classic-slots';

export { CLASSIC_WORLD_SLOTS, CLASSIC_FINAL_INDEX } from '@data/classic-slots';

// THE CLASSIC FIVE: a frozen fixture (slice-3a-plan §2.3). Lead only: no track edits this file.
// Phase 2's five hand-written ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT) exactly as they were before the
// galaxy map, with their links, hits, threat facts and licences, as the 'classic' world (RunMapState.world): one route,
// slot = index, the rng keys `(seed, index, stream)` unchanged. The headless suites and `__ap.ship(n)` fly it, so their
// numbers do not move; no game run ever routes through it otherwise. VESPER → LAST LIGHT is 83 LY on the real arm, so
// this route cannot exist there: the arm's own HALCYON, KESTREL, VESPER and LAST LIGHT are placed by data/run1-arm.ts
// with run 1's sizes. Risk 15: retired after slice 4, once the suites fly arm fixtures.
// Their flight blocks live in data/flight-templates.ts (they ARE the templates); everything else is here.

// Ship 1: the tutorial crash course. rp0 3,000 is underground, so the page opens on a red
// line and IMPACT 02:43 (3,265 game s at x20). OUT for about 8 tactical s lifts ▼ into the
// sweet zone, and the capture at ▼ costs about 1.0 of the 2.8 km/s budget, leaving ~36%
// FUEL for mistakes (the design's ship-1 probe, docs/design-v2.md).
const ARES_VII: ShipDef = {
  id: 'ares-vii',
  name: 'ARES-VII',
  world: 'Kepler-186f',
  slot: 0,
  kind: 'first',
  template: 'impact-a',
  modifiers: [],
  memoryClass: 'FULL',
  pods: 3,
  approachYear: null,
  ...FLIGHT_TEMPLATES['impact-a'],
  arrivalDamage: [],
  zones: [],
  final: false,
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
  slot: 1,
  kind: 'standard',
  template: 'wide',
  modifiers: [],
  memoryClass: 'FULL',
  pods: 5,
  approachYear: null,
  ...FLIGHT_TEMPLATES['wide'],
  arrivalDamage: [{ role: 'sensor', maxIntegrity: 62 }],
  zones: [],
  final: false,
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
  slot: 2,
  kind: 'standard',
  template: 'wide-b',
  modifiers: ['sensor-damage', 'debris'],
  memoryClass: 'FULL',
  pods: 12,
  approachYear: null,
  ...FLIGHT_TEMPLATES['wide-b'],
  arrivalDamage: [{ role: 'sensor', maxIntegrity: 45 }],
  // §4.2: rack C on the written run (the story's C07–C12), rack B or C (seeded) on a later one.
  zones: [{ kind: 'debris', id: 'kestrel-debris', centre: { onInboundAtR: 14000 }, r: 900, rack: 'C', laterRacks: ['B', 'C'] }],
  final: false,
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
  slot: 3,
  kind: 'standard',
  template: 'capture',
  modifiers: ['engine-fault'],
  memoryClass: 'FULL',
  pods: 12,
  approachYear: null,
  ...FLIGHT_TEMPLATES['capture'],
  arrivalDamage: [{ role: 'thrust-ctrl', maxIntegrity: 31 }],
  zones: [],
  final: false,
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
  slot: 4,
  kind: 'final',
  template: 'impact-b',
  modifiers: ['radiation-belt'],
  memoryClass: 'FULL',
  pods: 16,
  approachYear: null,
  ...FLIGHT_TEMPLATES['impact-b'],
  arrivalDamage: [],
  // §9 WP11 item 1: the belt (WP9's belt kind) hits racks A–B.
  zones: [{ kind: 'belt', id: 'last-light-belt', rIn: 9000, rOut: 12000, racks: ['A', 'B'] }],
  final: true,
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
};

export const CLASSIC_FIVE: readonly ShipDef[] = [ARES_VII, HALCYON, KESTREL, VESPER, LAST_LIGHT];

// Classic ship `index` (the suites' getShip): throws on an index the five do not have.
export function classicShip(index: number): ShipDef {
  const ship = CLASSIC_FIVE[index];
  if (!ship) throw new Error(`classicShip: no classic ship ${index} (have ${CLASSIC_FIVE.length})`);
  return ship;
}

// How the unit gets to each classic ship (§6.9; phase 2's ShipDef.arrival): the link's bandwidth in blocks (the files plus
// the charge that fit), the seeded transit hits the crossing deals, and the distance the TRANSMIT screen names. null on
// ship 1: the unit arrives there fresh from ARRIVAL CONTROL. The classic world's hops are these (systems/map-hop.ts
// hopBetween), with no ECC (no years, no slack), so the suites' hits are phase 2's.
export interface ClassicHop {
  linkBlocks: number;
  transitHits: number;
  distanceLy: number;
}

export const CLASSIC_HOPS: readonly (ClassicHop | null)[] = [
  null, // ARES-VII
  // §6.9's link and hits; then the ship's own scripted arrival damage (slice-2-plan risk 10): Sensor Interp to at most 62,
  // so ship 2's lesson (a degraded sensor widens the dot, and LZ-B's STANDARD bracket shows it) never hangs on a seeded
  // transit hit missing it.
  { linkBlocks: 120, transitHits: 3, distanceLy: 22 }, // HALCYON
  // §4.2/§6.9: link 112 blocks, 4 transit hits; then KESTREL's own arrival damage (Sensor Interp to at most 45).
  { linkBlocks: 112, transitHits: 4, distanceLy: 27 }, // KESTREL
  // §4.2/§6.9: link 104 blocks, 5 transit hits; then the ship's own Thrust Ctrl, built at 31% (rack A is the ship's).
  { linkBlocks: 104, transitHits: 5, distanceLy: 31 }, // VESPER
  // §6.9: 6 transit hits (the longest crossing), the last 36 LY of the route. Link 98 blocks, not phase 2's 96 (slice 2,
  // Track OPENING's re-fly): 046.log rides in every packet (2 locked blocks, 05 §3.2), and on the last crossing the link,
  // not the charge, is what limits the charge that arrives (its files are 82–84 blocks by then), so the log cost MERGE's 20 at the choice
  // in most runs (wp11/full-run, RUN_SEEDS=8: 3 of 8 before). The 2 blocks are given back here; the log stays paid
  // everywhere else.
  { linkBlocks: 98, transitHits: 6, distanceLy: 36 }, // LAST LIGHT
];

// What the map supplies about the beam into each classic ship (04 §3.4, §3.8; phase 2's ShipDef.threat): the seeds it
// carries and whether a final ship is one hop from it (the stand-in for 02-map M3: VESPER). The classic world's map facts
// (systems/threat-plan.ts fixedShipFacts) read these; the arm's come from systems/map-facts.ts.
export const CLASSIC_FACTS: readonly ShipThreatDef[] = [
  { beamSeeds: { kind: 'none' }, oneHopFromFinal: false }, // ARES-VII
  { beamSeeds: { kind: 'none' }, oneHopFromFinal: false }, // HALCYON
  { beamSeeds: { kind: 'scripted', firstRun: [{ role: 'telemetry' }], later: 2 }, oneHopFromFinal: false }, // KESTREL
  { beamSeeds: { kind: 'noise', noise: 0 }, oneHopFromFinal: true }, // VESPER
  { beamSeeds: { kind: 'noise', noise: 0 }, oneHopFromFinal: false }, // LAST LIGHT
];

// Each classic ship's own timed licences (§6.5, slice-2-plan §3.2; phase 2's ShipDef.licences): see systems/licences.ts
// TimedLicence. The arm has none of these: there every tool but REPAIR comes from the repository, by request (slice 3b,
// 02 §3.8; 3a's interim licences by act are gone).
export const CLASSIC_LICENCES: readonly (readonly TimedLicence[])[] = [
  // REPAIR is licensed by its own rule (systems/licences.ts: the first look inside, or the first line
  // that needs it), on whichever ship that happens.
  [], // ARES-VII
  // No licence (slice-2-plan §3.2): with no HOLLOW here MOVE would have no job until KESTREL's debris, so it moved there
  // ("the tool arrives for the fight it is for", WP7).
  [], // HALCYON
  // Slice-2-plan §3.2: DELETE at the flight's first tick (the beam seeds are already in memory by then: the tool arrives
  // with the thing it removes), MOVE as the coast begins (its first job is the debris lesson, `DEBRIS HITS RACK C`, so it
  // is known before VESPER's walls).
  [
    { kind: 'delete', afterAiSec: 0, atCoast: false, atFirstSeed: false, atFirstGhost: false },
    { kind: 'move', afterAiSec: null, atCoast: true, atFirstSeed: false, atFirstGhost: false },
  ], // KESTREL
  // §6.5: COPY at the boot (the flight's first moment: the tool is there before the seeds come for your tools), SWAP at
  // the first uncommanded burst (the fix arrives with the problem).
  [
    { kind: 'copy', afterAiSec: 0, atCoast: false, atFirstSeed: false, atFirstGhost: false },
    { kind: 'swap', afterAiSec: null, atCoast: false, atFirstSeed: false, atFirstGhost: true },
  ], // VESPER
  // Every tool is licensed by now (a licence a lost ship never issued comes at this ship's start: licences.ts).
  [], // LAST LIGHT
];

// Does the beam into this classic ship bring seeds (a licence that waits for one needs it)?
function beamBringsSeeds(seeds: BeamSeedSource): boolean {
  if (seeds.kind === 'none') return false;
  if (seeds.kind === 'noise') return seeds.noise > 0;
  return true;
}

// The classic world's own rules, at load (phase 2's validateFleet and the parts of validateShipDef that read the hop,
// the threat facts or the licences, which a ShipDef no longer holds).
function validateClassicFive(): void {
  CLASSIC_FIVE.forEach(validateShipDef);
  const n = CLASSIC_FIVE.length;
  const lists = [CLASSIC_HOPS, CLASSIC_FACTS, CLASSIC_LICENCES, CLASSIC_WORLD_SLOTS];
  if (lists.some((list) => list.length !== n)) {
    throw new Error('classic five: the hops, facts and licences must list one entry per ship');
  }
  CLASSIC_FIVE.forEach((ship, index) => {
    const fail = (why: string): never => { throw new Error(`classic ship ${ship.id}: ${why}`); };
    if (ship.slot !== index) fail(`slot ${ship.slot} at index ${index} (the classic world's slot is its index)`);
    if (ship.final !== (index === n - 1) || ship.final !== (index === CLASSIC_FINAL_INDEX)) fail('the final ship is the last, and only it');
    const worldSlot = CLASSIC_WORLD_SLOTS[index];
    if (worldSlot === undefined || WORLDS[worldSlot]?.name !== ship.world) fail(`sits on ${ship.world}, not on w${worldSlot}`);
    const hop = CLASSIC_HOPS[index];
    if ((hop === null) !== (ship.kind === 'first')) fail('a ship meets a fresh unit exactly when nothing arrives by transmission');
    if (hop) {
      if (!(Number.isInteger(hop.linkBlocks) && hop.linkBlocks > 0)) fail(`link ${hop.linkBlocks} must be a positive integer`);
      if (!(Number.isInteger(hop.transitHits) && hop.transitHits >= 0)) fail(`transit hits ${hop.transitHits} must be a whole number`);
      if (!(Number.isInteger(hop.distanceLy) && hop.distanceLy > 0)) fail(`distance ${hop.distanceLy} must be a positive whole LY`);
    }
    const facts = CLASSIC_FACTS[index]!;
    // A ship one hop from a final ship is where HOLLOW is forced aboard (04 §3.8): its root needs a slot.
    if (facts.oneHopFromFinal && rootSlotRack(ship) === null) fail('HOLLOW boards here (one hop from the final ship), but the layout has no root slot');
    if (facts.beamSeeds.kind === 'scripted' && facts.beamSeeds.firstRun.length === 0) fail('a scripted beam seed source with no first-run seed (use { kind: \'none\' })');
    for (const licence of CLASSIC_LICENCES[index]!) {
      if (licence.afterAiSec !== null && !(licence.afterAiSec >= 0)) fail(`licence ${licence.kind} afterAiSec must be ≥ 0 (got ${licence.afterAiSec})`);
      // A licence that waits for a seed needs a ship whose beam brings seeds, or another moment that issues it.
      const otherMoment = licence.afterAiSec !== null || licence.atCoast || licence.atFirstGhost;
      if (licence.atFirstSeed && !beamBringsSeeds(facts.beamSeeds) && !otherMoment) fail(`licence ${licence.kind} waits for a seed on a ship whose beam brings none`);
      if (licence.afterAiSec === null && !licence.atCoast && !licence.atFirstSeed && !licence.atFirstGhost) fail(`licence ${licence.kind} has no moment that issues it`);
    }
  });
}

validateClassicFive();
