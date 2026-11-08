// =====================================================================================================================
// Slice 7c: Track TRACE owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.3, §5.3; R32, R33). The FOUNDATION wrote
// the stubs below with their final signatures; every one is neutral (the lead's seams call them on every TRANSMIT, every
// PACKET preview and every boot) and answers as if no trace were held, so nothing moves until TRACE builds them and raises
// data/traces.ts TRACES_BUILT, one kind at a time. Module state: none (what was given is run.traces.places[].given, §2.3).
// =====================================================================================================================
// The traces' mechanics that are not pure rules of the ladder (planThreat's final rule and the final root are the lead's, in
// systems/threat-plan.ts and systems/traces.ts): the gifts' charge through the arrival path, the seeds of a gift ship's
// beam and of the final ship's (PURGE's wipe, the wild seed), the boot's trace lines and what they install as they are said
// (THREAD+ or FIREWALL.sys, SUNSET's spare tool, MERGE's thread), STAY's letter, and the arrival's record of all of it.
//
// The seams that call these (the lead's):
// • systems/run.ts transmitNext: traceSeedMods on the rolled seeds (beam + delivery) before the layout, traceGiftCharge into
//   carry.ts arrivalCharge's giftCharge, then arrivalTraceLines into ArrivalReport.traceLines (with giftCharge itself);
// • systems/arrival-preview.ts unitArrival (the desk's card, TRAINING's preview, the PACKET): traceSeedAllowance on the seed
//   allowance and traceGiftCharge into roomFit's bonus, so every arrival number the kid reads is the one that happens
//   (transmitNext and transmit.ts's model assert they agree);
// • data/script.ts bootLinePlan: traceBootLines (after the deliveries, before the charge line), bootLine's words through
//   traceBootLineText, and systems/boot.ts sayNextLine calls traceBootLineSaid as each is said (a skip says every line, so
//   a skipped boot still gives its gifts);
// • systems/inbox.ts deriveMessages: traceMessages (STAY's `<colony> · FOUNDED BY UNIT-047`), with the route's other mail.
// Notes for TRACE: a first ship has no arrival (ship 1 is a fresh unit from ARRIVAL CONTROL): SUNSET's first-ship fallback
// (traces.ts placeTraces) gives its charge and its tool at the boot itself, and traceBootLines reads its lines from the run.
// The wild seed's target follows the beam-seed rule: beam-seeds.ts rollExtraSeeds (the lead's, on the 'traces' hop stream
// transmitNext passes). controlCompliant is the one compliance rule (data/endings.ts, re-exported by ending-rules.ts); the
// run's traces already say whether a wild seed is owed (run.traces.extraSeed, systems/traces.ts finalTraces().wild).
import type { Store } from '@state/store';
import type { GameState, RunState } from '@state/schema';
import type { BeamSeedPlan } from '@/types/threat';
import type { TraceBootLine } from '@/types/trace';
import type { InboxMessage } from '@/types/inbox';
import type { Packet } from '@systems/carry';
import type { Rng } from '@systems/rng';
import { notBuilt } from '@systems/not-built';

// The seeds a beam into `toSlot` carries once the traces have their say (R32, R33): SPARE's gift ship's beam carries none;
// into the final ship PURGE's wipe drops every seed the unit carries (the beam's and the deliveries'), and a non-compliant
// trace adds TRACE_EXTRA_SEEDS wild seed(s) by the beam-seed target rule, which the wipe never takes. `wiped`: the seeds
// dropped; `extra`: the wild seeds added. `rng`: the hop's own 'traces' stream (the beam's other streams never move).
export interface TraceSeedMods {
  seeds: BeamSeedPlan[];
  wiped: number;
  extra: number;
}

// Neutral: the seeds as rolled, nothing wiped, nothing added.
export function traceSeedMods(
  state: Readonly<GameState>, toSlot: number, rolled: Readonly<{ beam: readonly BeamSeedPlan[]; delivery: readonly BeamSeedPlan[] }>,
  packet: Readonly<Packet>, rng: Rng,
): TraceSeedMods {
  void state; void toSlot; void packet; void rng;
  return { seeds: [...rolled.beam, ...rolled.delivery].map((plan) => structuredClone(plan) as BeamSeedPlan), wiped: 0, extra: 0 };
}

// The seed allowance a PACKET preview counts into `toSlot` (fewest, most), once the traces have their say (the same rule
// as traceSeedMods, as an allowance). Neutral: as given.
export function traceSeedAllowance(state: Readonly<GameState>, toSlot: number, allowance: Readonly<{ min: number; max: number }>): { min: number; max: number } {
  void state; void toSlot;
  return { min: allowance.min, max: allowance.max };
}

// The REPAIR CHARGE a trace gives on arrival at `toSlot` (R32: TRACE_GIFT_CHARGE at a gift's ship not yet given, and
// REASSIGNMENT's allowance at the final ship), laid out with the rest of the charge (carry.ts arrivalCharge's giftCharge),
// so a squeezed receiver loses it as loudly as any. Neutral: 0.
export function traceGiftCharge(state: Readonly<GameState>, toSlot: number): number {
  void state; void toSlot;
  return 0;
}

// The arrival's trace lines (ArrivalReport.traceLines), from what this send applied: the gift, PURGE's wipe, the wild seed,
// MERGE's thread and REASSIGNMENT's allowance at the final ship. Neutral: none.
export function arrivalTraceLines(state: Readonly<GameState>, toSlot: number, mods: Readonly<TraceSeedMods>, giftCharge: number): TraceBootLine[] {
  void state; void toSlot; void mods; void giftCharge;
  return [];
}

// This boot's trace lines, in the order they type (data/script.ts bootLinePlan places them after the deliveries and before
// the charge line): the arrival's (state.run.arrival.traceLines), or on a first ship the run's own (SUNSET's fallback).
// Neutral: none.
export function traceBootLines(state: Readonly<GameState>): TraceBootLine[] {
  void state;
  return [];
}

// The words of trace line `ordinal` among this boot's lines of `kind` (bootLine). Unreachable while traceBootLines is empty.
export function traceBootLineText(state: Readonly<GameState>, kind: TraceBootLine['kind'], ordinal: number): string {
  return notBuilt('traceBootLineText', 'TRACE', state, kind, ordinal);
}

// A trace line is said (systems/boot.ts sayNextLine; a skip says every line): what it gives lands now (THREAD+ or
// FIREWALL.sys, SUNSET's spare tool, MERGE's thread on the Core, the place marked given) and its event plays ('trace-gift',
// 'dish-wiped', 'dish-wild'). Unreachable while traceBootLines is empty.
export function traceBootLineSaid(store: Store<GameState>, kind: TraceBootLine['kind'], ordinal: number): void {
  notBuilt('traceBootLineSaid', 'TRACE', store, kind, ordinal);
}

// STAY's letter (R32: `<colony> · FOUNDED BY UNIT-047`, read at its ship's boot: readAtDepth that ship's depth once the route
// reaches it), derived with the INBOX's other mail (systems/inbox.ts deriveMessages; its memo keys on run.traces). Its id is
// saved in run.inbox.read, so it is pinned once built (`trace:stay:<slot>` is the lead's suggestion). Neutral: none.
export function traceMessages(run: Readonly<RunState>): InboxMessage[] {
  void run;
  return [];
}
