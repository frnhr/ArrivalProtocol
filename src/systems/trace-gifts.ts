// =====================================================================================================================
// Slice 7c: Track TRACE owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.3, §5.3; R32, R33). The lead's seams call
// it on every TRANSMIT, every PACKET preview and every boot; each answer reads data/traces.ts TRACES_BUILT, so a kind that
// is down answers as if no trace were held. Module state: none (what was given is run.traces.places[].given, §2.3).
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
//
// The rules, per kind (R32, R33; 05 §3.8):
// • a gift (SPARE, SUNSET, STAY) is TRACE_GIFT_CHARGE on arrival at its ship (traceGiftCharge: through the arrival path, so
//   a squeezed receiver loses it as loudly as any charge), once (its place is marked given as its line is said), plus its
//   file as its line is said: SPARE the first of THREAD+ and FIREWALL.sys the unit lacks at that boot (decided at the
//   TRANSMIT from what crosses, checked again at the boot), SUNSET a spare copy of the first tool of SUNSET_GIFT_PRIORITY
//   the last unit ended with (a first of its kind is licensed with it, as a delivery's is), STAY its colony's letter in
//   that boot's INBOX (traceMessages). SPARE's ship's beam carries no seeds (the beam's and the deliveries');
// • at the final ship: PURGE drops every seed the unit carries in (the beam's and the deliveries'), a non-compliant trace
//   adds TRACE_EXTRA_SEEDS wild seed(s) by the beam-seed target rule (beam-seeds.ts rollExtraSeeds on the hop's own
//   'traces' stream), which the wipe never takes, MERGE adds TRACE_MERGE_THREADS to the Core's capacity as its line is said
//   (no seam: coreThreads reads the capacity, and nothing carries on from the final ship), REASSIGNMENT's allowance is
//   TRACE_ALLOWANCE_CHARGE through the arrival path (slice 8: its own number, apart from the caches');
// • a first ship has no arrival (ship 1 is a fresh unit from ARRIVAL CONTROL): SUNSET's first-ship fallback gives its
//   charge at the boot itself, into the pool where it lies (the receiver's free run after it, past the files beside it),
//   and its tool with it. Its line is read from the run (traceBootLines), and its charge from what fits as it is said.
// A trace that depends on the restored pods would read the final ship's result (7b's review); none of these does.
import type { Store } from '@state/store';
import type { GameState, RunState, TransitPlan } from '@state/schema';
import type { BeamSeedPlan } from '@/types/threat';
import type { TraceBootLine, TraceKind, TracePlace } from '@/types/trace';
import type { InboxMessage } from '@/types/inbox';
import type { FsToolKind } from '@/types/fs-tool';
import type { RepoFileId } from '@/types/repo';
import type { FirewallSegment, RedundancySegment, Segment } from '@/types/segment';
import type { Packet } from '@systems/carry';
import type { Rng } from '@systems/rng';
import { traceBuilt, TRACE_RULES, SUNSET_GIFT_PRIORITY } from '@data/traces';
import { TRACE_TEXT } from '@data/trace-text';
import { CONTACT_TEXT } from '@data/contact-text';
import { INBOX_TEXT } from '@data/inbox-text';
import { UPGRADES, UPGRADE_FILE_TEXT } from '@data/upgrades';
import { REPO_FILES, repoFileSegments } from '@data/repository';
import { hollowUnitName, unitName } from '@data/hollow-text';
import { layoutOf } from '@data/memory';
import { traceAt, finalTraces } from '@systems/traces';
import { currentSlot, isEndSlot, armShipAt } from '@systems/map-streams';
import { distLy } from '@systems/map-geometry';
import { rollExtraSeeds } from '@systems/beam-seeds';
import { bestRepairVersion, deliveryFirstOfKind } from '@systems/repository';
import { emit } from '@systems/events';
import {
  newSegId, replaceRange, unitInstallAddress, mergeAdjacentFree, assertMemoryInvariants, isUnitFileType,
} from '@systems/memory-ops';
import { isFirewall } from '@state/selectors';
import {
  TRACE_GIFT_CHARGE, TRACE_ALLOWANCE_CHARGE, TRACE_EXTRA_SEEDS, TRACE_MERGE_THREADS, THREAD_PLUS_THREADS, THREAD_PLUS_MAX_OWNED, FIREWALL_BLOCKS, CONTACT_GIFT_CHARGE,
} from '@data/tuning';

type GiftKind = 'spare' | 'sunset' | 'stay';
const GIFT_KINDS: readonly TraceKind[] = ['spare', 'sunset', 'stay'];
const isGiftKind = (kind: TraceKind): kind is GiftKind => GIFT_KINDS.includes(kind);

// The gift waiting at `slot` and not given yet, of a kind this build plays (CONTACT's signal stops: contactStopAt), or null.
function giftAt(run: Readonly<Pick<RunState, 'traces' | 'map'>>, slot: number): (TracePlace & { kind: GiftKind }) | null {
  if (run.map.world !== 'arm') return null;
  const place = traceAt(run, slot);
  if (place === null || place.given || !isGiftKind(place.kind) || !traceBuilt(place.kind)) return null;
  return place as TracePlace & { kind: GiftKind };
}

// 7d (R41): a CONTACT signal stop waiting at `slot` and not given yet, while CONTACT is built, or null. Its gift is
// CONTACT_GIFT_CHARGE through the arrival path and its `▓▓░▓` file (laid in rack A at the ship's build: systems/signals.ts
// signalFileAt), whose SCAN finds its fragment (systems/unknown-events.ts).
function contactStopAt(run: Readonly<Pick<RunState, 'traces' | 'map'>>, slot: number): TracePlace | null {
  if (run.map.world !== 'arm' || !traceBuilt('contact')) return null;
  const place = traceAt(run, slot);
  return place !== null && place.kind === 'contact' && !place.given ? place : null;
}

// Is `slot` the run's final ship (the classic world holds no traces, so its LAST LIGHT plays none)?
function isFinal(run: Readonly<Pick<RunState, 'map'>>, slot: number): boolean {
  return run.map.world === 'arm' && isEndSlot(run.map, slot);
}

// The non-compliant kind the wild seed's line names (05 §3.8: one seed however many are held): the first one held and built.
function wildKind(run: Readonly<Pick<RunState, 'traces'>>): TraceKind {
  const kind = run.traces.kinds.find((held) => TRACE_RULES[held].cost === 'wild-seed' && traceBuilt(held));
  if (kind === undefined) throw new Error('trace-gifts: a wild seed with no non-compliant trace held and built');
  return kind;
}

// --- The seeds (R32's seedless beam, R33's wipe and wild seed) -----------------------------------------------------------

// The seeds a beam into `toSlot` carries once the traces have their say (R32, R33): SPARE's gift ship's beam carries none;
// into the final ship PURGE's wipe drops every seed the unit carries (the beam's and the deliveries'), and a non-compliant
// trace adds TRACE_EXTRA_SEEDS wild seed(s) by the beam-seed target rule, which the wipe never takes. `wiped`: the seeds
// dropped; `extra`: the wild seeds added. `rng`: the hop's own 'traces' stream (the beam's other streams never move).
export interface TraceSeedMods {
  seeds: BeamSeedPlan[];
  wiped: number;
  extra: number;
}

export function traceSeedMods(
  state: Readonly<GameState>, toSlot: number, rolled: Readonly<{ beam: readonly BeamSeedPlan[]; delivery: readonly BeamSeedPlan[] }>,
  packet: Readonly<Packet>, rng: Rng,
): TraceSeedMods {
  const all = [...rolled.beam, ...rolled.delivery].map((plan) => structuredClone(plan) as BeamSeedPlan);
  const run = state.run;
  if (giftAt(run, toSlot)?.kind === 'spare') return { seeds: [], wiped: all.length, extra: 0 };
  if (!isFinal(run, toSlot)) return { seeds: all, wiped: 0, extra: 0 };
  const final = finalTraces(run);
  const seeds = final.purge ? [] : all;
  const wiped = all.length - seeds.length;
  if (!final.wild) return { seeds, wiped, extra: 0 };
  // One seed a file, and never behind a delivered file (a delivery's seed rides its own file; a first of kind none at all).
  const delivered = packet.deliveries.flatMap((group) => group.segIds);
  const wild = rollExtraSeeds(packet, TRACE_EXTRA_SEEDS, rng, [...seeds.map((seed) => seed.targetId), ...delivered]);
  return { seeds: [...seeds, ...wild], wiped, extra: wild.length };
}

// The seed allowance a PACKET preview counts into `toSlot` (fewest, most), by traceSeedMods' rule: none into SPARE's ship
// or into the final ship after PURGE, and the wild seed on top into the final ship.
export function traceSeedAllowance(state: Readonly<GameState>, toSlot: number, allowance: Readonly<{ min: number; max: number }>): { min: number; max: number } {
  const run = state.run;
  if (giftAt(run, toSlot)?.kind === 'spare') return { min: 0, max: 0 };
  if (!isFinal(run, toSlot)) return { min: allowance.min, max: allowance.max };
  const final = finalTraces(run);
  const base = final.purge ? { min: 0, max: 0 } : { min: allowance.min, max: allowance.max };
  const wild = final.wild ? TRACE_EXTRA_SEEDS : 0;
  return { min: base.min + wild, max: base.max + wild };
}

// --- The charge (R32) -----------------------------------------------------------------------------------------------------

// The REPAIR CHARGE a trace gives on arrival at `toSlot` (R32: TRACE_GIFT_CHARGE at a gift's ship not yet given, and
// REASSIGNMENT's allowance, TRACE_ALLOWANCE_CHARGE, at the final ship), laid out with the rest of the charge (carry.ts arrivalCharge's giftCharge),
// so a squeezed receiver loses it as loudly as any.
export function traceGiftCharge(state: Readonly<GameState>, toSlot: number): number {
  const run = state.run;
  const gift = giftAt(run, toSlot) !== null ? TRACE_GIFT_CHARGE : 0;
  const allowance = isFinal(run, toSlot) && finalTraces(run).reassignment ? TRACE_ALLOWANCE_CHARGE : 0;
  const stop = contactStopAt(run, toSlot) !== null ? CONTACT_GIFT_CHARGE : 0;
  return gift + allowance + stop;
}

// --- The gifts' files ------------------------------------------------------------------------------------------------------

type SpareFile = 'thread-plus' | 'firewall';

// SPARE's file (R32): the first of THREAD+ and FIREWALL.sys the unit lacks, or null when it holds both.
function spareFileOf(threadsOwned: number, firewallHeld: boolean): SpareFile | null {
  if (threadsOwned < THREAD_PLUS_MAX_OWNED) return 'thread-plus';
  return firewallHeld ? null : 'firewall';
}

// SPARE's file as the TRANSMIT sends the unit (the card picked counts: its THREAD+ or its FIREWALL.sys crosses with it).
function spareFileAtSend(state: Readonly<GameState>, plan: Readonly<TransitPlan>): SpareFile | null {
  const threads = state.run.upgrades.filter((id) => id === 'thread-plus').length + (plan.pick === 'thread-plus' ? 1 : 0);
  const firewall = plan.pick === 'firewall' || state.memory.some((seg) => isFirewall(seg) && !plan.dropped.includes(seg.id));
  return spareFileOf(threads, firewall);
}

// SPARE's file at the boot, from what arrived (the card's THREAD+ is in run.upgrades by then).
function spareFileAtBoot(state: Readonly<GameState>): SpareFile | null {
  return spareFileOf(state.run.upgrades.filter((id) => id === 'thread-plus').length, state.memory.some(isFirewall));
}

const SPARE_FILE_NAME: Readonly<Record<SpareFile, string>> = {
  'thread-plus': UPGRADES.find((card) => card.id === 'thread-plus')!.title,
  firewall: UPGRADES.find((card) => card.id === 'firewall')!.title,
};

// The catalogue row SUNSET's spare copies (a tool row's file is a copy of that tool's own file; Repair's is Repair.bak).
const SUNSET_SPARE_FILE: Readonly<Record<FsToolKind, RepoFileId | null>> = {
  delete: 'rm', move: 'mv', swap: 'swap', copy: 'cp', repair: 'repair-bak', scan: 'scan-bak',
};

// SUNSET's tool (R32): the first of SUNSET_GIFT_PRIORITY the last unit ended with (EndingRecord.kit), never a `.skl`; null
// when its kit holds none of them (charge only).
function sunsetFileOf(run: Readonly<Pick<RunState, 'traces'>>): RepoFileId | null {
  const kit = run.traces.from?.ending.kit ?? [];
  const kind = SUNSET_GIFT_PRIORITY.find((tool) => kit.includes(tool));
  return kind === undefined ? null : SUNSET_SPARE_FILE[kind];
}

// A free run of at least `size` blocks no op reserved (where unitInstallAddress writes a unit file); THREAD+ takes none.
function roomFor(memory: readonly Segment[], size: number): boolean {
  return size <= 0 || memory.some((seg) => seg.type === 'free' && seg.reservedBy === undefined && seg.size >= size);
}

function sunsetBlocks(file: RepoFileId): number {
  return REPO_FILES[file].blocks;
}

// --- The lines (R32, R33) ----------------------------------------------------------------------------------------------------

function cacheLine(run: Readonly<RunState>, place: Readonly<TracePlace & { kind: GiftKind }>, charge: number, what: string | null): string {
  const from = run.traces.from;
  if (from === null) throw new Error('trace-gifts: a gift with no ending it came from');
  switch (place.kind) {
    case 'spare': return TRACE_TEXT.cache(hollowUnitName(from.ending.rootUnits), charge, what);
    case 'sunset': return TRACE_TEXT.leftCache(unitName(from.unit), charge, what);
    case 'stay': {
      const stay = from.ending.stay;
      return TRACE_TEXT.supply(stay?.colony ?? from.ending.finalShip, charge);
    }
  }
}

// The arrival's trace lines (ArrivalReport.traceLines), from what this send applied, in the order they type: PURGE's wipe,
// the wild seed, MERGE's thread, REASSIGNMENT's allowance, then the gift waiting on this ship (on the final ship that is
// STAY's fallback). A wipe that took no seed says nothing.
export function arrivalTraceLines(state: Readonly<GameState>, toSlot: number, mods: Readonly<TraceSeedMods>, giftCharge: number): TraceBootLine[] {
  const run = state.run;
  if (giftCharge !== traceGiftCharge(state, toSlot)) throw new Error(`arrivalTraceLines: a gift charge of ${giftCharge}, the traces give ${traceGiftCharge(state, toSlot)}`);
  const lines: TraceBootLine[] = [];
  if (isFinal(run, toSlot)) {
    const final = finalTraces(run);
    if (final.purge && mods.wiped > 0) lines.push({ kind: 'dish-wiped', trace: 'purge', text: TRACE_TEXT.wiped(mods.wiped) });
    if (final.wild && mods.extra > 0) lines.push({ kind: 'dish-wild', trace: wildKind(run), text: TRACE_TEXT.wild(mods.extra) });
    if (final.merge) lines.push({ kind: 'trace-gift', trace: 'merge', text: TRACE_TEXT.thread(TRACE_MERGE_THREADS) });
    if (final.reassignment) lines.push({ kind: 'trace-gift', trace: 'reassignment', text: TRACE_TEXT.allowance(TRACE_ALLOWANCE_CHARGE) });
  } else if (mods.wiped > 0 && giftAt(run, toSlot)?.kind !== 'spare') {
    throw new Error(`arrivalTraceLines: ${mods.wiped} seeds wiped on a beam into slot ${toSlot}, neither SPARE's ship nor the final one`);
  }
  const place = giftAt(run, toSlot);
  if (place !== null) {
    const plan = run.transit;
    if (plan === null) throw new Error('arrivalTraceLines: a gift with no TRANSMIT under way');
    const what = place.kind === 'spare' ? spareNameOf(spareFileAtSend(state, plan))
      : place.kind === 'sunset' ? sunsetNameOf(sunsetFileOf(run)) : null;
    lines.push({ kind: 'trace-gift', trace: place.kind, text: cacheLine(run, place, TRACE_GIFT_CHARGE, what) });
  }
  // 7d (R41): a CONTACT signal stop says its charge and its file.
  if (contactStopAt(run, toSlot) !== null) lines.push({ kind: 'trace-gift', trace: 'contact', text: CONTACT_TEXT.stopLine(CONTACT_GIFT_CHARGE) });
  return lines;
}

const spareNameOf = (file: SpareFile | null): string | null => (file === null ? null : SPARE_FILE_NAME[file]);
const sunsetNameOf = (file: RepoFileId | null): string | null => (file === null ? null : REPO_FILES[file].name);

// A first ship's own trace line (it has no arrival): SUNSET's fallback, while its place is on this ship. Read from the run
// for the whole boot (the plan is made once, at the boot's first tick), given or not: its words are said once.
function firstShipLines(state: Readonly<GameState>): TraceBootLine[] {
  const run = state.run;
  if (run.map.world !== 'arm') return [];
  const place = traceAt(run, currentSlot(run));
  if (place === null || place.kind !== 'sunset' || !traceBuilt('sunset')) return [];
  const sunset = place as TracePlace & { kind: GiftKind };
  return [{ kind: 'trace-gift', trace: 'sunset', text: cacheLine(run, sunset, TRACE_GIFT_CHARGE, sunsetNameOf(sunsetFileOf(run))) }];
}

// This boot's trace lines, in the order they type (data/script.ts bootLinePlan places them after the deliveries and before
// the charge line): the arrival's (state.run.arrival.traceLines), or on a first ship the run's own (SUNSET's fallback).
export function traceBootLines(state: Readonly<GameState>): TraceBootLine[] {
  const arrival = state.run.arrival;
  if (arrival !== null) return arrival.traceLines.map((line) => ({ ...line }));
  return firstShipLines(state);
}

function lineAt(state: Readonly<GameState>, kind: TraceBootLine['kind'], ordinal: number): TraceBootLine {
  const line = traceBootLines(state).filter((candidate) => candidate.kind === kind)[ordinal];
  if (line === undefined) throw new Error(`trace-gifts: no '${kind}' line ${ordinal} at this boot`);
  return line;
}

// The words of trace line `ordinal` among this boot's lines of `kind` (bootLine), rendered from the state as it is said: the
// arrival's own words, but a gift's file with no free run left says so in its place; a first ship's SUNSET names the charge
// that fits its pool now.
export function traceBootLineText(state: Readonly<GameState>, kind: TraceBootLine['kind'], ordinal: number): string {
  const line = lineAt(state, kind, ordinal);
  if (kind !== 'trace-gift' || !isGiftKind(line.trace)) return line.text;
  const run = state.run;
  const place = traceAt(run, currentSlot(run));
  if (place === null || place.kind !== line.trace) throw new Error(`traceBootLineText: a ${line.trace} line on a ship whose place is ${place?.kind ?? 'none'}`);
  const gift = place as TracePlace & { kind: GiftKind };
  const charge = run.arrival === null ? firstShipChargeRoom(state.memory) : TRACE_GIFT_CHARGE;
  const file = giftFileNow(state, gift.kind);
  const roomy = file === null || roomFor(state.memory, file.blocks);
  const what = file === null ? null : roomy ? file.name : TRACE_TEXT.noRoom(file.name);
  const text = cacheLine(run, gift, charge, what);
  // The arrival's words were rendered at the TRANSMIT from what crossed; the boot sees the same files (fail loudly if not).
  if (run.arrival !== null && roomy && text !== line.text) {
    throw new Error(`traceBootLineText: the TRANSMIT said "${line.text}", the boot says "${text}"`);
  }
  return text;
}

// The file a gift installs at this boot (its name and blocks), or null.
function giftFileNow(state: Readonly<GameState>, kind: GiftKind): { name: string; blocks: number; spare: SpareFile | null; repo: RepoFileId | null } | null {
  if (kind === 'spare') {
    const spare = spareFileAtBoot(state);
    if (spare === null) return null;
    return { name: SPARE_FILE_NAME[spare], blocks: spare === 'firewall' ? FIREWALL_BLOCKS : 0, spare, repo: null };
  }
  if (kind === 'sunset') {
    const repo = sunsetFileOf(state.run);
    return repo === null ? null : { name: REPO_FILES[repo].name, blocks: sunsetBlocks(repo), spare: null, repo };
  }
  return null;
}

// The charge a first ship's pool can take now (at most TRACE_GIFT_CHARGE): the free run that follows it, past the unit's
// files beside it (the licences land there: memory-ops.ts unitInstallAddress), with no op holding any of them.
function firstShipChargeRoom(memory: readonly Segment[]): number {
  const pool = memory.findIndex((seg) => seg.type === 'redundancy');
  if (pool < 0) throw new Error('trace-gifts: a first ship with no REPAIR CHARGE');
  for (let index = pool + 1; index < memory.length; index++) {
    const seg = memory[index]!;
    if (seg.type === 'free') return seg.reservedBy === undefined ? Math.min(TRACE_GIFT_CHARGE, seg.size) : 0;
    if (!isUnitFileType(seg)) return 0;
  }
  return 0;
}

// --- What a line gives as it is said ---------------------------------------------------------------------------------------

// The number a final-ship line names (`2 SEEDS GONE`), by its own words.
function seedsNamed(text: string, render: (seeds: number) => string): number {
  for (let seeds = 1; seeds <= 64; seeds++) if (render(seeds) === text) return seeds;
  throw new Error(`trace-gifts: no seed count renders "${text}"`);
}

// A trace line is said (systems/boot.ts sayNextLine; a skip says every line): what it gives lands now (THREAD+ or
// FIREWALL.sys, SUNSET's spare tool and on a first ship its charge, MERGE's thread on the Core, the place marked given)
// and its event plays ('trace-gift', 'dish-wiped', 'dish-wild').
export function traceBootLineSaid(store: Store<GameState>, kind: TraceBootLine['kind'], ordinal: number): void {
  const state = store.getState();
  const line = lineAt(state, kind, ordinal);
  const slot = currentSlot(state.run);
  if (kind === 'dish-wiped') {
    emit('dish-wiped', { seeds: seedsNamed(line.text, TRACE_TEXT.wiped) });
    return;
  }
  if (kind === 'dish-wild') {
    emit('dish-wild', { seeds: seedsNamed(line.text, TRACE_TEXT.wild) });
    return;
  }
  if (line.trace === 'merge') {
    store.update((draft) => {
      const core = draft.memory.find((seg) => seg.type === 'core');
      if (core === undefined || core.type !== 'core') throw new Error('traceBootLineSaid: MERGE\'s thread with no AI Core');
      core.capacity += TRACE_MERGE_THREADS;
      draft.ui.memoryRev++;
    });
  } else if (isGiftKind(line.trace)) {
    giveGift(store, line.trace);
  } else if (line.trace === 'contact') {
    // 7d (R41): its charge crossed with the arrival and its file is in rack A since the build; the stop is given.
    store.update((draft) => {
      const place = draft.run.traces.places.find((candidate) => candidate.slot === slot && candidate.kind === 'contact');
      if (place === undefined || place.given) throw new Error(`traceBootLineSaid: no CONTACT stop waiting on slot ${slot}`);
      place.given = true;
    });
  } else if (line.trace !== 'reassignment') {
    throw new Error(`traceBootLineSaid: a gift line for ${line.trace}`);
  }
  emit('trace-gift', { kind: line.trace, slot });
}

function giveGift(store: Store<GameState>, kind: GiftKind): void {
  const state = store.getState();
  const slot = currentSlot(state.run);
  const index = state.run.traces.places.findIndex((place) => place.slot === slot);
  const place = state.run.traces.places[index];
  if (place === undefined || place.kind !== kind) throw new Error(`giveGift: no ${kind} place on slot ${slot}`);
  if (place.given) throw new Error(`giveGift: ${kind}'s gift on slot ${slot} was given already`);
  const firstShip = state.run.arrival === null;
  const charge = firstShip ? firstShipChargeRoom(state.memory) : 0;
  const file = giftFileNow(state, kind);
  const fits = file !== null && roomFor(state.memory, file.blocks);
  const licence = file?.repo !== undefined && file.repo !== null && fits && deliveryFirstOfKind(state.run, file.repo);
  const repairVersion = bestRepairVersion(state.memory);
  store.update((draft) => {
    const memory = draft.memory;
    if (charge > 0) growPool(memory, charge);
    if (file !== null && fits) {
      if (file.spare === 'thread-plus') {
        const core = memory.find((seg) => seg.type === 'core');
        if (core === undefined || core.type !== 'core') throw new Error('giveGift: THREAD+ with no AI Core');
        core.capacity += THREAD_PLUS_THREADS;
        draft.run.upgrades.push('thread-plus');
      } else {
        const segs: Segment[] = file.spare === 'firewall' ? [firewallFile()] : repoFileSegments(file.repo!, newSegId, repairVersion);
        for (const seg of segs) {
          const addr = unitInstallAddress(memory, seg.size);
          replaceRange(memory, addr, addr + seg.size, [seg], { opId: null, own: [] });
        }
        mergeAdjacentFree(memory);
      }
    }
    if (licence && file?.repo != null) {
      const tool = REPO_FILES[file.repo].gives;
      if (tool !== 'repair-v2') {
        draft.run.licences.push(tool);
        draft.hollow.untriedTools.push(tool);
      }
    }
    assertMemoryInvariants(memory, layoutOf(draft).totalBlocks);
    draft.run.traces.places[index]!.given = true;
    draft.ui.memoryRev++;
  });
}

function firewallFile(): FirewallSegment {
  return {
    id: newSegId('firewall'), name: UPGRADE_FILE_TEXT.firewall.name, type: 'firewall', size: FIREWALL_BLOCKS,
    desc: UPGRADE_FILE_TEXT.firewall.desc,
  };
}

// A first ship's gift charge into its pool (firstShipChargeRoom's room): the pool grows by `points` blocks and points, and
// the free run after it shrinks by as many (the files between keep their order, a few blocks further on).
function growPool(memory: Segment[], points: number): void {
  const at = memory.findIndex((seg) => seg.type === 'redundancy');
  const pool = memory[at] as RedundancySegment | undefined;
  if (pool === undefined) throw new Error('growPool: no REPAIR CHARGE');
  const freeAt = memory.findIndex((seg, index) => index > at && seg.type === 'free');
  const free = memory[freeAt];
  if (free === undefined || free.size < points) throw new Error(`growPool: no free run of ${points} after the pool`);
  pool.size += points;
  pool.used += points;
  pool.capacity = Math.max(pool.capacity, pool.used);
  if (free.size === points) memory.splice(freeAt, 1);
  else free.size -= points;
}

// --- STAY's letter (R32) -------------------------------------------------------------------------------------------------------

// STAY's letter (`<colony> · FOUNDED BY UNIT-047`), read at the boot of its ship once the route reaches it (readAtDepth that
// stop's depth), derived with the INBOX's other mail (systems/inbox.ts deriveMessages; its memo keys on run.traces). Sent by
// light from the colony's world (05 §3.8: "a ship it can reach by light"); the colony's age is the year it sent the packet
// less its founding. A record that kept no colony (a classic STAY) sends no letter: its gift is the charge alone.
export function traceMessages(run: Readonly<RunState>): InboxMessage[] {
  if (run.map.world !== 'arm' || !traceBuilt('stay') || run.traces.from === null) return [];
  const stay = run.traces.from.ending.stay;
  const place = run.traces.places.find((candidate) => candidate.kind === 'stay');
  if (stay === null || place === undefined) return [];
  const stop = run.map.route.find((candidate) => candidate.slot === place.slot);
  if (stop === undefined) return [];
  const received = stop.hop?.approachYear ?? armShipAt(run.map, place.slot).approachYear;
  const sent = Math.max(stay.year, received - Math.ceil(distLy(stay.slot, place.slot)));
  const letter = TRACE_TEXT.stayLetter;
  return [{
    id: `trace:stay:${place.slot}`, kind: 'letter', from: letter.from(stay.colony, unitName(run.traces.from.unit)),
    sentYear: sent, receivedYear: received, readAtDepth: stop.depth, subject: letter.subject(stay.colony),
    body: [...letter.lines(stay.colony, sent - stay.year)], tag: INBOX_TEXT.window.forUnit(run.unitNumber), tone: 'colony',
  }];
}
