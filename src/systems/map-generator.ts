import type { ArmShip, MemoryClass, ShipKind, TemplateId, ModifierId, Reservations, ShipKey, PodRackName } from '@/types/map';
import type { Rng } from '@systems/rng';
import { createRng, hashSeed } from '@systems/rng';
import { RUN1_ROWS, RUN1_AUTHORED, type AuthoredOverride, type Run1Row } from '@data/run1-arm';
import { armShipId, keyRng } from '@systems/map-streams';
import { RESIDENT_NAMES, SLEEPER_NAMES, GENERATED_SHIP_NAMES, aresName, finalShipName } from '@data/ship-names';
import { FLIGHT_TEMPLATES, TEMPLATE_RULES, templatesForLayer, extrasFor } from '@data/flight-templates';
import { END_SLOTS, FIRST_SLOT, WORLDS, LAYER_COUNT, slotsInLayer } from '@data/arm';
import { distTable, layerOf } from '@systems/map-geometry';
import { rollLanding } from '@systems/landing-roller';
import { layoutPods } from '@systems/pod-layout';
import { shipDefOf, validateShipDef } from '@data/ships';
import {
  LAYER_AXIS_GAP_FIRST_LY, LAYER_AXIS_GAP_LY, LAYER_SLACK, LATE_OFFSET, LATE_OFFSET_LAYER2, FINAL_MARGIN_YEARS,
  FINAL_YEAR_ROUND_TO, BEAM_RANGE_LY, FIRST_SHIP_PODS, FINAL_SHIP_PODS, LIGHT_PODS_BASE, STANDARD_PODS_BASE,
  ARK_PODS_PER_LAYER, ARK_PODS_LAYER_OFFSET, MAX_SHIP_PODS, FULL_FROM_PODS, RUN_START_YEAR, LATE_CHANCE,
  TIMING_JITTER_YEARS, ARK_MARGIN_YEARS, ARK_MARGIN_EXTRA_YEARS, ARK_PATTERNS, LIGHT_SHARE, LATE_TIGHT_FROM_LAYER,
  MAX_LATE_TIGHT_PER_LAYER, GEN_MAX_ATTEMPTS, EXTRA_MODIFIERS_MAX_BY_LAYER, SENSOR_DAMAGE_MAX_INTEGRITY,
  ENGINE_FAULT_THRUST_INTEGRITY, ROOT_SLOT_FROM_LAYER, SLEEPER_CHANCE, HIDDEN_RESIDENT_ODDS,
} from '@data/tuning';

// The arm's generator (02-map §3.4–§3.6, §3.12; slice-3a-plan §2.1, §5.1): layer bases, timing, arks from their real
// neighbours, the ark pattern, the final year, pods and class, the validity checks 1–5 with GEN_MAX_ATTEMPTS attempts then
// a throw, reservations from their named streams, the Debris guarantee, and run 1's assembly from data/run1-arm.ts. Pure:
// it reads no store and every roll is a named stream, so an arm is a function of (armSeed, run). It throws on its own bad
// output (every ship's ShipDef passes validateShipDef before the arm is returned). Its exports are 3c's seam (map-update.ts
// steps 2–6 reuse bases, rollTiming, arkYear, finalYear, armChecks and rollShipDetails).
// Reference: docs/phase3/map-sim/arm_sim.py (fresh_arm, check), whose statistics tests/unit/map/generator-stats checks.
// Track GEN owns this file after the foundation.
//
// The streams (each its own, so a later slice reading one never moves another's numbers):
// • per arm and attempt (armRng): 'pattern' (the ark pattern), 'kinds' (the ark's slot, light or standard), 'names';
//   the reservations 'res-corrupted', 'res-left', 'res-sleeper', 'unknown-events', 'fragments' (02 §3.5), and
//   'debris-guarantee';
// • per ship (its ShipKey, systems/map-streams.ts keyRng): 'timing', 'template', 'modifiers', 'omega0', 'debris-rack',
//   'landing' and 'site' (systems/landing-roller.ts).

// The generator's own version (beside data/arm.ts ARM_CONTENT_VERSION): bump when a rule or a stream changes what an arm
// rolls, so 3c's save refuses an arm state another generator made.
export const MAP_GENERATOR_VERSION = 1;

// An arm-level stream: one per (arm seed, run, attempt, name), in a namespace of its own (`arm:`), apart from the ships'
// keys (`ship:`) and the per-visit `childRng(seed, slot, stream)` keys.
export function armRng(armSeed: number, run: number, attempt: number, stream: string): Rng {
  return createRng(hashSeed(`arm:${armSeed >>> 0}:${run}:${attempt}:${stream}`));
}

const whole = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
function pickFrom<T>(rng: Rng, list: readonly T[], what: string): T {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error(`map-generator: no ${what} to pick from`);
  return item;
}

// The layer base years for a run starting in `start` (02 §3.4): index = layer (1–8); index 0 unused. Run 1: 2300, 2352,
// 2467, 2612, 2712, 2817, 2927.
export function bases(start: number): number[] {
  const out = [0, start];
  for (let k = 1; k < LAYER_SLACK.length + 1; k++) {
    out.push(out[k]! + (k === 1 ? LAYER_AXIS_GAP_FIRST_LY : LAYER_AXIS_GAP_LY) + LAYER_SLACK[k - 1]!);
  }
  return out;
}

// A non-ark ship's approach year (02 §3.4): base + round(offset × LAYER_SLACK(layer − 1)) + jitter, half up (WAYFARER's
// 2927 + 42.5 is 2970). `jitter` is the rolled whole number in ±TIMING_JITTER_YEARS.
export function timingYear(base: readonly number[], layer: number, late: boolean, jitter: number): number {
  if (!(Number.isInteger(layer) && layer >= 2 && layer < LAYER_COUNT)) throw new Error(`timingYear: layer ${layer}`);
  const offset = late ? (layer === 2 ? LATE_OFFSET_LAYER2 : LATE_OFFSET) : 0;
  return base[layer]! + Math.round(offset * LAYER_SLACK[layer - 2]!) + jitter;
}

// A light or standard ship's timing roll on its ShipKey's 'timing' stream: LATE 50/50, then the jitter.
export function rollTiming(key: Readonly<ShipKey>, base: readonly number[], layer: number): { approachYear: number; late: boolean } {
  const rng = keyRng(key, 'timing');
  const late = rng() < LATE_CHANCE;
  const jitter = whole(rng, -TIMING_JITTER_YEARS, TIMING_JITTER_YEARS);
  return { approachYear: timingYear(base, layer, late, jitter), late };
}

// An ark's extra years beyond the margin (0–ARK_MARGIN_EXTRA_YEARS), on its ShipKey's 'timing' stream.
export function rollArkExtra(key: Readonly<ShipKey>): number {
  return whole(keyRng(key, 'timing'), 0, ARK_MARGIN_EXTRA_YEARS);
}

// An ark's year (02 §3.4): ARK_MARGIN_YEARS + `extraYears` before the earliest moment any ship of the layer before could
// reach it (measured from the real neighbours, so it holds once ships of different ages share the chart). Throws when no
// ship of the layer before has it in range (the arm's geometry guarantees one: every one-layer pair is in range).
export function arkYear(arm: readonly (Pick<ArmShip, 'slot' | 'approachYear'> | null)[], slot: number, extraYears: number): number {
  const layer = layerOf(slot);
  let earliest = Infinity;
  for (const prev of slotsInLayer(layer - 1)) {
    const ship = arm[prev];
    if (!ship) continue;
    const d = distTable(prev, slot);
    if (d <= BEAM_RANGE_LY) earliest = Math.min(earliest, ship.approachYear + d);
  }
  if (!Number.isFinite(earliest)) throw new Error(`arkYear: no ship of layer ${layer - 1} has slot ${slot} in range`);
  return earliest - ARK_MARGIN_YEARS - extraYears;
}

// The final ship's year (02 §3.4): the latest A(S) + d over every ship that has the end slot in range, plus
// FINAL_MARGIN_YEARS, rounded up to a multiple of FINAL_YEAR_ROUND_TO, and at least `floor` (3c: the last final year at
// that end plus the launch gap). Run 1: WAYFARER 2970 + 26 + 20 → 3020.
export function finalYear(arm: readonly (Pick<ArmShip, 'slot' | 'approachYear'> | null)[], endSlot: number, floor: number | null = null): number {
  let latest = -Infinity;
  for (const ship of arm) {
    if (ship === null || ship.slot === endSlot || END_SLOTS.includes(ship.slot)) continue;
    const d = distTable(ship.slot, endSlot);
    if (d <= BEAM_RANGE_LY) latest = Math.max(latest, ship.approachYear + d);
  }
  if (!Number.isFinite(latest)) throw new Error(`finalYear: no ship has slot ${endSlot} in range`);
  const year = Math.ceil((latest + FINAL_MARGIN_YEARS) / FINAL_YEAR_ROUND_TO) * FINAL_YEAR_ROUND_TO;
  return floor === null ? year : Math.max(year, floor);
}

// A ship's pods by kind and layer (02 §3.4).
export function podsFor(kind: ShipKind, layer: number): number {
  switch (kind) {
    case 'first': return FIRST_SHIP_PODS;
    case 'final': return FINAL_SHIP_PODS;
    case 'light': return LIGHT_PODS_BASE + Math.floor(layer / 3);
    case 'standard': return STANDARD_PODS_BASE + layer;
    case 'ark': return Math.min(MAX_SHIP_PODS, Math.round(ARK_PODS_PER_LAYER * (ARK_PODS_LAYER_OFFSET + layer)));
  }
}

// The class rule (02 §3.4, 01 §3.16): light ships TIGHT; arks, the final ship and ships of FULL_FROM_PODS or more FULL;
// the rest (the first ship among them) COMPACT.
export function memoryClassOf(kind: ShipKind, pods: number): MemoryClass {
  if (kind === 'light') return 'TIGHT';
  if (kind === 'ark' || kind === 'final' || pods >= FULL_FROM_PODS) return 'FULL';
  return 'COMPACT';
}

// Does a ship in `layer` (of kind `kind`) need a root slot (slice-3a-plan §1.1 item 18): every ship from
// ROOT_SLOT_FROM_LAYER on (HOLLOW may board on any beam into it) and every final ship (its FINALE's root).
export function needsRootSlot(kind: ShipKind, layer: number): boolean {
  return kind === 'final' || layer >= ROOT_SLOT_FROM_LAYER;
}

// --- The validity checks (02 §3.4, 1–5) ---------------------------------------------------------------------------------

// One problem the validity checks found.
export interface ArmProblem {
  check: 'no-successor' | 'no-predecessor' | 'ark-one-hop' | 'no-final' | 'forced-tight';
  slot: number;
}

// What the checks and the reservations read of a ship: its slot, kind, class and year. The generator's trial arms are
// these (the details roll only once the arm passes).
type Timed = Pick<ArmShip, 'slot' | 'kind' | 'memoryClass' | 'approachYear'>;

// Can a ship beam from `a` to `b` (02 §3.1)? Outward, in range, in time. The map's own rule (systems/map-hop.ts reachable)
// on a bare arm, so the generator needs no RunMapState.
export function armReach(arm: readonly (Timed | null)[], a: number, b: number): boolean {
  const from = arm[a];
  const to = arm[b];
  if (!from || !to || layerOf(b) <= layerOf(a)) return false;
  const d = distTable(a, b);
  return d <= BEAM_RANGE_LY && from.approachYear + d <= to.approachYear;
}

// A TIGHT ship from LATE_TIGHT_FROM_LAYER on (check 5's ships).
function lateTight(arm: readonly Timed[], slot: number): boolean {
  return layerOf(slot) >= LATE_TIGHT_FROM_LAYER && arm[slot]!.memoryClass === 'TIGHT';
}

// Checks 1–5 on a whole arm (02 §3.4): (1) every ship but a final one has a reachable successor; (2) every ship but the
// first has a reachable predecessor; (3) no ark is reachable by a one-layer hop; (4) every layer-7 ship reaches a final
// ship; (5) only when 1–4 pass (as the sim): no route is forced through a TIGHT ship from layer 5 on: from every ship, one
// way on to a final ship avoids them. An empty list: the arm is valid.
export function armChecks(arm: readonly Timed[]): ArmProblem[] {
  if (arm.length !== WORLDS.length || arm.some((ship, slot) => ship.slot !== slot)) throw new Error(`armChecks: an arm of ${arm.length} ships out of slot order`);
  const problems: ArmProblem[] = [];
  const slots = arm.map((ship) => ship.slot);
  for (const s of slots) {
    if (!END_SLOTS.includes(s) && !slots.some((t) => armReach(arm, s, t))) problems.push({ check: 'no-successor', slot: s });
    if (s !== FIRST_SLOT && !slots.some((p) => armReach(arm, p, s))) problems.push({ check: 'no-predecessor', slot: s });
    if (arm[s]!.kind === 'ark' && slotsInLayer(layerOf(s) - 1).some((p) => armReach(arm, p, s))) problems.push({ check: 'ark-one-hop', slot: s });
    if (layerOf(s) === LAYER_COUNT - 1 && !END_SLOTS.some((end) => armReach(arm, s, end))) problems.push({ check: 'no-final', slot: s });
  }
  if (problems.length > 0) return problems;
  const clear = new Map<number, boolean>(END_SLOTS.map((end) => [end, true]));
  for (const s of [...slots].sort((a, b) => layerOf(b) - layerOf(a))) {
    if (END_SLOTS.includes(s)) continue;
    const ok = slots.some((t) => armReach(arm, s, t) && clear.get(t) === true && !lateTight(arm, t));
    clear.set(s, ok);
    if (!ok && !lateTight(arm, s)) problems.push({ check: 'forced-tight', slot: s });
  }
  return problems;
}

// --- A generated ship's details ------------------------------------------------------------------------------------------

// What a caller has already fixed for a ship before its details roll: run 1's table (the slot, pods, class), a corrupted
// resident's CAPTURE template with no extra modifier (02 §3.5), the Debris guarantee's WIDE-B with DEBRIS. Rolled otherwise.
export interface FixedDetails {
  slot?: number;
  template?: TemplateId;
  pods?: number;
  memoryClass?: MemoryClass;
  noExtras?: boolean;                 // a corrupted resident's ship takes no extra modifier
  extras?: readonly ModifierId[];     // these extras instead of a roll (the Debris guarantee)
}

export type ShipDetails = Pick<ArmShip, 'template' | 'modifiers' | 'omega0' | 'debrisRack' | 'landing' | 'podRacks' | 'lead' | 'arrivalDamage'>
  & { site: Reservations['site'] };

// The arrival damage a ship's modifiers bring (02 §3.5): SENSOR DAMAGE cuts the arriving Sensor Interp, ENGINE FAULT the
// ship's own Thrust Ctrl.
export function arrivalDamageOf(modifiers: readonly ModifierId[]): ArmShip['arrivalDamage'] {
  return [
    ...(modifiers.includes('sensor-damage') ? [{ role: 'sensor' as const, maxIntegrity: SENSOR_DAMAGE_MAX_INTEGRITY }] : []),
    ...(modifiers.includes('engine-fault') ? [{ role: 'thrust-ctrl' as const, maxIntegrity: ENGINE_FAULT_THRUST_INTEGRITY }] : []),
  ];
}

// The pod racks that hold a pod (a DEBRIS cloud names one of them: 02 §3.5, "a seeded rack the ship has").
function seededRacks(podRacks: Partial<Record<PodRackName, string>>): PodRackName[] {
  return (['B', 'C', 'D'] as const).filter((rack) => podRacks[rack]?.split(/\s+/).includes('P') === true);
}

// A generated ship's details from its ShipKey, each from its own stream: the template (allowed by layer) unless fixed, the
// extra modifiers (0 up to 02 §3.5's count for the layer, from those its template allows there), omega0 (the only flight
// number a template re-rolls), the pod layout (systems/pod-layout.ts), the debris rack, the landing and POOR site data
// (systems/landing-roller.ts). `authored` is a hand-written ship's parts, honoured over the roll.
export function rollShipDetails(
  key: Readonly<ShipKey>, kind: ShipKind, layer: number, fixed: Readonly<FixedDetails> = {}, authored: Readonly<AuthoredOverride> | null = null,
): ShipDetails {
  const pods = fixed.pods ?? podsFor(kind, layer);
  const memoryClass = fixed.memoryClass ?? memoryClassOf(kind, pods);
  const templateRng = keyRng(key, 'template');
  const template = fixed.template ?? pickFrom(templateRng, templatesForLayer(layer), `template for layer ${layer}`);
  if (TEMPLATE_RULES[template].fromLayer > layer && authored === null && fixed.template === undefined) {
    throw new Error(`rollShipDetails: ${template} in layer ${layer}`);
  }
  let extras: ModifierId[];
  if (authored !== null) extras = [...authored.modifiers];
  else if (fixed.extras !== undefined) extras = [...fixed.extras];
  else if (fixed.noExtras) extras = [];
  else {
    const rng = keyRng(key, 'modifiers');
    const allowed = extrasFor(template, layer);
    const count = Math.min(allowed.length, whole(rng, 0, EXTRA_MODIFIERS_MAX_BY_LAYER[layer] ?? 0));
    extras = [];
    for (let i = 0; i < count; i++) {
      const left = allowed.filter((modifier) => !extras.includes(modifier));
      extras.push(pickFrom(rng, left, 'extra modifier'));
    }
    extras.sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b));
  }
  const modifiers = [...TEMPLATE_RULES[template].inherent, ...extras];
  const written = authored !== null || kind === 'first' || kind === 'final';
  const omega0 = written
    ? FLIGHT_TEMPLATES[template].flight.start.omega0
    : Math.round((keyRng(key, 'omega0')() * 2 - 1) * Math.PI * 100) / 100;
  const pods0 = layoutPods(pods, memoryClass, needsRootSlot(kind, layer), kind === 'final');
  const podRacks = authored?.podRacks ? { ...authored.podRacks } : pods0.podRacks;
  const lead = authored?.lead ?? pods0.lead;
  let debrisRack: PodRackName | null = null;
  if (modifiers.includes('debris')) {
    const racks = seededRacks(podRacks);
    debrisRack = authored?.debrisRack ?? pickFrom(keyRng(key, 'debris-rack'), racks, 'seeded rack for the debris');
    if (!racks.includes(debrisRack)) throw new Error(`rollShipDetails: debris names rack ${debrisRack}, which holds no pod`);
  }
  const { site, ...landing } = rollLanding(key, layer, pods, authored);
  const arrivalDamage = authored !== null ? authored.arrivalDamage.map((rule) => {
    if (rule.role !== 'sensor' && rule.role !== 'thrust-ctrl') throw new Error(`rollShipDetails: an authored arrival damage to ${rule.role}`);
    return { role: rule.role, maxIntegrity: rule.maxIntegrity };
  }) : arrivalDamageOf(modifiers);
  return { template, modifiers, omega0, debrisRack, landing, podRacks, lead, arrivalDamage, site };
}

// --- Reservations (02 §3.5's placement quotas; shown from their slices) ------------------------------------------------

const NO_RESERVATIONS = (): Reservations => ({ resident: null, unknownEvent: null, fragments: 0, site: 'good', tracePlace: null });

interface Placement {
  reserved: Reservations[];   // by slot
  corrupted: number[];        // their slots (CAPTURE, no extras)
}

// What a caller already placed (run 1's table: the corrupted residents on GANNET and PROVIDENCE, the sleeper on CURLEW).
interface PlacedResident {
  slot: number;
  resident: Omit<NonNullable<Reservations['resident']>, 'name'> & { name: string | null };
}

// 02 §3.5's quotas on a timed arm, each from its own stream (armRng):
// • corrupted residents ('res-corrupted'): at most two, one in layers 4–5 (`reported faulty`) and one in layers 6–7, never
//   adjacent layers, never linked by a reachable hop, never an ark; the late one reads `unknown` 1 time in 2, and a hidden
//   one is never TIGHT;
// • the three `?` ships ('unknown-events'): old colony (layers 3–5), gone resident (3–6), signal (5–7), in three different
//   layers;
// • a sleeper ('res-sleeper'): at most one, layers 3–7, with chance SLEEPER_CHANCE when the caller placed none;
// • residents that left ('res-left'): five, the gone-resident `?` ship and four ordinary ships (one in layer 2, two in
//   layers 3–7 for the fragments' notes, one anywhere in 2–7);
// • fragments ('fragments'): 2 on the signal ship, 1 on the gone-resident ship, 1 in each of two departed residents' notes
//   in layers 3–7.
// Never on the first ship, a final ship or an authored ship (VESPER never carries a resident); one resident per ship.
// Names: corrupted and departed residents from the ship-AI pool, the sleeper from the sleepers', all different.
function placeReservations(
  arm: readonly Timed[], armSeed: number, run: number, attempt: number, authored: ReadonlySet<number>, placed: readonly PlacedResident[],
): Placement {
  const reserved = arm.map(NO_RESERVATIONS);
  const rng = (stream: string): Rng => armRng(armSeed, run, attempt, stream);
  const open = (slot: number): boolean => !END_SLOTS.includes(slot) && slot !== FIRST_SLOT && !authored.has(slot)
    && reserved[slot]!.resident === null && reserved[slot]!.unknownEvent === null;
  const inLayers = (from: number, to: number): number[] => arm.map((ship) => ship.slot).filter((slot) => layerOf(slot) >= from && layerOf(slot) <= to);
  const corrupted: number[] = [];
  for (const entry of placed) {
    reserved[entry.slot]!.resident = { ...entry.resident, name: entry.resident.name ?? '' };
    if (entry.resident.kind === 'corrupted') corrupted.push(entry.slot);
  }
  // Corrupted residents (when the caller placed none).
  if (!placed.some((entry) => entry.resident.kind === 'corrupted')) {
    const r = rng('res-corrupted');
    const early = inLayers(4, 5).filter((slot) => open(slot) && arm[slot]!.kind !== 'ark');
    if (early.length > 0) {
      const first = pickFrom(r, early, 'early corrupted slot');
      reserved[first]!.resident = { kind: 'corrupted', shown: 'faulty', name: '' };
      corrupted.push(first);
      const hidden = r() < HIDDEN_RESIDENT_ODDS;
      const late = inLayers(6, 7).filter((slot) => open(slot) && arm[slot]!.kind !== 'ark'
        && Math.abs(layerOf(slot) - layerOf(first)) >= 2 && !armReach(arm, first, slot)
        && !(hidden && arm[slot]!.memoryClass === 'TIGHT'));
      if (late.length > 0) {
        const second = pickFrom(r, late, 'late corrupted slot');
        reserved[second]!.resident = { kind: 'corrupted', shown: hidden ? 'unknown' : 'faulty', name: '' };
        corrupted.push(second);
      }
    }
  }
  // The `?` ships.
  const u = rng('unknown-events');
  const usedLayers: number[] = [];
  const unknown = (kind: NonNullable<Reservations['unknownEvent']>, from: number, to: number): number => {
    const slots = inLayers(from, to).filter((slot) => open(slot) && !usedLayers.includes(layerOf(slot)));
    const slot = pickFrom(u, slots, `slot for the ${kind} event`);
    reserved[slot]!.unknownEvent = kind;
    usedLayers.push(layerOf(slot));
    return slot;
  };
  const signal = unknown('signal', 5, 7);
  unknown('old-colony', 3, 5);
  const gone = unknown('gone-resident', 3, 6);
  reserved[gone]!.resident = { kind: 'left', shown: 'unknown', name: '' };
  // The sleeper.
  const s = rng('res-sleeper');
  const chance = s();
  if (!placed.some((entry) => entry.resident.kind === 'sleeping') && chance < SLEEPER_CHANCE) {
    const slot = pickFrom(s, inLayers(3, 7).filter(open), 'sleeper slot');
    reserved[slot]!.resident = { kind: 'sleeping', shown: 'unknown', name: '' };
  }
  // The residents that left.
  const l = rng('res-left');
  const leftNotes: number[] = [];
  const leave = (from: number, to: number): number => {
    const slot = pickFrom(l, inLayers(from, to).filter(open), `slot for a departed resident (layers ${from}–${to})`);
    reserved[slot]!.resident = { kind: 'left', shown: 'unknown', name: '' };
    return slot;
  };
  leave(2, 2);
  leftNotes.push(leave(3, 7), leave(3, 7));
  leave(2, 7);
  // Fragments.
  const f = rng('fragments');
  void f();
  reserved[signal]!.fragments = 2;
  reserved[gone]!.fragments = 1;
  for (const slot of leftNotes) reserved[slot]!.fragments = 1;
  // Names, all different: the ship-AI pool for corrupted and departed residents, the sleepers' pool for the sleeper.
  const n = rng('res-names');
  const taken = new Set(reserved.flatMap((entry) => (entry.resident && entry.resident.name !== '' ? [entry.resident.name] : [])));
  reserved.forEach((entry) => {
    if (!entry.resident || entry.resident.name !== '') return;
    const pool = (entry.resident.kind === 'sleeping' ? SLEEPER_NAMES : RESIDENT_NAMES).filter((name) => !taken.has(name));
    const name = pickFrom(n, pool, `${entry.resident.kind} resident name`);
    taken.add(name);
    entry.resident.name = name;
  });
  return { reserved, corrupted };
}

// --- Building the arm ----------------------------------------------------------------------------------------------------

// The ShipDef id of an arm ship: an authored ship keeps its own ('kestrel'), every other its name's ('good-hope').
export function shipIdFor(name: string, authored: ArmShip['authored']): string {
  return authored ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

interface ShipFrame extends Timed {
  name: string;
  late: boolean;
  pods: number;
  authored: ArmShip['authored'];
}

function buildShip(
  frame: Readonly<ShipFrame>, key: Readonly<ShipKey>, start: number, details: Readonly<ShipDetails>, reserved: Readonly<Reservations>,
): ArmShip {
  return {
    slot: frame.slot, id: armShipId(key), name: frame.name, kind: frame.kind, template: details.template, pods: frame.pods,
    memoryClass: frame.memoryClass, approachYear: frame.approachYear, late: frame.late,
    timedAgainstStart: start, reportedRun: key.reportedRun, runsOnChart: 1, attempt: key.attempt,
    modifiers: [...details.modifiers], omega0: details.omega0, debrisRack: details.debrisRack,
    arrivalDamage: details.arrivalDamage.map((rule) => ({ ...rule })),
    landing: structuredClone(details.landing), podRacks: { ...details.podRacks }, lead: details.lead,
    authored: frame.authored,
    reserved: { ...structuredClone(reserved), site: details.site },
  };
}

// The written parts a first or final ship takes on any run (02 §3.5: ARES-n flies ARES-VII's flight and landing; §3.6,
// 01 §3.15: the end slot's row is New Haven's, LAST LIGHT's), with the run-1 colony name only on the authored ship itself.
function writtenRow(kind: ShipKind, authoredId: ArmShip['authored']): AuthoredOverride | null {
  if (kind !== 'first' && kind !== 'final') return null;
  const row = structuredClone(RUN1_AUTHORED[kind === 'first' ? 'ares-vii' : 'last-light']) as AuthoredOverride;
  if (kind === 'final' && authoredId === null && row.landing) row.landing = { ...row.landing, colonyFirstRun: null };
  return row;
}

// The details, the Debris guarantee and the loud self-check, on a timed arm whose reservations are placed. The Debris
// guarantee (04 §3.2's recommendation, slice-3a-plan §1.3): at least one DEBRIS ship among the layer-3 ships reachable from
// the first ship (KESTREL on run 1), so the depth-2 hop always offers MOVE's first job; when none rolled one, one of them
// (a light or standard ship first, an ark only when none other qualifies; never authored) re-rolls as WIDE-B with DEBRIS.
function detailArm(
  frames: readonly ShipFrame[], keys: readonly ShipKey[], start: number, placement: Placement, run1Rows: readonly Run1Row[] | null,
  guarantee: Rng,
): ArmShip[] {
  const detailsFor = (slot: number, extra: FixedDetails = {}): ShipDetails => {
    const frame = frames[slot]!;
    const row = run1Rows?.[slot] ?? null;
    const authored = frame.authored !== null ? structuredClone(RUN1_AUTHORED[frame.authored]) as AuthoredOverride : writtenRow(frame.kind, null);
    const corrupted = placement.corrupted.includes(slot);
    const template = extra.template ?? row?.template ?? (corrupted ? 'capture' : frame.kind === 'first' ? 'impact-a' : frame.kind === 'final' ? 'impact-b' : undefined);
    return rollShipDetails(keys[slot]!, frame.kind, layerOf(slot), {
      slot, pods: frame.pods, memoryClass: frame.memoryClass, noExtras: corrupted, ...extra, ...(template ? { template } : {}),
    }, authored);
  };
  const details = frames.map((frame) => detailsFor(frame.slot));
  const reachableL3 = slotsInLayer(3).filter((slot) => armReach(frames, FIRST_SLOT, slot));
  if (!reachableL3.some((slot) => details[slot]!.modifiers.includes('debris'))) {
    const open = reachableL3.filter((slot) => frames[slot]!.authored === null);
    const small = open.filter((slot) => frames[slot]!.kind !== 'ark');
    const slot = pickFrom(guarantee, small.length > 0 ? small : open, 'ship for the Debris guarantee');
    details[slot] = detailsFor(slot, { template: 'wide-b', extras: ['debris'] });
  }
  const arm = frames.map((frame) => buildShip(frame, keys[frame.slot]!, start, details[frame.slot]!, placement.reserved[frame.slot]!));
  for (const ship of arm) validateShipDef(shipDefOf(ship));
  return arm;
}

// A fresh roll (run ≥ 2 in 3a, risk 4; 3c's fresh arm): layer bases from `start`, the ark pattern, kinds by LIGHT_SHARE (at
// most MAX_LATE_TIGHT_PER_LAYER light ships per layer from LATE_TIGHT_FROM_LAYER), timing from each ship's key, arks from
// their real neighbours, the final year, the checks; at most GEN_MAX_ATTEMPTS attempts (the attempt is part of every key, so
// a retry re-rolls), then a throw. Then the reservations, the details, the Debris guarantee and the self-check. The first
// ship is ARES-(VI + run) and the final ship finalShipName(run) (interim, risk 4: 3c's world update names them).
export function freshArm(armSeed: number, run: number, start: number): ArmShip[] {
  if (!(Number.isInteger(run) && run >= 2)) throw new Error(`freshArm: run ${run} (run 1's arm is assembleRun1Arm's)`);
  return freshArmAttempts(armSeed, run, start).arm;
}

// freshArm with the attempt that passed (tests/unit/map/generator-stats: 02 §4.5's "valid first try").
export function freshArmAttempts(armSeed: number, run: number, start: number): { arm: ArmShip[]; attempt: number } {
  const base = bases(start);
  for (let attempt = 0; attempt < GEN_MAX_ATTEMPTS; attempt++) {
    const keyOf = (slot: number): ShipKey => ({ armSeed: armSeed >>> 0, reportedRun: run, slot, attempt });
    const pattern = pickFrom(armRng(armSeed, run, attempt, 'pattern'), ARK_PATTERNS, 'ark pattern');
    const kinds = armRng(armSeed, run, attempt, 'kinds');
    const names = armRng(armSeed, run, attempt, 'names');
    const pool = [...GENERATED_SHIP_NAMES];
    const frames: (ShipFrame | null)[] = WORLDS.map(() => null);
    frames[FIRST_SLOT] = {
      slot: FIRST_SLOT, kind: 'first', memoryClass: memoryClassOf('first', FIRST_SHIP_PODS), approachYear: start,
      name: aresName(run), late: false, pods: FIRST_SHIP_PODS, authored: null,
    };
    for (let layer = 2; layer < LAYER_COUNT; layer++) {
      const slots = slotsInLayer(layer);
      const arkSlot = pattern.includes(layer) ? pickFrom(kinds, slots, 'ark slot') : null;
      let lights = 0;
      for (const slot of slots) {
        let kind: ShipKind;
        if (slot === arkSlot) kind = 'ark';
        else {
          kind = kinds() < LIGHT_SHARE ? 'light' : 'standard';
          if (kind === 'light' && layer >= LATE_TIGHT_FROM_LAYER && lights >= MAX_LATE_TIGHT_PER_LAYER) kind = 'standard';
        }
        if (kind === 'light') lights++;
        const pods = podsFor(kind, layer);
        const name = pool.splice(Math.floor(names() * pool.length), 1)[0];
        if (name === undefined) throw new Error('freshArm: the generated name pool ran out');
        const timing = kind === 'ark' ? { approachYear: 0, late: false } : rollTiming(keyOf(slot), base, layer);
        frames[slot] = { slot, kind, memoryClass: memoryClassOf(kind, pods), name, pods, authored: null, ...timing };
      }
      if (arkSlot !== null) frames[arkSlot]!.approachYear = arkYear(frames, arkSlot, rollArkExtra(keyOf(arkSlot)));
    }
    for (const end of END_SLOTS) {
      frames[end] = {
        slot: end, kind: 'final', memoryClass: memoryClassOf('final', FINAL_SHIP_PODS), approachYear: 0, name: finalShipName(run),
        late: false, pods: FINAL_SHIP_PODS, authored: null,
      };
    }
    for (const end of END_SLOTS) frames[end]!.approachYear = finalYear(frames, end);
    const timed = frames.map((frame, slot) => {
      if (frame === null) throw new Error(`freshArm: slot ${slot} left empty`);
      return frame;
    });
    if (armChecks(timed).length > 0) continue;
    const keys = timed.map((frame) => keyOf(frame.slot));
    const placement = placeReservations(timed, armSeed, run, attempt, new Set(), []);
    return { arm: detailArm(timed, keys, start, placement, null, armRng(armSeed, run, attempt, 'debris-guarantee')), attempt };
  }
  throw new Error(`freshArm: no valid arm in ${GEN_MAX_ATTEMPTS} attempts (seed ${armSeed >>> 0}, run ${run}, start ${start})`);
}

// --- Run 1 (slice-3a-plan §2.3) -----------------------------------------------------------------------------------------

// Run 1's arm (02 §3.14 as authored structure): the table's slots, names, kinds, years, pods, classes and residents
// (data/run1-arm.ts); the rest from ShipKey(armSeed, 1, slot, 0): generated ships' templates (a corrupted resident's
// slot is CAPTURE), extra modifiers, omega0, landings, layouts, the debris rack, POOR site data, and the reservations the
// table leaves open (the departed residents, the `?` ships, the fragments, the residents' names). The five authored ships
// keep their written details (RUN1_AUTHORED). The checks must pass (they do: 907 routes), else it throws.
export function assembleRun1Arm(armSeed: number): ArmShip[] {
  const frames: ShipFrame[] = RUN1_ROWS.map((row) => ({
    slot: row.slot, kind: row.kind, memoryClass: row.memoryClass, approachYear: row.approachYear, name: row.name, late: row.late,
    pods: row.pods, authored: row.authored,
  }));
  const problems = armChecks(frames);
  if (problems.length > 0) throw new Error(`assembleRun1Arm: run 1's table fails the checks (${problems.map((p) => `${p.check} ${p.slot}`).join(', ')})`);
  const keys = frames.map((frame): ShipKey => ({ armSeed: armSeed >>> 0, reportedRun: 1, slot: frame.slot, attempt: 0 }));
  const placed: PlacedResident[] = RUN1_ROWS.flatMap((row) => (row.reserved.resident ? [{ slot: row.slot, resident: row.reserved.resident }] : []));
  const authoredSlots = new Set([...RUN1_ROWS.filter((row) => row.authored !== null || row.reserved.resident === null).map((row) => row.slot)]);
  const placement = placeReservations(frames, armSeed, 1, 0, authoredSlots, placed);
  return detailArm(frames, keys, RUN_START_YEAR, placement, RUN1_ROWS, armRng(armSeed, 1, 0, 'debris-guarantee'));
}
