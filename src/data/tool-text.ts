import type { Segment, SegmentRole } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { DRIVER_TOOL_TEXT } from '@data/landing-text';
import { podTag } from '@data/pod-ids';
import { LOG_TEXT } from '@data/log-text';

// The words the filesystem tools say (WP3): why a click did nothing (shown next to the cursor),
// the inline confirm's questions, and the TERMINAL's line when a repair runs out of charge.
// Kept apart from script.ts so the pure targeting rules can import them without pulling in the
// voice and the director. tests/unit/wp3 tests render every one with worst-case names (≤ 70 chars) and
// check them against the §3.5 glossary.

// A refused tool action, in a few words. Every refusal also buzzes.
export const TOOL_REFUSAL = {
  paused: 'PAUSED',
  threads: 'ALL THREADS BUSY — WAIT FOR ONE',
  // WP11 (the lead's ruling of 20:55): while one of HOLLOW's verbs counts down, waiting lets it land. The kid filled the
  // thread it was telegraphed with, so the way to block it is to stop an op (its op bar's ×).
  threadsVerb: 'ALL THREADS BUSY — × AN OP TO BLOCK IT',
  noTool: 'THAT TOOL IS DAMAGED',
  busy: 'BUSY — WAIT FOR IT TO FINISH',
  notAFile: 'NOTHING TO DO THERE',
  locked: 'LOCKED',
  healthy: 'ALREADY 100%',
  shipFile: "SHIP FILES CAN'T BE HEALED — SWAP OR DELETE IT",
  // Slice 3b (the limping engine): the arm's Thrust Ctrl heals only to THRUST_CTRL_REPAIR_MAX; the rest is SWAP's.
  fieldRepairMax: 'HEALED AS FAR AS IT GOES — SWAP FOR THE REST',
  noCharge: 'NO REPAIR CHARGE LEFT',
  chargeBusy: 'REPAIR CHARGE IS IN USE',
  needsV2: 'NEEDS REPAIR v2',
  // The Core is you: one line per verb, so the refusal names what can't be done to it.
  coreDelete: "YOU CAN'T DELETE YOUR CORE",
  coreMove: "YOU CAN'T MOVE YOUR CORE",
  coreCopy: "YOU CAN'T COPY YOUR CORE",
  moveCharge: "REPAIR CHARGE CAN'T BE MOVED",
  copyCharge: "REPAIR CHARGE CAN'T BE COPIED",
  noRoom: 'NO ROOM THERE',
  sameSpot: 'ALREADY THERE',
  noBackup: 'NO BACKUP TO SWAP TO',
  // WP10: SWAP hands a SHIP file's job to its backup; the unit's own files are healed (REPAIR) or copied (COPY).
  swapShipOnly: 'SWAP IS FOR SHIP FILES WITH A BACKUP',
  // HOLLOW (§6.5, §6.6): a file being eaten can't be moved or copied until it is healed, and a block
  // it already ate is no file any more.
  infected: 'STILL INFECTED — REPAIR FIRST',
  eaten: 'THIS FILE WAS EATEN — ONLY DELETE WORKS',
  // A pod's driver (01-landing §3.8): always visible, so no scan, and never copied or deleted, so a mistake never costs
  // a pod. The last two are the spec's own sentences, not shouted.
  driverScan: DRIVER_TOOL_TEXT.scan,
  driverDelete: DRIVER_TOOL_TEXT.delete,
  driverCopy: DRIVER_TOOL_TEXT.copy,
  // The cards' files (WP8): a FIREWALL has no health to scan or heal (nothing can hurt it), and a card is
  // licensed to one unit (a COPY would deal it twice).
  firewallHealth: "NOTHING TO HEAL — NOTHING CAN HURT IT",
  cardCopy: "A CARD IS ONE UNIT'S — IT CAN'T BE COPIED",
  // 046.log (phase 3 slice 2, 05 §3.2): it can't be infected, moved, copied or deleted. SCAN reads it.
  logDelete: LOG_TEXT.refuseDelete,
  logMove: LOG_TEXT.refuseMove,
  logCopy: LOG_TEXT.refuseCopy,
  logRepair: LOG_TEXT.refuseRepair,
} as const;

export type ToolRefusal = (typeof TOOL_REFUSAL)[keyof typeof TOOL_REFUSAL];

// The inline confirm before a delete that can't be undone (§6.5): the question, and what it costs.
export interface ConfirmText {
  question: string;
  detail: string;
}

// "a 6-block gap", "an 8-block gap": the article a kid reads aloud (eight, eleven, eighteen and
// the eighties start with a vowel sound).
function blockGap(blocks: number): string {
  const article = /^(8|11|18)(\d\d)*$/.test(String(blocks)) || /^8/.test(String(blocks)) ? 'an' : 'a';
  return `${article} ${blocks}-block gap`;
}

export const CONFIRM_TEXT = {
  deleteCharge: (charge: number, blocks: number): ConfirmText => ({
    question: 'DELETE REPAIR CHARGE?',
    detail: `You lose ${charge} charge. Leaves ${blockGap(blocks)}.`,
  }),
  // A ship file, or the last working copy of one of your flight files: what it does to the
  // flight (DELETE_EFFECT), then the gap.
  deleteFile: (name: string, effect: string, blocks: number): ConfirmText => ({
    question: `DELETE ${name.toUpperCase()}?`,
    detail: `${effect} Leaves ${blockGap(blocks)}.`,
  }),
  // Names the chip that disappears: a file called Rm doesn't say it is the DELETE tool.
  deleteLastTool: (name: string, chip: string): ConfirmText => ({
    question: `DELETE ${name.toUpperCase()}?`,
    detail: `Your only ${chip.toUpperCase()} tool. The ${chip.toUpperCase()} chip disappears.`,
  }),
  yes: '✓ DELETE',
  no: '✗ KEEP',
} as const;

// What deleting a file does to the flight, by its role (§6.5: the confirm states the
// consequence). A file without a role does nothing for the flight either.
export const NO_FLIGHT_EFFECT = 'No flight effect.';
// What deleting a card's file does (WP8): the card goes with it.
export const DELETE_CARD_EFFECT = {
  firewall: 'Bites can pass there again.',
  'fuel-trim': 'No extra FUEL on arrival.',
  autoburn: 'No AUTOBURN.',
  // Phase 3 slice 3b: the REPAIR v2 patch installs and is used up at its boot, before DELETE can reach it; exhaustive.
  'repair-patch': 'Repair stays as it is.',
} as const;
export const DELETE_EFFECT: Readonly<Record<SegmentRole, string>> = {
  'engine-io': 'The engine stops.',
  'thrust-ctrl': 'The engine stops.',
  reactor: 'Thrust drops to 30%.',
  autopilot: 'W/A/S/D stop working.',
  sensor: 'The path goes grey.',
  navplot: 'The NAV PLOT goes dark.',
  telemetry: 'The numbers scramble.',
  comms: 'No BEAM OUT; a crash ends the run.',
  bay: 'No pod can launch.',
  core: "You can't delete yourself.",
  stasis: NO_FLIGHT_EFFECT,
  life: NO_FLIGHT_EFFECT,
  cargo: NO_FLIGHT_EFFECT,
  redundancy: 'You lose your REPAIR CHARGE.',
};

// ...for a ship file whose backup is still in memory (WP10 review): the loss is undone by a SWAP, and the confirm says
// so, so DELETE never reads as the cure for a misbehaving file (`The engine stops.` to a kid whose engine fires by
// itself). Every role a ship's data gives a backup has its line here (tool-targets.ts deleteQuestion throws otherwise).
export const DELETE_EFFECT_WITH_BACKUP: Partial<Readonly<Record<SegmentRole, (backup: string) => string>>> = {
  'thrust-ctrl': (backup) => `The engine stops till you SWAP in ${backup}.`,
};
// ...for a ship file another file does the same job as (a COPY of it, WP12 p3): nothing stops.
export const DELETE_EFFECT_OTHER_KEEPS = (other: string): string => `${other} keeps doing its job.`;

// The TERMINAL's line when a repair stops because REPAIR CHARGE ran out.
export const OP_LINES = {
  noCharge: (name: string): string => `> NO CHARGE · REPAIR OF ${name.toUpperCase()} STOPPED`,
} as const;

// --- The TERMINAL's command echoes (§9 WP6 item 11) ------------------------------------------------
// Every op the kid runs is echoed in the TERMINAL as a shell line once it ends, in the shape of the
// launch's echo (`> launch pod03 ... LZ-A`): the verb, the file, what came of it. A repair says what
// it cost, so the kid sees where REPAIR CHARGE went. A repair that runs out of charge says so with
// OP_LINES.noCharge instead (one line per op).

// The name a file goes by in an echo: lowercase, words joined by `_`, nothing but letters, digits,
// `.` and `_` (`engine_io`, `repair.bak`, `thrust_controller`); a driver by its pod (`pod03`); a block
// HOLLOW owns by its owner's name (`???`, later `unit-046`).
export function echoName(seg: Segment): string {
  if (seg.type === 'driver') return podTag(seg.pod);
  if (seg.type === 'hollow') return seg.owner.toLowerCase();
  return echoWord(seg.name);
}

// Any name as an echo writes it (`Thrust Controller` → `thrust_controller`; WP11: what an MV's block ate). A merged
// unit's `·` joins like a space (`UNIT-046·047` → `unit_046_047`, never the garbled-looking `unit_046047`).
export function echoWord(name: string): string {
  return name.toLowerCase().replace(/·/g, ' ').replace(/[^a-z0-9._ -]/g, '').trim().replace(/[ -]+/g, '_');
}

// What a scan found, in a word or two: the colonists' clue on the two files that hold it (Stasis keeps the pods'
// sleepers cold, Life Support keeps nobody breathing: they sleep in the pods), else the file's health.
// PLACEHOLDER: 05-story owns the words.
const SCAN_FINDS: Partial<Readonly<Record<SegmentRole, string>>> = {
  stasis: 'sleepers cold',
  life: '0 breathing',
};

export function scanFinding(role: SegmentRole | undefined, integrityPct: number | null): string {
  const find = role ? SCAN_FINDS[role] : undefined;
  if (find) return find;
  return integrityPct === null ? 'OK' : `${integrityPct}%`;
}

// `· −7 CHARGE`: what a repair took from REPAIR CHARGE (nothing when it took nothing).
function chargeSpent(charge: number, lost: boolean): string {
  if (charge <= 0) return '';
  return ` · −${charge} CHARGE${lost ? ' LOST' : ''}`;
}

// How an op that did not complete ended: the kid stopped it, or HOLLOW ate what it worked on.
export type OpEnding = 'stopped' | 'eaten';

export const OP_ECHO = {
  scan: (name: string, finding: string): string => `> scan ${name} ... ${finding}`,
  repair: (name: string, charge: number): string => `> repair ${name} ... OK${chargeSpent(charge, false)}`,
  // A stopped repair keeps what it healed and what it paid; an eaten one paid for nothing.
  repairEnded: (name: string, charge: number, ending: OpEnding): string =>
    `> repair ${name} ... ${ending === 'eaten' ? 'EATEN' : 'STOPPED'}${chargeSpent(charge, ending === 'eaten')}`,
  // Repair v2 on REPAIR CHARGE squeezes its spent blocks out as free space.
  squeeze: (name: string, freed: number): string => `> repair ${name} ... OK · +${freed} FREE`,
  delete: (name: string, freed: number): string => `> delete ${name} ... OK · +${freed} FREE`,
  // WP11: LAST LIGHT's root, deleted: what is left of it is one block (the finale's choice follows).
  deleteRoot: (name: string): string => `> delete ${name} ... ROOT GONE · 1 BLOCK LEFT`,
  done: (verb: 'move' | 'copy' | 'swap', name: string): string => `> ${verb} ${name} ... OK`,
  // WP10: a SWAP says which file now does the job.
  swap: (from: string, to: string): string => `> swap ${from} ${to} ... OK`,
  ended: (verb: FsToolKind, name: string, ending: OpEnding): string =>
    `> ${verb} ${name} ... ${ending === 'eaten' ? 'EATEN' : 'STOPPED'}`,
} as const;

// What INSPECT says of the two files after a SWAP (WP10 part 2): the ship's own words for them ("Inactive. Can be
// swapped in…", "If it fails, the engine starts firing by itself") no longer fit once the job has moved.
export const SWAP_DESC = {
  taking: 'The backup copy, now doing the job. It keeps its own health: a damaged backup still misbehaves.',
  old: 'Switched off by SWAP: it commands nothing now. Ship files can\'t be healed; DELETE frees its blocks.',
} as const;
