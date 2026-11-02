import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { RunMapState } from '@/types/map';
import { onPostTick, isLivePhase } from '@systems/clock';
import { replaceRange, mergeAdjacentFree, segmentStarts, assertMemoryInvariants, newSegId } from '@systems/memory-ops';
import { isOpenFree } from '@systems/tool-targets';
import { say } from '@systems/say';
import { emit } from '@systems/events';
import { mindAlertActive } from '@systems/alerts';
import { createToolFiles, TOOL_HINT_TARGET } from '@data/fs-tools';
import { layoutOf, isUnitFileType } from '@data/memory';
import { LICENCE_LINES } from '@data/script';
import { CLASSIC_LICENCES } from '@data/classic-five';
import { IS_DEV } from '@/env';
import { playsTutorial } from '@systems/meta';
import { hasUsableTool } from '@state/selectors';

// A licence ARRIVAL CONTROL issues on a ship this many AI seconds into the flight (§6.5: MOVE at
// HALCYON boot + 25 s), or, with atCoast, as soon as the coast begins if that is sooner (the strip's
// first WAIT: the tool arrives for the fight it is for, WP7), or, with atFirstSeed, at the first seed's
// telegraph (§6.5: DELETE at KESTREL's first seed, WP9: the tool arrives with the thing it removes).
// afterAiSec null: only the moment issues it. A licence never issued by then (the ship was lost first) is
// issued at the next ship's start: the tools a later ship expects are always there. With atFirstGhost, at the
// ship's first uncommanded burst (§6.5: SWAP at VESPER's first ghost onset, WP10: the fix arrives with the problem).
// Phase 2's ShipDef.licences; the classic five's are data/classic-five.ts CLASSIC_LICENCES (slice-3a-plan §2.2).
export interface TimedLicence {
  kind: FsToolKind;
  afterAiSec: number | null;
  atCoast: boolean;
  atFirstSeed: boolean;
  atFirstGhost: boolean;
}

// Licences (§3.2, §6.5, TASK 700): a filesystem tool exists only while a live copy of its file
// does, and ARRIVAL CONTROL issues new tools as files during the run. Installing a licence is
// unlocking it: the tool's files transmit into memory (transmitIn, a chime, the chip slides in)
// and CONTROL says so. DOM-free; the chip row reads the files (components/memory-view/FsStatusBar).
//
// Placement: each file goes at the start of the LAST open free region that fits it, scanning
// back from the end of memory: the receiver's free run right after REPAIR CHARGE (the unit's block is files, seeds, then
// the charge, from rack E's start), on every memory class (slice 3a: a TIGHT ship's receiver is rack E alone, it has no
// rack F), so new tools land next to the old ones and REPAIR CHARGE. A full receiver sends the file to the last free
// run among the pods. Space a running move or copy reserved is never used. No room at
// all is a design error (a layout that can't take its own licences), so it throws.

export function isLicensed(state: Readonly<GameState>, kind: FsToolKind): boolean {
  return state.run.licences.includes(kind);
}

// The address a new file of `size` blocks goes to (see the header).
export function installAddress(memory: readonly Segment[], size: number): number {
  const starts = segmentStarts(memory);
  const charge = memory.findIndex((seg) => seg.type === 'redundancy');
  for (let i = memory.length - 1; i >= 0; i--) {
    const seg = memory[i]!;
    if (!isOpenFree(seg) || seg.size < size) continue;
    // A receiver with no room after REPAIR CHARGE (a TIGHT ship's unit spilled back into the tail, slice 3a): the file
    // goes flush against the unit's block from below, not at the far end of the pod rack's free run.
    // That region ends at the AI Core (the block's start); a free run inside the receiver keeps the rule above.
    if (charge >= 0 && i < charge && memory[i + 1]?.type === 'core' && memory.slice(i + 1, charge).every(isUnitFileType)) {
      return starts[i]! + seg.size - size;
    }
    return starts[i]!;
  }
  throw new Error(`licences: no free space for a ${size}-block tool file`);
}

// Writes a licence's files into memory (see the header for where), with fresh ids when `freshIds` (a reissue: an
// eaten or broken old copy may still hold the licence's own ids).
function writeToolFiles(store: Store<GameState>, kind: FsToolKind, freshIds: boolean): Segment[] {
  const memory = store.getState().memory;
  const files = createToolFiles(kind).map((file) => (freshIds ? { ...file, id: newSegId(file.id) } : file));
  for (const file of files) {
    const addr = installAddress(memory, file.size);
    replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
  }
  mergeAdjacentFree(memory);
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  return files;
}

// Installs a licence's files and records it, and ARRIVAL CONTROL says so. A licence is issued once per run
// (its files carry with the unit), so a second install of the same kind is a bug and throws.
export function installTool(store: Store<GameState>, kind: FsToolKind): Segment[] {
  const files = grantLicence(store, kind);
  say('control', LICENCE_LINES[kind], { critical: true });
  return files;
}

// The files and the record, with the licence's sound ('licence') but not CONTROL's line: the boot's REPAIR
// arrives with the chip, and its line waits for CONTROL's hello (data/script.ts 'control-boot-licence').
function grantLicence(store: Store<GameState>, kind: FsToolKind): Segment[] {
  const state = store.getState();
  if (isLicensed(state, kind)) throw new Error(`installTool: '${kind}' is already licensed`);
  const files = writeToolFiles(store, kind, false);
  store.update((draft) => {
    draft.run.licences.push(kind);
    // HOLLOW leaves a tool alone until the kid has used it on the ship it arrived on (HollowState.untriedTools).
    if (kind !== 'repair') draft.hollow.untriedTools.push(kind);
    draft.ui.memoryRev++;
  });
  emit('licence', { kind });
  return files;
}

// When ARRIVAL CONTROL issues each licence. REPAIR (with Repair.bak, §5.1) the first time the kid
// jacks in during a flight, or the first moment something needs it from amber: a line on the strip
// pointing at the REPAIR chip, or a mind alert (an infection, WP6; the only cure is a repair). That is
// ship 1 in a normal run, but any ship if it never happened there (a crash before the kid looked inside).
// Then each ship's own timed licences (the classic five's CLASSIC_LICENCES, re-flowed by slice-2-plan §3.2: DELETE at KESTREL's start, MOVE
// at its coast, COPY at VESPER's boot, SWAP at its first uncommanded burst): on their ship once that many AI seconds of
// the flight have passed, as the coast begins, as the first seed is telegraphed, or as the engine first fires by
// itself, and at the start of any later ship if that ship was lost before (so a later ship never lacks a tool it
// expects).
interface LicenceRule {
  kind: FsToolKind;
  due(state: Readonly<GameState>): boolean;
}

// Phase 3 slice 2: ships 1–2 are calm, so the scripted bite's mind alert no longer guarantees REPAIR on ship 1; like
// every ship's own licences, a REPAIR never issued on an earlier ship comes at the start of the next one the unit is
// transmitted to (a kid who never looked inside would otherwise reach KESTREL's PATH UNCERTAIN with no way to heal the
// sensor). A later ship built alone (a headless world, run.arrival null) keeps the old rule.
const REPAIR_RULE: LicenceRule = {
  kind: 'repair',
  due: (state) => state.run.arrival !== null
    || state.ui.mode === 'memory'
    || state.director.shown?.highlight === TOOL_HINT_TARGET.repair
    || mindAlertActive(state),
};

// Every licence due on the ship being flown, in order: REPAIR's own rule, then every ship's timed ones. `world` is the
// run's map (run.map.world): the classic five's schedule is CLASSIC_LICENCES by ship index; on the arm REPAIR's rule is the
// only one (phase 3 slice 3b, 02 §3.8: every other tool comes from the repository, by request; 3a's interim schedule by
// act is gone).
export function licenceSchedule(shipIndex: number, world: RunMapState['world'] = 'classic'): LicenceRule[] {
  const rules: LicenceRule[] = [REPAIR_RULE];
  if (world !== 'classic') return rules;
  CLASSIC_LICENCES.forEach((licences, index) => {
    if (index > shipIndex) return;
    for (const licence of licences) {
      rules.push({
        kind: licence.kind,
        due: (state) => index < shipIndex
          || (licence.afterAiSec !== null && state.clock.aiSec >= licence.afterAiSec)
          || (licence.atCoast && state.burn.coastAtAi !== null)
          || (licence.atFirstSeed && (state.hollow.seedTelegraph !== null || state.hollow.seedsLanded > 0))
          || (licence.atFirstGhost && state.burn.ghostBursts > 0),
      });
    }
  });
  return rules;
}

// The licences a returning unit has at the boot (§6.5 "On run 2+, Repair is licensed at boot", §5.2):
// REPAIR, issued during the ship-1 boot as the archive opens (systems/boot.ts), so the chip is there before
// the ENGINE I/O FAULT asks for it. CONTROL's licence line follows its hello once the flight starts
// (data/script.ts), so the impact is the first thing it says. The tutorial run earns REPAIR by looking
// inside (REPAIR_RULE).
export function installBootLicences(store: Store<GameState>): FsToolKind[] {
  const state = store.getState();
  if (playsTutorial(state.run) || isLicensed(state, 'repair')) return [];
  grantLicence(store, 'repair');
  return ['repair'];
}

// A copy of a tool the unit can rely on: usable (its chip shows) and not being eaten. A carried-in file that is
// still infected is eaten on arrival (§6.9 packs infections), so it does not count.
export function hasWorkingTool(state: Readonly<GameState>, kind: FsToolKind): boolean {
  return hasUsableTool(state.memory, kind, 'excluded');
}

// The lead's ruling (WP12, 2026-10-21 06:20): a unit that reaches a new ship with no working REPAIR gets it back.
// REPAIR is licensed once a run, and without it every later bite eats its file: a Repair lost on VESPER used to end
// the run on LAST LIGHT, the one way an earlier ship's mistake lost the whole run. So at the boot after a
// transmission, ARRIVAL CONTROL reissues the licence's files (fresh ids, the licence's sound and the chip sliding in)
// and says so once the flight starts (data/script.ts 'control-repair-renewed'). A designed rule, like the arrival
// charge floor: losing Repair still costs the ship where it happened. Returns whether it reissued.
// Phase 3 slice 3b: the copies this boot's deliveries brought do not count (a Repair.bak the kid asked for is a spare on
// top, never a reason to cancel the free renewal); the boot calls this at its first 'delivery' line, before the REPAIR v2
// patch installs (systems/delivery-boot.ts), and again at 'charge', where it is then a no-op.
export function renewRepairAtBoot(store: Store<GameState>): boolean {
  const state = store.getState();
  if (state.run.arrival === null || !isLicensed(state, 'repair')) return false;
  const delivered = new Set(state.run.arrival.deliveries.flatMap((delivery) => delivery.segIds));
  if (hasUsableTool(state.memory.filter((seg) => !delivered.has(seg.id)), 'repair', 'excluded')) return false;
  writeToolFiles(store, 'repair', true);
  store.update((draft) => {
    draft.run.repairRenewedOn = draft.run.shipIndex;
    draft.ui.memoryRev++;
  });
  emit('licence', { kind: 'repair' });
  return true;
}

let mounted = false;

// Checks the schedule after every tick of a live ship (the director's line of this tick
// included). say() and the install's store update happen here, in the tick, never inside a store
// listener. Not while paused (pause is look-only, §3.4: a kid who TABs into a paused game gets the
// licence on the first unpaused tick, the trigger still holding), and not once the ship is lost
// (an approval after "Oh no. :)" is just noise). Printing counts (WP5): a kid who never jacked in
// gets REPAIR when the hurt cluster's line points at it.
export function mountLicences(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLicences: already mounted');
  mounted = true;
  const offTick = onPostTick(() => {
    const state = store.getState();
    if (!isLivePhase(state) || state.clock.paused) return;
    for (const rule of licenceSchedule(state.run.shipIndex, state.run.map.world)) {
      if (isLicensed(store.getState(), rule.kind)) continue;
      if (rule.due(store.getState())) installTool(store, rule.kind);
    }
  });
  return () => { offTick(); mounted = false; };
}
