import type { FsToolKind } from '@/types/fs-tool';
import type { FsToolSegment, SegmentRole } from '@/types/segment';
import {
  INTEGRITY_MAX, REPAIR_BASE_SEC, REPAIR_PER_BLOCK_SEC, REPAIR_V2_HEAL_MULT, REPAIR_V2_VERSION,
} from '@data/tuning';

export const TOOL_ICONS: Record<FsToolKind, string> = {
  scan: '◎',
  repair: '▸',
  move: '⇒',
  copy: '+',
  delete: '×',
  swap: '⇄',
};

// The word on each tool's chip, and in ARRIVAL CONTROL's licence line.
export const TOOL_WORD: Record<FsToolKind, string> = {
  scan: 'SCAN',
  repair: 'REPAIR',
  move: 'MOVE',
  copy: 'COPY',
  delete: 'DELETE',
  swap: 'SWAP',
};

// Every filesystem tool kind, in chip-row order: the chip row, the hand's body classes and the
// licences all read this one list, so a new tool (WP10's SWAP) is added once.
export const FS_TOOL_KINDS: readonly FsToolKind[] = ['scan', 'repair', 'move', 'copy', 'delete', 'swap'];

// The id of each tool's chip in index.html (`#chip-repair`). Its data-hint-target is the same.
export function toolChipId(kind: FsToolKind): string {
  return `chip-${kind}`;
}

// The data-hint-target of each tool's chip: a strip line that names a tool lights its chip with
// this (ObjectiveStrip), and a line pointing at a tool not yet licensed is the moment to issue it
// (systems/licences.ts).
export const TOOL_HINT_TARGET: Readonly<Record<FsToolKind, string>> = {
  scan: toolChipId('scan'),
  repair: toolChipId('repair'),
  move: toolChipId('move'),
  copy: toolChipId('copy'),
  delete: toolChipId('delete'),
  swap: toolChipId('swap'),
};

// The data-hint-target of the file that does a role's job (SegmentBlock puts it on the file's
// first part): a strip line can point at the file to click, whichever copy or address it has.
export function fileHintTarget(role: SegmentRole): string {
  return `file-${role}`;
}

// The data-hint-target of a filesystem tool's file (`tool-file-repair`, WP10): a tool file has no role, and the strip's
// COPY lesson points at the Repair file to copy, whichever copy or address it has (the first part of each copy).
export function toolFileHintTarget(kind: FsToolKind): string {
  return `tool-file-${kind}`;
}

// The data-hint-target of a flight window's title pip for a role (`pip-thrust-ctrl`, WP10): the strip's ghost-thrust
// lesson lights the THRUST CTRL pip that leads to the file (components/tools-view/WindowGrip).
export function pipHintTarget(role: SegmentRole): string {
  return `pip-${role}`;
}

// The data-hint-target of a FIREWALL.sys chip (WP8): a card's file has no role, and the strip's FIREWALL line lights
// the one still to place. One per file (WP12 p3, WP8 verify): with two FIREWALLs a shared target lit both, the one
// already holding too.
export function firewallHintTarget(segId: string): string {
  return `file-firewall-${segId}`;
}

// The data-hint-target of every seed HOLLOW dropped (WP9): the strip's `RM THE SEED` lights them once DELETE
// is in hand.
export const SEED_HINT_TARGET = 'hollow-seed';

// The data-hint-target of HOLLOW's root once LAST LIGHT's duel has opened it (WP11): `DELETE THE ROOT` lights it once
// DELETE is in hand.
export const ROOT_HINT_TARGET = 'hollow-root-open';

// The data-hint-target of a pod driver's chip (`driver-pod02`): drivers have no role, so a strip line that names one
// (POD 02 WILL LAND HARD) points at it by the label the strip uses (selectors fileLabel: `POD 02`).
export function podHintTarget(label: string): string {
  return `driver-${label.replace(/\s+/g, '').toLowerCase()}`;
}

// What a "REPAIR <file>" line lights in the mind: the REPAIR chip until the tool is in hand, then
// the file to click (the ENGINE I/O tutorial, and F1/F2 shown in blue). `target` is the file's own
// data-hint-target (fileHintTarget for a role, podHintTarget for a driver).
export function repairStepTarget(heldKind: FsToolKind | null, role: SegmentRole): string {
  return toolStepTarget('repair', heldKind, fileHintTarget(role));
}

// The same two steps for any tool: its chip until it is in hand, then the thing to click with it.
export function toolStepTarget(kind: FsToolKind, heldKind: FsToolKind | null, target: string): string {
  return heldKind === kind ? target : TOOL_HINT_TARGET[kind];
}

// Integrity points a REPAIR heals per AI second (§6.5): a small file heals fast, a big one slowly;
// v2 doubles it. Pure data, so the ship validator (heal beats HOLLOW's drain, data/ships.ts) and
// the repair op (state/actions.ts) use the one formula.
export function repairRatePerSec(size: number, version: number): number {
  const base = INTEGRITY_MAX / (REPAIR_BASE_SEC + REPAIR_PER_BLOCK_SEC * size);
  return version >= REPAIR_V2_VERSION ? base * REPAIR_V2_HEAL_MULT : base;
}

// Highest known revision per tool kind. Drives the version-demo slider's
// upper bound. A max of 1 = no upgrade path exists yet for that tool, so
// the slider is rendered disabled. Add to the map as new versions ship.
//
//   repair  v2 — compacts the Redundancy segment, freeing the wasted blocks
//                between `used` and `size` as free space.
export const TOOL_MAX_VERSION: Record<FsToolKind, number> = {
  scan: 1,
  repair: 2,
  move: 1,
  copy: 1,
  delete: 1,
  swap: 1,
};

// The files a licence installs (§3.2, §6.5: a tool exists only while its file does). REPAIR
// comes with a .bak, so one bad copy never ends repairs for the run. Ids are the seed's own
// (no '~', so they can't collide with runtime ids); game code finds tools by kind, never by id.
interface ToolFileDef {
  id: string;
  name: string;
  size: number;
  desc: string;
}

export const TOOL_FILES: Readonly<Record<FsToolKind, readonly ToolFileDef[]>> = {
  scan: [{
    id: 't_scan', name: 'Scan', size: 3,
    desc: 'Filesystem utility. Reveals the integrity of a ship file. Your own files you can always see; the ship\'s damage stays hidden until scanned.',
  }],
  repair: [
    {
      id: 't_repair', name: 'Repair', size: 4,
      // Final review: it said only "a damaged AI file", though healing the colonists is most of what it does.
      desc: "Filesystem utility. Heals your AI files and the colonists, point by point, paid with REPAIR CHARGE. Ship files can't be healed: SWAP or DELETE them.",
    },
    {
      id: 't_repair_bak', name: 'Repair.bak', size: 4,
      desc: 'Backup copy of Repair. If Repair gets damaged, this one keeps working. Keep at least one copy healthy.',
    },
  ],
  move: [{
    id: 't_move', name: 'Mv', size: 2,
    desc: 'Filesystem utility. Moves a file to a new address. The file is offline while it moves; takes time proportional to size.',
  }],
  copy: [{
    id: 't_copy', name: 'Cp', size: 3,
    desc: 'Filesystem utility. Copies a file. The original keeps working while it is read; slower than a move.',
  }],
  delete: [{
    id: 't_delete', name: 'Rm', size: 1,
    desc: 'Filesystem utility. Frees the space a file takes. What is deleted is gone.',
  }],
  // WP10 (§6.5, §8): the old INSPECT swap button as a file, licensed at VESPER's first uncommanded burst.
  swap: [{
    id: 't_swap', name: 'Swap', size: 1,
    desc: 'Filesystem utility. Hands a ship file\'s job to its backup copy (Thrust Controller → Thrust.alt). The old file is switched off as .old. Takes a thread while it runs; costs no REPAIR CHARGE.',
  }],
};

// The fresh segments of a tool's files. Tool files are the AI's own, so they are always visible
// (§3.2): no scan needed to see their health.
export function createToolFiles(kind: FsToolKind): FsToolSegment[] {
  return TOOL_FILES[kind].map((file) => ({
    id: file.id,
    name: file.name,
    type: 'fs-tool',
    size: file.size,
    integrity: 100,
    scanned: true,
    version: 1,
    fsTool: kind,
    desc: file.desc,
  }));
}

interface ToolHint {
  stage1: string;
  stage2?: string;
  stage1V2?: string;   // Repair v2 also squeezes REPAIR CHARGE
}

// What to click next, under the held tool (systems/tool-targets.ts heldToolHint picks the line).
export const TOOL_HINTS: Record<FsToolKind, ToolHint> = {
  scan:       { stage1: 'select a file to check' },
  repair:     {
    stage1: 'select damaged file',
    stage1V2: 'select damaged file or repair charge',
  },
  delete:     { stage1: 'select file to delete' },
  move:       { stage1: 'select file to move',  stage2: 'select free destination' },
  copy:       { stage1: 'select file to copy',  stage2: 'select free destination' },
  swap:       { stage1: 'select a ship file with a backup' },
};
