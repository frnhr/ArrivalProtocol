import type { ShipFlightDef, ShrinkTuning } from '@data/ships';
import type { TemplateId } from '@/types/map';
import {
  SHRINK_MARGIN_TAC, SHRINK_MARGIN_MIN_TAC, SHRINK_SMALL_LOOP_FACTOR, SHRINK_REACTION_TAC, HALCYON_SMALL_LOOP_FACTOR,
  HALCYON_EDGE_BACK_OFF_TAC, KESTREL_SMALL_LOOP_FACTOR, KESTREL_EDGE_BACK_OFF_TAC, VESPER_SMALL_LOOP_FACTOR,
  VESPER_EDGE_BACK_OFF_TAC, LAST_LIGHT_SMALL_LOOP_FACTOR, LAST_LIGHT_EDGE_BACK_OFF_TAC,
} from '@data/tuning';

// The five flight templates (02-map §3.5; slice-3a-plan §2.3): the hand-flown ships' flight blocks, moved here unchanged
// so every ship the map generates flies one of them. A generated ship takes its template's block with omega0 re-rolled
// (data/ships.ts shipDefOf); the classic five (data/classic-five.ts) take theirs as written. The template names what it
// asks of the kid, not the ship it was tuned on (the comments say which). Units: km, km/s, km/s², μ in km³/s².
// The shrink numbers stay per template: where the ring's inner edge falls along a shrink depends on the template's ring,
// gravity and warp (ShrinkTuning's WHY in data/ships.ts), which a re-rolled omega0 does not change.
// Track GEN owns this file after the foundation (TEMPLATE_RULES: the layers, labels and modifiers per template).

export interface FlightTemplate {
  flight: ShipFlightDef;
  shrink: ShrinkTuning;
}

// IMPACT-A: a crash course (rp0 3,000 is underground) on a wide ring; OUT lifts ▼ into it. (tuned on ARES-VII)
const IMPACT_A: FlightTemplate = {
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
};

// WIDE: a flyby far outside a narrower ring (▼ at 14,000 km); IN pulls ▼ in, then a long coast. (tuned on HALCYON)
const WIDE: FlightTemplate = {
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
};

// WIDE-B: too wide (▼ at 9,000 km), a tighter tank, and room on the inbound path for a debris cloud. (tuned on KESTREL)
const WIDE_B: FlightTemplate = {
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
};

// CAPTURE: already in the ring with RETRO engaged; the capture at ▼ after a coast (the engine-fault template). (tuned on VESPER)
const CAPTURE: FlightTemplate = {
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
};

// IMPACT-B: a crash course again, faster (×30), with the coast crossing 9,000–12,000 km (the belt's band). (tuned on LAST LIGHT)
const IMPACT_B: FlightTemplate = {
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
};

export const FLIGHT_TEMPLATES: Readonly<Record<TemplateId, FlightTemplate>> = {
  'impact-a': IMPACT_A,
  'wide': WIDE,
  'wide-b': WIDE_B,
  'capture': CAPTURE,
  'impact-b': IMPACT_B,
};
