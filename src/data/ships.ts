import type { PlanetParams, Ring } from '@/types/orbit';
import type { PresetMode } from '@state/schema';
import type { SegmentRole } from '@/types/segment';
import type { ZoneDef } from '@/types/zone';
import type { ShipLandingDef } from '@/types/landing';
import type { ShipKind, TemplateId, ModifierId, MemoryClass } from '@/types/map';
import { NAME_MAX_CHARS, INTEGRITY_MAX, ROOT_SLOT_FROM_LAYER } from '@data/tuning';
import { validateLandingDef } from '@data/landing-def';
import { validateZoneDefs } from '@systems/zones';
import {
  buildShipMemory, validatePodRacks, rootSlotRack, maxRootFor, layoutFor, shipPodCount, type ShipMemoryDef,
} from '@data/memory';
import { freeSegment } from '@systems/memory-ops';
import { createRng } from '@systems/rng';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { HOLLOW_STAGES } from '@data/threats';
import { HARD_WORDS_POOL } from '@data/souls';
import { hurtDriversFor, rootSlotNeighbours } from '@data/driver-damage';

// The runtime ship (phase 3 slice 3a, slice-3a-plan §2.2): everything one ship's world is built from (state/initial.ts
// createShipSlices, data/memory.ts buildShipMemory, systems/carry.ts layoutCarried, the landing slice). It is never
// stored and never hand-written outside data/classic-five.ts (the frozen five, the suites' fixture world): a ship of the
// arm is built from its ArmShip by shipDefOf (Track GEN: the template's flight block, omega0 replaced, the modifiers as
// zones and arrival damage, the landing, the class and the pods). What a ship does NOT hold: how the unit gets there (the
// link, the hits, the distance: the map's Hop, systems/map-hop.ts), the threat facts of the beam into it (systems/
// map-facts.ts; the classic world's CLASSIC_FACTS) and the licences (systems/licences.ts; CLASSIC_LICENCES).
// Units: km, km/s, km/s², μ in km³/s²; radii from the planet centre. Global rules live in tuning.ts.

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

// Damage on arrival (§6.9: KESTREL's Sensor Interp to at most 45%, VESPER's Thrust Ctrl at 31%; on the arm, the SENSOR
// DAMAGE and ENGINE FAULT modifiers). A role the
// unit carries (Sensor Interp) is cut after the transit hits and named on the boot's own ECC line (systems/carry.ts);
// a role in rack A is the ship's own file ("rack A belongs to the ship", §6.9), built damaged with the ship's memory
// (data/memory.ts) and, like every ship file, hidden until scanned (§3.2): the boot does not name it, the `?` pip
// and the engine firing by itself do (WP10).
export interface ArrivalDamage {
  role: SegmentRole;
  maxIntegrity: number;
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
  // Where the ship sits (02-map §3.2): its arm slot (the classic five: their index), its layer (01-landing §3.15's table:
  // it sets the rolled driver arrival damage, data/driver-damage.ts; the classic five carry the run-1 route's 1, 2, 3, 5,
  // 8), and its approach year (null on the classic world, which has no years).
  slot: number;
  layer: number;
  approachYear: number | null;
  // What the ship is (02-map §3.4–§3.5): its kind, the flight template it flies, the modifiers on top, its memory class
  // and its pods (the drivers in the pod racks and the LZ counts both sum to it).
  kind: ShipKind;
  template: TemplateId;
  modifiers: readonly ModifierId[];
  memoryClass: MemoryClass;
  pods: number;
  // The final ship (02-map §3.6: a ship in an end slot; the classic five's LAST LIGHT). Losing it ends the run (FINAL
  // SHIP LOST, §4.3); its ORBIT LOCK opens the root duel and its finale (PURGE or MERGE) ends the run.
  final: boolean;
  flight: ShipFlightDef;
  shrink: ShrinkTuning;
  // The ship's own damage to the arriving unit and its rack-A files (§6.9), whatever hop brought the unit.
  arrivalDamage: readonly ArrivalDamage[];
  // Hazard zones on this ship's way in (§6.8, WP9: KESTREL's debris cloud; LAST LIGHT's belt in WP11).
  zones: readonly ZoneDef[];
  memory: ShipMemoryDef;
  // Where and how this ship's pods land (01-landing §3.5–§3.6): the LZs, the planet's forgiveness and terrain, its no-go
  // arcs, the run-1 colony name, drag. Copied into state.landing when the ship is built (never re-read at runtime), and
  // checked by validateLandingDef, which slice 3's roller reuses.
  landing: ShipLandingDef;
}

// The modifier each zone kind and arrival-damage role is the visible form of (02-map §3.5): a ship that has the effect
// names the modifier, and a named modifier has its effect, so the card's KNOWN PROBLEMS row never disagrees with the
// flight. SENSOR DAMAGE is a sensor rule (HALCYON's authored 62 has the rule without the label: its lesson, not a
// problem the card warns about).
function checkModifiers(ship: ShipDef, fail: (why: string) => never): void {
  const has = (modifier: ModifierId): boolean => ship.modifiers.includes(modifier);
  if (new Set(ship.modifiers).size !== ship.modifiers.length) fail(`a modifier is listed twice (${ship.modifiers.join(', ')})`);
  const debris = ship.zones.some((zone) => zone.kind === 'debris');
  const belt = ship.zones.some((zone) => zone.kind === 'belt');
  const fault = ship.arrivalDamage.some((rule) => rule.role === 'thrust-ctrl');
  const sensor = ship.arrivalDamage.some((rule) => rule.role === 'sensor');
  if (has('debris') !== debris) fail(`DEBRIS ${has('debris') ? 'named with no debris zone' : 'zone with no DEBRIS modifier'}`);
  if (has('radiation-belt') !== belt) fail(`RADIATION BELT ${has('radiation-belt') ? 'named with no belt zone' : 'zone with no RADIATION BELT modifier'}`);
  if (has('engine-fault') !== fault) fail(`ENGINE FAULT ${has('engine-fault') ? 'named with no Thrust Ctrl damage' : 'damage with no ENGINE FAULT modifier'}`);
  if (has('sensor-damage') && !sensor) fail('SENSOR DAMAGE named with no Sensor Interp damage');
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
  if (!(Number.isInteger(ship.slot) && ship.slot >= 0)) fail(`slot must be a whole number ≥ 0 (got ${ship.slot})`);
  if (ship.approachYear !== null && !Number.isInteger(ship.approachYear)) fail(`approachYear must be a whole year (got ${ship.approachYear})`);
  if ((ship.kind === 'first') !== (ship.memory.aiFiles !== null)) fail('a ship meets a fresh unit (written racks E–F) exactly when it is a first ship (nothing arrives by transmission)');
  if ((ship.kind === 'final') !== ship.final) fail(`kind '${ship.kind}' with final ${ship.final}: the final ship is the 'final' kind`);
  checkModifiers(ship, fail);
  const layout = layoutFor(ship.memoryClass);
  // The ship's own arrival damage on a rack-A file must leave the file hurt but alive (data/memory.ts builds it damaged;
  // a role rack A does not hold is skipped there, and RACK_A holds every role a rule names today).
  for (const rule of ship.arrivalDamage) {
    if (!(rule.maxIntegrity > 0 && rule.maxIntegrity < INTEGRITY_MAX)) fail(`arrival damage to ${rule.role} must leave it hurt but alive (got ${rule.maxIntegrity})`);
  }
  validateZoneDefs(ship.id, ship.zones, ship.flight, layout);
  const firstRun = ship.memory.drivers.firstRun;
  if (firstRun && firstRun.leadIndex !== ship.memory.drivers.lead - 1) fail('the first run\'s lead colonist must be in the lead pod');
  validateLandingDef(ship.id, ship.landing, ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0), planet.R);
  validatePodRacks(ship);
  if (shipPodCount(ship) !== ship.pods) fail(`pods ${ship.pods}, but the pod racks hold ${shipPodCount(ship)} drivers`);
  if (ship.pods > layout.maxPods) fail(`${ship.pods} pods, over a ${layout.cls} memory's ${layout.maxPods}`);
  // The memory layout is validated by building it, both ways (the first run's written families and
  // the seeded ones): buildShipMemory throws on a rack that does not fill 64 blocks, an unknown
  // token or a duplicate role. A bad layout fails the page at load, not when the kid reaches that
  // ship. A ship whose racks E–F are carried in is built with those racks empty (carry.ts packs the
  // real ones on arrival, and throws if they do not fit).
  const emptyUnit = { startAddr: layout.unitStart, segs: [freeSegment(layout.totalBlocks - layout.unitStart)] };
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
  // The final ship's finale deletes one root in its duel: its layout must have the slot, and the ladder's FINALE (the
  // stage every final ship plays) must bring the verbs (data/threats.ts validates the stages).
  if (ship.final && rootSlotRack(ship) === null) fail('the final ship has no root slot (an S token) for the FINALE\'s root');
  if (ship.final && HOLLOW_STAGES.finale.hollow.verbs === null) fail('the FINALE stage has no verbs for the final ship\'s duel');
  // HOLLOW may board on any beam from BOARD_MIN_DEPTH (04 §3.8), so a ship from ROOT_SLOT_FROM_LAYER on (deep enough to
  // be at that depth) needs a slot for its root (the slice-2 foundation note; slice-3a-plan §1.1 item 18).
  if (ship.layer >= ROOT_SLOT_FROM_LAYER && rootSlotRack(ship) === null) fail(`a layer-${ship.layer} ship has no root slot: HOLLOW may board on any beam into it`);
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
}
