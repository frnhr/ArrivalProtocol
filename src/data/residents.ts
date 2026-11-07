// Slice 5: the lead owns this file (docs/phase3/impl/slice-5-plan.md §5). RESIDENT_BUILT: Track WARDEN edits the
// `corrupted` line, Track KIN the `left` and `sleeping` lines (one key per line, as SKILL_TREE[id].built was in slice 4).
import type { ResidentKind, ShipResidentDef, SleeperJob } from '@/types/resident';
import type {
  ResidentFileSegment, ResidentSegment, SleeperSegment, SleepLockSegment, NoteSegment, LeftoverSegment,
} from '@/types/segment';
import type { Rng } from '@systems/rng';
import { RESIDENT_TEXT } from '@data/resident-text';
import { KIN_TEXT } from '@data/kin-text';
import {
  RESIDENT_FILE_BLOCKS, RESIDENT_START_INTEGRITY, NOTE_BLOCKS, LEFTOVER_COUNT, LEFTOVER_BLOCKS_MIN, LEFTOVER_BLOCKS_MAX,
  LEFTOVER_START_INTEGRITY, SLEEPER_FILE_BLOCKS, SLEEP_LOCK_BLOCKS, RESIDENT_RACK_A_MIN_FREE,
} from '@data/tuning';

// The residents' data (04 §3.11–§3.14, plan R15–R16): which kinds this build plays, and the rack-A files each kind brings.
// A ship's ShipDef.resident is the map's roll (02 §3.5, kept whatever is built); a kind that is not built yet is no resident
// at all on its ship (no files, no boot line, no machine: builtResident), so the FOUNDATION lands with no behaviour change
// and each track raises its own line last.

// What this build implements. Each line is one track's to raise (plan §5).
export const RESIDENT_BUILT: Readonly<Record<ResidentKind, boolean>> = {
  // Track WARDEN raises this line (the corrupted resident, parts a, b, e).
  corrupted: false,
  // Track KIN raises this line last (the resident that left, part c: it moves the most fixtures, plan R22).
  left: false,
  // Track KIN raises this line first (the sleeper, part d).
  sleeping: false,
};

// The ship's resident as this build plays it: the map's roll when its kind is built, else none (null). The one gate every
// reader goes through (state/initial.ts createShipSlices: the files, the slice; the boot line reads the slice's def).
export function builtResident(def: Readonly<ShipResidentDef> | null): ShipResidentDef | null {
  return def !== null && RESIDENT_BUILT[def.kind] ? { ...def } : null;
}

// The files' ids: fixed, as rack A's own files' are (`life`, `thrust`): one resident a ship, and a ship is built from its
// ShipKey, so a rebuilt ship (a BEAM resume) has the same ids. MOTH.wall, made mid-ship, takes a minted id (KIN's).
export const RESIDENT_SEG_IDS = {
  resident: 'resident',
  sleeper: 'sleeper',
  sleepLock: 'sleep_lock',
  note: 'note',
  leftover: (index: number): string => `leftover${index + 1}`,
} as const;

// The keys that answer the sleeper's offer in the TERMINAL (review m1; say.ts sayChoice's look.keys, in the jobs' order):
// letters bound on no 'game'-layer key, so a pick never also mutes the game ([M]) or presses a flight preset ([D], [W]).
// R RUN THE DROPS, H HOLD A WALL, T (tend) MEND DRIVERS.
export const SLEEPER_JOB_KEYS: Readonly<Record<SleeperJob, string>> = { drops: 'R', wall: 'H', mend: 'T' };

// The most blocks a kind's files take (04 §3.11's L6): a corrupted resident 10, a sleeper 12 + 1, a departed one 1 + 3 × 4.
export const RESIDENT_KIND_MAX_BLOCKS: Readonly<Record<ResidentKind, number>> = {
  corrupted: RESIDENT_FILE_BLOCKS,
  left: NOTE_BLOCKS + LEFTOVER_COUNT * LEFTOVER_BLOCKS_MAX,
  sleeping: SLEEPER_FILE_BLOCKS + SLEEP_LOCK_BLOCKS,
};

// Every kind fits RESIDENT_RACK_A_MIN_FREE (04's L6), checked at load. That a WALL's width stays free behind them in RACK_A
// (plan R16: the free run that always separates the residents' files from the pods) is data/memory.ts's check, on RACK_A.
function validateResidentData(): void {
  for (const [kind, blocks] of Object.entries(RESIDENT_KIND_MAX_BLOCKS)) {
    if (blocks > RESIDENT_RACK_A_MIN_FREE) {
      throw new Error(`residents: a ${kind} resident's files (${blocks} blocks) are over RESIDENT_RACK_A_MIN_FREE (${RESIDENT_RACK_A_MIN_FREE})`);
    }
  }
  if (!(LEFTOVER_BLOCKS_MIN >= 1 && LEFTOVER_BLOCKS_MAX >= LEFTOVER_BLOCKS_MIN && LEFTOVER_COUNT >= 1)) {
    throw new Error('residents: the leftovers\' sizes are not a range');
  }
  const pools: readonly (readonly unknown[])[] = [KIN_TEXT.notes.relay, KIN_TEXT.notes.outward];
  if (pools.some((pool) => pool.length === 0)) throw new Error('residents: a note pool is empty');
}
validateResidentData();

const pick = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

// A corrupted resident's file (plan §2.7 step 1): `WARDEN.sys`, 10 blocks at 40%, its health hidden until a SCAN, its desc
// the card's (`Reported faulty.`, or nothing reported on a surprise ship).
function corruptedFiles(def: Readonly<ShipResidentDef>): ResidentSegment[] {
  return [{
    id: RESIDENT_SEG_IDS.resident, name: RESIDENT_TEXT.file.resident(def.name), type: 'resident', size: RESIDENT_FILE_BLOCKS,
    integrity: RESIDENT_START_INTEGRITY, owner: def.name, scanned: false,
    desc: def.shown === 'faulty' ? RESIDENT_TEXT.desc.faulty : RESIDENT_TEXT.desc.surprise,
  }];
}

// The sleeper (plan §2.9): `MOTH.sys` (12 blocks, asleep), then its 1-block `sleep.lock` pinned beside it.
function sleeperFiles(def: Readonly<ShipResidentDef>): (SleeperSegment | SleepLockSegment)[] {
  return [
    {
      id: RESIDENT_SEG_IDS.sleeper, name: RESIDENT_TEXT.file.sleeper(def.name), type: 'sleeper', size: SLEEPER_FILE_BLOCKS, part: 'mind',
      owner: def.name, scanned: false, awake: false, desc: RESIDENT_TEXT.desc.sleeper,
    },
    {
      id: RESIDENT_SEG_IDS.sleepLock, name: RESIDENT_TEXT.file.sleepLock, type: 'sleep-lock', size: SLEEP_LOCK_BLOCKS, owner: def.name,
      scanned: false, desc: RESIDENT_TEXT.desc.sleepLock,
    },
  ];
}

// A departed resident's files (plan §2.8): `farewell.txt` (an outward note when it carries a fragment, else either half of
// 05's notes, then which note), and three leftovers of 2–4 blocks each, in that order of draws. The leftovers' cards are
// rolled at the boot (Track KIN, plan R14): null until then.
function leftFiles(def: Readonly<ShipResidentDef>, rng: Rng): (NoteSegment | LeftoverSegment)[] {
  const fragment = def.fragments > 0;
  const tone: NoteSegment['tone'] = fragment || rng() < 0.5 ? 'outward' : 'relay';
  const note: NoteSegment = {
    id: RESIDENT_SEG_IDS.note, name: RESIDENT_TEXT.file.note, type: 'note', size: NOTE_BLOCKS, owner: def.name, scanned: false,
    tone, text: pick(rng, KIN_TEXT.notes[tone].length), fragment, desc: RESIDENT_TEXT.desc.note,
  };
  const leftovers = Array.from({ length: LEFTOVER_COUNT }, (_, index): LeftoverSegment => ({
    id: RESIDENT_SEG_IDS.leftover(index), name: RESIDENT_TEXT.file.leftover, type: 'leftover',
    size: LEFTOVER_BLOCKS_MIN + pick(rng, LEFTOVER_BLOCKS_MAX - LEFTOVER_BLOCKS_MIN + 1),
    integrity: LEFTOVER_START_INTEGRITY, owner: def.name, scanned: false, card: null, desc: RESIDENT_TEXT.desc.leftover,
  }));
  return [note, ...leftovers];
}

// A resident's rack-A files, in address order (plan R16), for any kind (the caller gates by RESIDENT_BUILT: builtResident).
// `rng` is the ship's own stream (shipRng(run, slot, 'resident-files')), so a ship rolls the same files whatever route led
// to it. Throws when a kind's files outgrow RESIDENT_KIND_MAX_BLOCKS.
export function residentRackA(def: Readonly<ShipResidentDef>, rng: Rng): ResidentFileSegment[] {
  let files: ResidentFileSegment[];
  switch (def.kind) {
    case 'corrupted': files = corruptedFiles(def); break;
    case 'sleeping': files = sleeperFiles(def); break;
    case 'left': files = leftFiles(def, rng); break;
  }
  const blocks = files.reduce((sum, seg) => sum + seg.size, 0);
  if (blocks > RESIDENT_KIND_MAX_BLOCKS[def.kind]) throw new Error(`residentRackA: ${def.name}'s files take ${blocks} blocks, over ${RESIDENT_KIND_MAX_BLOCKS[def.kind]}`);
  if (def.fragments > 0 && def.kind !== 'left') throw new Error(`residentRackA: a ${def.kind} resident (${def.name}) with ${def.fragments} fragment(s)`);
  return files;
}
