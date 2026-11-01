import type { ArmShip, MemoryClass, ShipKind, TemplateId, ModifierId, Reservations, ShipKey, PodRackName } from '@/types/map';
import type { ShipLandingDef } from '@/types/landing';
import { RUN1_ROWS, RUN1_AUTHORED, type AuthoredOverride } from '@data/run1-arm';
import { armShipId } from '@systems/map-streams';
import { RESIDENT_NAMES, SLEEPER_NAMES } from '@data/ship-names';
import { FLIGHT_TEMPLATES } from '@data/flight-templates';
import { END_SLOTS, WORLDS, LAYER_COUNT } from '@data/arm';
import { distTable, layerOf } from '@systems/map-geometry';
import {
  LAYER_AXIS_GAP_FIRST_LY, LAYER_AXIS_GAP_LY, LAYER_SLACK, LATE_OFFSET, LATE_OFFSET_LAYER2, FINAL_MARGIN_YEARS,
  FINAL_YEAR_ROUND_TO, BEAM_RANGE_LY, FIRST_SHIP_PODS, FINAL_SHIP_PODS, LIGHT_PODS_BASE, STANDARD_PODS_BASE,
  ARK_PODS_PER_LAYER, ARK_PODS_LAYER_OFFSET, MAX_SHIP_PODS, FULL_FROM_PODS, RUN_START_YEAR,
} from '@data/tuning';

// The arm's generator (02-map §3.4–§3.6, §3.12; slice-3a-plan §2.1, §5.1): layer bases, timing, arks from their real
// neighbours, the ark pattern, the final year, pods and class, the validity checks 1–5 with 50 attempts then a throw,
// reservations from their named streams, and run 1's assembly from data/run1-arm.ts. Pure. Its exports are 3c's seam
// (map-update.ts steps 2–6 reuse bases, arkYear, finalYear and armChecks).
// FOUNDATION STUB (F2): the signatures are final; the timing rules, pods and class are real (they are the table's
// arithmetic); the rolls and checks throw TODO(3a-GEN); assembleRun1Arm returns §3.14's table with placeholder details.
// Track GEN owns this file after the foundation.

// The generator's own version (beside data/arm.ts ARM_CONTENT_VERSION): bump when a rule or a stream changes what an arm
// rolls, so 3c's save refuses an arm state another generator made.
export const MAP_GENERATOR_VERSION = 1;

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

// TODO(3a-GEN): a ship's timing roll (late 50/50, the jitter) on its ShipKey's 'timing' stream.
export function rollTiming(key: Readonly<ShipKey>, base: readonly number[], layer: number): { approachYear: number; late: boolean } {
  void base;
  throw new Error(`TODO(3a-GEN): rollTiming (slot ${key.slot}, layer ${layer})`);
}

// TODO(3a-GEN): an ark's year (02 §3.4): ARK_MARGIN_YEARS + 0–4 before the earliest moment any ship of the layer before
// could reach it.
export function arkYear(arm: readonly (ArmShip | null)[], slot: number, extraYears: number): number {
  void arm;
  throw new Error(`TODO(3a-GEN): arkYear (slot ${slot}, +${extraYears})`);
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

// One problem the validity checks found (02 §3.4's checks 1–5).
export interface ArmProblem {
  check: 'no-successor' | 'no-predecessor' | 'ark-one-hop' | 'no-final' | 'forced-tight';
  slot: number;
}

// TODO(3a-GEN): checks 1–5 on a whole arm.
export function armChecks(arm: readonly ArmShip[]): ArmProblem[] {
  throw new Error(`TODO(3a-GEN): armChecks (${arm.length} ships)`);
}

// TODO(3a-GEN): a fresh roll (run ≥ 2 in 3a, risk 4): layer bases, the ark pattern, kinds by LIGHT_SHARE, timing, arks,
// the final year, the checks, at most GEN_MAX_ATTEMPTS attempts, then a throw.
export function freshArm(armSeed: number, run: number, start: number): ArmShip[] {
  throw new Error(`TODO(3a-GEN): freshArm (seed ${armSeed}, run ${run}, start ${start})`);
}

// What a caller has already fixed for a ship before its details roll: run 1's table (the slot, pods, class) and a
// corrupted resident's CAPTURE template (02 §3.5). Rolled otherwise.
export interface FixedDetails {
  slot?: number;
  template?: TemplateId;
  pods?: number;
  memoryClass?: MemoryClass;
}

// TODO(3a-GEN): a generated ship's details from its ShipKey (each from its own named stream, keyRng(key, …)): template
// (allowed by layer) unless fixed, extra modifiers, omega0, the debris rack, the landing (systems/landing-roller.ts;
// POOR site data on keyRng(key, 'site')), the pod layout (systems/pod-layout.ts) and its reservations' streams.
export function rollShipDetails(
  key: Readonly<ShipKey>, kind: ShipKind, layer: number, fixed: Readonly<FixedDetails> = {},
): Pick<ArmShip, 'template' | 'modifiers' | 'omega0' | 'debrisRack' | 'landing' | 'podRacks' | 'lead'> {
  throw new Error(`TODO(3a-GEN): rollShipDetails (slot ${key.slot}, ${kind}, layer ${layer}, ${JSON.stringify(fixed)})`);
}

// --- Run 1 (slice-3a-plan §2.3) -----------------------------------------------------------------------------------------

// The template a placeholder ship flies (the first its layer allows: 02 §3.5).
function placeholderTemplate(layer: number): TemplateId {
  if (layer <= 2) return 'wide';
  if (layer === 3) return 'wide-b';
  if (layer === 4) return 'capture';
  return 'impact-b';
}

const INHERENT: Readonly<Record<TemplateId, readonly ModifierId[]>> = {
  'impact-a': ['impact-course'], 'wide': ['too-wide'], 'wide-b': ['too-wide'], 'capture': [], 'impact-b': ['impact-course'],
};

// PLACEHOLDER(3a-GEN): until the roller, one WIDE site for every pod on a GENTLE plain, or an authored ship's written
// parts (its class, terrain, LZ split evenly spaced from 60°, all WIDE or STANDARD with the last of three NARROW, its
// no-go arcs), so the card's facts for HALCYON, KESTREL and VESPER are already the authored ones.
function placeholderLanding(pods: number, layer: number, authored: Readonly<AuthoredOverride> | null): ShipLandingDef {
  const split = authored?.lzPods ?? [pods];
  const step = 360 / split.length;
  return {
    lzs: split.map((count, index) => ({
      label: `LZ-${String.fromCharCode(65 + index)}`, centreDeg: (60 + index * step) % 360, pods: count,
      width: split.length === 1 || authored?.allWide ? 'wide' : index === 2 ? 'narrow' : 'standard',
    })),
    forgiveness: authored?.forgiveness ?? 'gentle', terrain: authored?.terrain ?? 'PLAINS',
    noGo: Array.isArray(authored?.noGo) ? authored.noGo.map((arc) => ({ ...arc })) : [],
    colonyFirstRun: null, drag: layer > 1,
  };
}

// PLACEHOLDER(3a-GEN): pods packed from rack B, seven to a rack, no root slot, until layoutPods.
function placeholderPodRacks(pods: number, racks: readonly PodRackName[]): Partial<Record<PodRackName, string>> {
  const out: Partial<Record<PodRackName, string>> = {};
  let left = pods;
  for (const rack of racks) {
    const here = Math.min(7, left);
    left -= here;
    out[rack] = here === 0 ? '_64' : `${Array(here).fill('P').join(' ')} _${64 - 8 * here}`;
  }
  return out;
}

// Run 1's arm (02 §3.14 as authored structure): the table's slots, names, kinds, years, pods, classes and reservations.
// TODO(3a-GEN): the rolled details (templates, extra modifiers, omega0, landings, layouts, fragments, POOR site data, the
// `?` ships) from ShipKey(armSeed, 1, slot, 0) and the authored overrides (RUN1_AUTHORED). Until then the details are
// placeholders (PLACEHOLDER(3a-GEN)): the years, sizes and classes the desk and the hop math read are real.
export function assembleRun1Arm(armSeed: number): ArmShip[] {
  return RUN1_ROWS.map((entry): ArmShip => {
    const layer = WORLDS[entry.slot]!.layer;
    // A copy: RUN1_AUTHORED is shared (its landings are the classic five's objects), and the store mutates what it holds.
    const authored = entry.authored === null ? null : structuredClone(RUN1_AUTHORED[entry.authored]) as AuthoredOverride;
    const template = entry.template ?? placeholderTemplate(layer);
    const residentRow = entry.reserved.resident ?? null;
    const resident: Reservations['resident'] = residentRow === null ? null : {
      kind: residentRow.kind, shown: residentRow.shown,
      name: residentRow.name ?? (residentRow.kind === 'sleeping' ? SLEEPER_NAMES[0]! : RESIDENT_NAMES[1]!),
    };
    const podRackNames: readonly PodRackName[] = entry.memoryClass === 'FULL' ? ['B', 'C', 'D'] : ['B', 'C'];
    return {
      slot: entry.slot, id: armShipId({ armSeed, reportedRun: 1, slot: entry.slot, attempt: 0 }), name: entry.name,
      kind: entry.kind, template, pods: entry.pods,
      memoryClass: entry.memoryClass, approachYear: entry.approachYear, late: entry.late,
      timedAgainstStart: RUN_START_YEAR, reportedRun: 1, runsOnChart: 1, attempt: 0,
      modifiers: [...INHERENT[template], ...(authored?.modifiers ?? [])],
      omega0: FLIGHT_TEMPLATES[template].flight.start.omega0,
      debrisRack: authored?.debrisRack ?? null,
      landing: authored?.landing ?? placeholderLanding(entry.pods, layerOf(entry.slot), authored),
      podRacks: authored?.podRacks ?? placeholderPodRacks(entry.pods, podRackNames),
      lead: authored?.lead ?? entry.pods,
      authored: entry.authored,
      reserved: { resident, unknownEvent: entry.reserved.unknownEvent ?? null, fragments: 0, site: 'good', tracePlace: null },
    };
  });
}
