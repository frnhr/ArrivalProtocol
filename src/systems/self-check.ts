// Playtest 1, C-UNROLL (docs/phase3/impl/playtest-1-plan.md §3.5; Fran's notes 13 and 17): the boot's SELF-CHECK, the unroll.
// The unit comes online and looks around: the racks assemble, then the check walks its own files (racks E/F), the ship's
// (rack A, with the ship's arrival damage), the pod drivers, and whatever the packet did not carry, before the sensors come up.
// Every problem is found as the check reaches it, as a tag on the file (`−22% IN TRANSIT`, `ENGINE WEAK`, `POD 02` hurt,
// `NOT IN YOUR PACKET`): the damage already happened while the unit slept; the check only finds it. The first of each new
// kind on the run (046.log, a delivery, a seed, HOLLOW's blocks) holds the sweep and is named there; on a seed's hold ARRIVAL
// CONTROL says HOLLOW for the first time.
// This file is the pure plan (planSelfCheck: the steps, in order, from the boot's state and its line plan) and the check's
// shown state (which files are lit, the tags, the hold), which systems/boot.ts drives on wall time and
// components/memory-view/SelfCheck.ts paints. The boot's lines keep their own words, effects and record (data/script.ts
// bootLine); most are said as marks now (bootLineTyped false: logged, never typed), and each kind sits in its stage
// (bootLineStage).
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { CheckStage, CheckStep, CheckTag, CheckCue, FirstKind } from '@/types/self-check';
import { CHECK_STAGES } from '@/types/self-check';
import { bootLineStage, bootLogEntries, damagedAiFiles, type BootLineKind } from '@data/script';
import { SELF_CHECK_TEXT } from '@data/self-check-text';
import { layoutOf, rackOf } from '@data/memory';
import { segmentStarts } from '@systems/memory-ops';
import { hasIntegrity, integrityBand } from '@state/selectors';
import { BAND_COPY, CAPABILITY_ROLES, type CapabilityRole } from '@systems/capabilities';
import { faultsDue } from '@systems/faults';
import { sentryBootLineCount } from '@systems/sentry';
import { playsTutorial } from '@systems/meta';
import { currentStop } from '@systems/map-streams';
import { hashSeed } from '@systems/rng';
import { FILE_FAULTS } from '@data/script';

// The run's firsts, as director.done ids (saved with the run, like a beat's): the sweep holds on the first of each kind and
// names it there. CHECK_NAMED_HOLLOW: CONTROL has said the word HOLLOW (at the first seed), so the copy may from here on.
export const CHECK_FIRST_ID: Readonly<Record<FirstKind, string>> = {
  log: 'check-first-log',
  parcel: 'check-first-parcel',
  seed: 'check-first-seed',
  hollow: 'check-first-hollow',
};
export const CHECK_NAMED_HOLLOW = 'check-named-hollow';

// CONTROL has named HOLLOW on this run (plan §3.5: no copy says HOLLOW before it has).
export function hollowWordSaid(state: Readonly<Pick<GameState, 'director'>>): boolean {
  return state.director.done.includes(CHECK_NAMED_HOLLOW);
}

// The first words of a capability's band copy (`ENGINE WEAK · 40% POWER` → `ENGINE WEAK`): what a found fault does.
function effectWord(role: string | null | undefined, integrity: number): string | null {
  if (role === null || role === undefined || !(CAPABILITY_ROLES as readonly string[]).includes(role)) return null;
  return BAND_COPY[role as CapabilityRole][integrityBand(integrity)].split(' · ')[0]!;
}

function integrityOf(seg: Segment | undefined): number | null {
  return seg !== undefined && hasIntegrity(seg) ? seg.integrity : null;
}

const damage = (text: string, below: number): CheckTag => ({ text, tone: 'fault', stays: true, below });
const note = (text: string, tone: CheckTag['tone']): CheckTag => ({ text, tone, stays: false });

// The hits ECC corrected while the unit slept (a count, ArrivalReport.eccCorrected) tick back on that many of the unit's
// files that took no hit: which ones is not recorded, so they are picked by the ship's name, the same on every reload.
function eccFiles(candidates: readonly Segment[], count: number, salt: string): string[] {
  if (count <= 0 || candidates.length === 0) return [];
  const start = hashSeed(`ecc:${salt}`) % candidates.length;
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, candidates.length); i++) out.push(candidates[(start + i * 3) % candidates.length]!.id);
  return [...new Set(out)];
}

// The steps of this boot's SELF-CHECK, in the order the check plays them. `lines`: the boot's line plan (data/script.ts
// bootLinePlan), each kind placed in its stage in plan order (bootLineStage); the planner only adds the sweep around them.
export function planSelfCheck(state: Readonly<GameState>, lines: readonly BootLineKind[]): CheckStep[] {
  const memory = state.memory;
  const layout = layoutOf(state);
  const starts = segmentStarts(memory);
  const arrival = state.run.arrival;
  const done = state.director.done;
  const tutorial = playsTutorial(state.run);
  const rackOfSeg = new Map(memory.map((seg, i) => [seg.id, rackOf(starts[i]!, layout)]));
  const byId = new Map(memory.map((seg) => [seg.id, seg]));

  // What the packet did not carry (MANIFEST): 046.log, the deliveries, the beam's plain seeds (and those SENTRY names now),
  // HOLLOW's blocks. A disguised seed nothing names is swept as the file it shows.
  const deliveryIds = new Set((arrival?.deliveries ?? []).flatMap((delivery) => delivery.segIds));
  const sentryNames = sentryBootLineCount(state) > 0;
  const seedIds = new Set((arrival?.seeds ?? []).filter((seed) => seed.disguise === null || sentryNames).map((seed) => seed.segId));
  const manifestIds = new Set<string>();
  for (const seg of memory) {
    if (seg.type === 'log' || deliveryIds.has(seg.id) || seedIds.has(seg.id)) manifestIds.add(seg.id);
    else if (seg.type === 'hollow' && seg.disguise === undefined) manifestIds.add(seg.id);
  }
  // The ship's own arrival damage (KESTREL's Sensor Interp, VESPER's Thrust Ctrl) is found at SHIP, wherever its file is.
  const scripted = new Map((arrival?.scripted ?? []).map((hit) => [hit.segId, hit]));
  const stageOf = (seg: Segment): CheckStage | null => {
    if (seg.type === 'free') return null;
    if (manifestIds.has(seg.id)) return 'manifest';
    if (scripted.has(seg.id)) return 'ship';
    const rack = rackOfSeg.get(seg.id)!;
    if (rack === 'E' || rack === 'F') return 'self';
    return rack === 'A' ? 'ship' : 'hold';
  };

  // The tags the sweep finds on the unit's files: what the crossing took (summed per file), else (ship 1) what the unpack
  // took; the charge the arrival added; the hits ECC put back.
  const transit = new Map<string, number>();
  if (arrival !== null) {
    for (const hit of arrival.hits) transit.set(hit.segId, (transit.get(hit.segId) ?? 0) + (hit.from - hit.to));
  } else {
    const hurt = new Set(damagedAiFiles(state).map((file) => file.name));
    for (const seg of memory) {
      if ((seg.type === 'core' || seg.type === 'tool') && hurt.has(seg.name) && seg.integrity < 100) transit.set(seg.id, 100 - seg.integrity);
    }
  }
  const tagFor = new Map<string, { tag: CheckTag; cue: CheckCue }>();
  for (const [id, lost] of transit) {
    const live = integrityOf(byId.get(id));
    if (live !== null && lost > 0) tagFor.set(id, { tag: damage(SELF_CHECK_TEXT.tag.transit(lost), live), cue: 'fault' });
  }
  const unitFiles = memory.filter((seg) => stageOf(seg) === 'self' && hasIntegrity(seg) && !tagFor.has(seg.id));
  for (const id of eccFiles(unitFiles, arrival?.eccCorrected ?? 0, state.level.shipName)) {
    tagFor.set(id, { tag: note(SELF_CHECK_TEXT.tag.ecc, 'ecc'), cue: 'ecc' });
  }
  if (arrival !== null) {
    const added = arrival.starCredit + arrival.cardCharge + arrival.giftCharge + arrival.chargeFloorAdded;
    const charge = memory.find((seg) => seg.type === 'redundancy');
    if (charge !== undefined && added > 0) tagFor.set(charge.id, { tag: note(SELF_CHECK_TEXT.tag.charge(added), 'new'), cue: 'new' });
  }
  for (const [id, hit] of scripted) {
    const effect = effectWord(hit.role, hit.to);
    tagFor.set(id, { tag: damage(effect ?? SELF_CHECK_TEXT.tag.transit(hit.from - hit.to), hit.to), cue: 'fault' });
  }
  // The pods: a hurt driver is found as the sweep passes it.
  for (const seg of memory) {
    if (seg.type === 'driver' && seg.integrity < 100) tagFor.set(seg.id, { tag: damage(SELF_CHECK_TEXT.tag.transit(100 - seg.integrity), seg.integrity), cue: 'pod' });
  }

  const steps: CheckStep[] = [];
  // Each planned line once, in plan order within its kind: `placed` holds the plan indexes already stepped.
  const placed = new Set<number>();
  const lineSteps = (stage: CheckStage, kinds: readonly BootLineKind[]): void => {
    const seen = new Map<BootLineKind, number>();
    lines.forEach((kind, index) => {
      const ordinal = seen.get(kind) ?? 0;
      seen.set(kind, ordinal + 1);
      if (placed.has(index) || bootLineStage(kind) !== stage || !kinds.includes(kind)) return;
      placed.add(index);
      steps.push({ stage, kind: 'line', line: kind, ordinal });
    });
  };
  const fileStep = (stage: CheckStage, seg: Segment, over?: { tag: CheckTag; cue: CheckCue }): void => {
    const found = over ?? tagFor.get(seg.id) ?? null;
    steps.push({ stage, kind: 'file', segIds: [seg.id], tag: found?.tag ?? null, cue: found?.cue ?? 'tick' });
  };
  const inStage = (stage: CheckStage): Segment[] => memory.filter((seg) => stageOf(seg) === stage);
  const linesOf = (stage: CheckStage): BootLineKind[] => lines.filter((kind) => bootLineStage(kind) === stage);

  // RECEIVE: the sleep, the unpack and the host (the racks assemble meanwhile: TitleCard's rows).
  lineSteps('receive', linesOf('receive'));

  // SELF: ECC's record first (its words are the marks the sweep then shows), the sweep of racks E/F, then the lines about
  // what the unit carries (a trace's gift, the charge, a FIREWALL compiled, an overflow, a skill trained).
  const selfLines = linesOf('self');
  lineSteps('self', selfLines.filter((kind) => kind === 'ecc-sleep' || kind === 'ecc'));
  for (const seg of inStage('self')) fileStep('self', seg);
  lineSteps('self', selfLines);

  // SHIP: rack A, then the files the ship's own arrival damage is on (their line is the record), then ship 1's ENGINE I/O
  // FAULT found as the check reaches the engine, then a POOR planet's site data.
  const shipFiles = inStage('ship');
  for (const seg of shipFiles.filter((seg) => !scripted.has(seg.id))) fileStep('ship', seg);
  lineSteps('ship', ['scripted']);
  for (const seg of shipFiles.filter((seg) => scripted.has(seg.id))) fileStep('ship', seg);
  for (const fault of faultsDue(state)) steps.push({ stage: 'ship', kind: 'fault', faultId: fault.id });
  lineSteps('ship', linesOf('ship'));

  // HOLD: the pod racks.
  for (const seg of inStage('hold')) fileStep('hold', seg);

  // MANIFEST: what the packet did not carry, each kind with its line, the first of each kind on the run held and named; then
  // the story's lines (HOLLOW's reading line, the log key, the mail, the lineage, HOLLOW's own line, which closes the boot).
  const manifest = inStage('manifest');
  const first = (kind: FirstKind, segIds: string[]): void => {
    if (done.includes(CHECK_FIRST_ID[kind]) || segIds.length === 0) return;
    steps.push({ stage: 'manifest', kind: 'first', first: kind, segIds, hold: tutorial });
  };
  const logFile = manifest.find((seg) => seg.type === 'log');
  if (logFile !== undefined) {
    const keyed = lines.includes('log');
    const entries = keyed ? bootLogEntries(state) : [];
    const key = entries.length === 0 ? null : entries.length === 1
      ? `ENTRY ${String(entries[0]).padStart(2, '0')}`
      : `ENTRIES ${String(Math.min(...entries)).padStart(2, '0')}–${String(Math.max(...entries)).padStart(2, '0')}`;
    const isFirst = !done.includes(CHECK_FIRST_ID.log);
    if (keyed) lineSteps('manifest', ['log']);
    fileStep('manifest', logFile, isFirst ? { tag: note(SELF_CHECK_TEXT.tag.log, 'foreign'), cue: 'new' }
      : key !== null ? { tag: note(SELF_CHECK_TEXT.tag.logKey(key), 'new'), cue: 'new' } : undefined);
    first('log', [logFile.id]);
  }
  const deliveries = arrival?.deliveries ?? [];
  if (deliveries.length > 0) {
    const hop = currentStop(state.run).hop;
    lineSteps('manifest', ['delivery']);
    for (const delivery of deliveries) {
      const waited = hop === null ? 0 : Math.max(0, hop.approachYear - delivery.arrivedYear);
      for (const id of delivery.segIds) {
        const seg = byId.get(id);
        if (seg === undefined) continue;
        // A delivery the crossing hit says so (a damage tag that stays), else how long it waited in the receiver.
        const lost = transit.get(id) ?? 0;
        const live = integrityOf(seg);
        fileStep('manifest', seg, lost > 0 && live !== null
          ? { tag: damage(SELF_CHECK_TEXT.tag.parcelHit(lost), live), cue: 'fault' }
          : { tag: note(SELF_CHECK_TEXT.tag.parcel(waited), 'new'), cue: 'new' });
      }
    }
    first('parcel', deliveries.flatMap((delivery) => delivery.segIds).filter((id) => byId.has(id)).slice(0, 1));
  }
  const seeds = manifest.filter((seg) => seedIds.has(seg.id));
  if (seeds.length > 0) {
    lineSteps('manifest', ['seeds', 'sentry-seed']);
    for (const seg of seeds) {
      const disguised = seg.type === 'hollow' && seg.disguise !== undefined;
      fileStep('manifest', seg, { tag: { text: disguised ? SELF_CHECK_TEXT.tag.sentrySeed : SELF_CHECK_TEXT.tag.seed, tone: 'seed', stays: true }, cue: 'seed' });
    }
    first('seed', [seeds[0]!.id]);
  }
  const hollow = manifest.filter((seg) => seg.type === 'hollow' && !seedIds.has(seg.id));
  for (const seg of hollow) {
    const root = seg.type === 'hollow' && seg.root === true;
    fileStep('manifest', seg, root ? { tag: { text: SELF_CHECK_TEXT.tag.hollow(seg.name, seg.size), tone: 'hollow', stays: true }, cue: 'seed' } : undefined);
  }
  const boardedRoot = arrival?.boarded !== null && arrival?.boarded !== undefined ? hollow.find((seg) => seg.type === 'hollow' && seg.root === true) : undefined;
  if (boardedRoot !== undefined) first('hollow', [boardedRoot.id]);
  for (const seg of manifest.filter((seg) => !steps.some((step) => step.kind === 'file' && step.segIds.includes(seg.id)))) fileStep('manifest', seg);
  // The record of a kind whose files are gone (a seed rm'd before a replayed boot) is still said, in its place.
  lineSteps('manifest', ['seeds', 'sentry-seed', 'delivery', 'log']);
  lineSteps('manifest', linesOf('manifest'));

  // Every line of the plan has its step, exactly once (fail loudly: a new kind with no stage would be lost).
  const planned = steps.filter((step) => step.kind === 'line').length;
  if (planned !== lines.length) {
    throw new Error(`planSelfCheck: ${planned} line steps for ${lines.length} planned lines (${lines.join(', ')})`);
  }
  return steps;
}

// --- The check as shown ---------------------------------------------------------------------------------------------------
// Module state, like the boot's own timers: what the strip shows of the check right now. The boot writes it, the view and the
// suites read it; a world reset (a new ship, a NEW RUN) clears it.

export interface ShownTag extends CheckTag {
  segId: string;
}

export interface CheckView {
  // The boot's stage, or null outside the boot (the tags that stay are still shown).
  stage: CheckStage | null;
  // The files the sweep has still to reach (dimmed until it does).
  pending: ReadonlySet<string>;
  // The file lit last (its flash), and the tags on the strip by file.
  lastLit: readonly string[];
  tags: ReadonlyMap<string, ShownTag>;
  // The first of a kind the sweep holds on (its files pulse), or null.
  hold: { first: FirstKind; segIds: readonly string[] } | null;
  rev: number;
}

let view: { stage: CheckStage | null; pending: Set<string>; lastLit: string[]; tags: Map<string, ShownTag>; hold: CheckView['hold']; rev: number } = freshView();

function freshView(): typeof view {
  return { stage: null, pending: new Set(), lastLit: [], tags: new Map(), hold: null, rev: 0 };
}

export function checkView(): CheckView {
  return view;
}

export function resetCheckView(): void {
  view = freshView();
}

export function checkSnapshot(): unknown {
  return { stage: view.stage, pending: view.pending.size, tags: view.tags.size, hold: view.hold };
}

// The check starts: every file the plan sweeps is dimmed.
export function beginCheckView(steps: readonly CheckStep[]): void {
  view = freshView();
  for (const step of steps) if (step.kind === 'file') for (const id of step.segIds) view.pending.add(id);
  view.stage = 'receive';
  view.rev++;
}

export function setCheckStage(stage: CheckStage | null): void {
  if (stage !== null && !CHECK_STAGES.includes(stage)) throw new Error(`setCheckStage: no stage '${String(stage)}'`);
  view.stage = stage;
  view.rev++;
}

export function lightFiles(segIds: readonly string[], tag: CheckTag | null): void {
  for (const id of segIds) {
    view.pending.delete(id);
    if (tag !== null) view.tags.set(id, { ...tag, segId: id });
  }
  view.lastLit = [...segIds];
  view.rev++;
}

export function setCheckTag(segId: string, tag: CheckTag): void {
  view.tags.set(segId, { ...tag, segId });
  view.rev++;
}

export function setCheckHold(hold: CheckView['hold']): void {
  view.hold = hold;
  view.rev++;
}

// The boot is over: nothing is pending, the hold is gone, and only the tags that stay are kept.
export function endCheckView(): void {
  view.pending.clear();
  view.hold = null;
  view.stage = null;
  view.lastLit = [];
  for (const [id, tag] of view.tags) if (!tag.stays) view.tags.delete(id);
  view.rev++;
}

// A tag that stays goes once its file is gone, or healed past what it was found at (the view and the suites ask; the boot
// does not tick in flight).
export function pruneCheckTags(state: Readonly<GameState>): boolean {
  let changed = false;
  for (const [id, tag] of view.tags) {
    const seg = state.memory.find((candidate) => candidate.id === id);
    const live = integrityOf(seg);
    const gone = seg === undefined || (seg.type === 'hollow' && tag.tone !== 'seed' && tag.tone !== 'hollow')
      || (tag.below !== undefined && live !== null && live > tag.below);
    if (gone) { view.tags.delete(id); changed = true; }
  }
  if (changed) view.rev++;
  return changed;
}

// The fault the SHIP stage finds (FILE_FAULTS by id).
export function checkFault(faultId: string) {
  const fault = FILE_FAULTS.find((candidate) => candidate.id === faultId);
  if (fault === undefined) throw new Error(`checkFault: no fault '${faultId}'`);
  return fault;
}

export function faultTag(role: string, integrity: number): CheckTag {
  return damage(effectWord(role, integrity) ?? SELF_CHECK_TEXT.tag.transit(100 - integrity), integrity);
}
