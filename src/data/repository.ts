// Slice 4: Track TREE owns this file (docs/phase3/impl/slice-4-plan.md §5.2): the four skl: restricted rows. Others
// ask by message.
import type { FsToolKind } from '@/types/fs-tool';
import type { RepoFileDef, RepoFileId, RestrictedRowDef } from '@/types/repo';
import type { FsToolSegment, Segment, UpgradeSegment } from '@/types/segment';
import { TOOL_FILES, createToolFiles } from '@data/fs-tools';
import { REPO_FILE_TEXT, RESTRICTED_WHY, REPO_TEXT } from '@data/repo-text';
import { REPAIR_PATCH_BLOCKS, INTEGRITY_MAX, MAX_LINE_CHARS } from '@data/tuning';

// The repository's catalogue v1 (02-map §3.8; slice-3b-plan §1.1 item 1, §4.1): what ARRIVAL CONTROL sends on request, as
// data. A tool file is a fresh copy of the tool's own file (data/fs-tools.ts, so its size and words are the tool's); the
// two new defs are Scan.bak (a spare SCAN) and the REPAIR v2 patch (an upgrade file, used up at its boot: systems/
// delivery-boot.ts). Every file is offered from the first desk (02 has no depth gate). A file the unit already has
// arrives as a spare copy. Pure and store-free; validateCatalogue runs at load. Track REPO owns this file after the
// foundation; 04 and 05 may add rows (02 §3.8), slice 4 adds the tree's `.skl` to RESTRICTED_ROWS.

// 3c's save carries this in its content check (02 §3.11): a save whose catalogue changed under it is refused, not misread.
// Bump it whenever a row's id, size or effect changes.
export const REPO_CATALOGUE_VERSION = 1;

// The AVAILABLE list's order (02 §3.8's table): the 1–7 keys request rows in this order.
export const REPO_FILE_IDS: readonly RepoFileId[] = ['mv', 'rm', 'cp', 'swap', 'repair-bak', 'scan-bak', 'repair-v2'];

// Each row's identity, as data (never words a text module may reword): the file's name in memory (a tool row's is the
// name of the tool file it copies) and what it gives. 3c's content check and every segment read these.
const REPO_FILE_DATA: Readonly<Record<RepoFileId, { name: string; gives: RepoFileDef['gives'] }>> = {
  mv: { name: 'Mv', gives: 'move' },
  rm: { name: 'Rm', gives: 'delete' },
  cp: { name: 'Cp', gives: 'copy' },
  swap: { name: 'Swap', gives: 'swap' },
  'repair-bak': { name: 'Repair.bak', gives: 'repair' },
  'scan-bak': { name: 'Scan.bak', gives: 'scan' },
  'repair-v2': { name: 'REPAIR v2 patch', gives: 'repair-v2' },
};

// Catalogue v1's sizes, pinned (validateCatalogue): a size is part of what 3c's save trusts, so a drift (a tool file
// resized in data/fs-tools.ts, the patch retuned) must come with a REPO_CATALOGUE_VERSION bump and a new pin, never quietly.
const V1_BLOCKS: Readonly<Record<RepoFileId, number>> = { mv: 2, rm: 1, cp: 3, swap: 1, 'repair-bak': 4, 'scan-bak': 3, 'repair-v2': 2 };

// The tool file a catalogue row copies (its def by name, so a renamed tool file fails loudly here, not on a desk). Scan.bak
// copies Scan (a backup is the same file under another name: the same size).
function copiedToolDef(id: RepoFileId): (typeof TOOL_FILES)[FsToolKind][number] | null {
  const gives = REPO_FILE_DATA[id].gives;
  if (gives === 'repair-v2') return null;
  const name = id === 'scan-bak' ? 'Scan' : REPO_FILE_DATA[id].name;
  const def = TOOL_FILES[gives].find((file) => file.name === name);
  if (def === undefined) throw new Error(`repository: no ${gives} tool file named ${name}`);
  return def;
}

export const REPO_FILES: Readonly<Record<RepoFileId, RepoFileDef>> = Object.fromEntries(REPO_FILE_IDS.map((id) => [id, {
  id, name: REPO_FILE_DATA[id].name, gives: REPO_FILE_DATA[id].gives, effect: REPO_FILE_TEXT[id].effect,
  blocks: copiedToolDef(id)?.size ?? REPAIR_PATCH_BLOCKS,
}])) as Record<RepoFileId, RepoFileDef>;

// The locked rows (02 §3.8: shown locked, never sent; no trace changes this list). Slice 4 appends the tree's skills as
// `skl:<id>` rows.
export const RESTRICTED_ROWS: readonly RestrictedRowDef[] = [
  { id: 'skl:autoburn', name: 'AUTOBURN.skl', why: RESTRICTED_WHY.skill },
  { id: 'thread-plus', name: 'THREAD+', why: RESTRICTED_WHY.system },
  { id: 'firewall-sys', name: 'FIREWALL.sys', why: RESTRICTED_WHY.system },
];

// The tool kind a delivery of `id` is a copy of, or null for the patch (it gives no tool: it upgrades Repair).
export function repoToolKind(id: RepoFileId): FsToolKind | null {
  const gives = REPO_FILES[id].gives;
  return gives === 'repair-v2' ? null : gives;
}

// The segments a delivery of `id` lays out, with ids from `makeId` (the real send mints them; previews use PREVIEW_ID).
// `repairVersion`: the version of the unit's best Repair copy, so a Repair.bak arrives at it (02 §4.1: a spare is a copy
// of what the unit runs, never a downgrade). Every segment is a unit file (packUnit's rule for added files).
export function repoFileSegments(id: RepoFileId, makeId: (prefix: string) => string, repairVersion: number): Segment[] {
  switch (id) {
    case 'mv':
    case 'rm':
    case 'cp':
    case 'swap': {
      const def = copiedToolDef(id)!;
      return createToolFiles(repoToolKind(id)!).filter((seg) => seg.name === def.name).map((seg) => ({ ...seg, id: makeId(seg.id) }));
    }
    case 'repair-bak': {
      const seg = createToolFiles('repair').find((file) => file.name === REPO_FILE_DATA[id].name)!;
      return [{ ...seg, id: makeId(seg.id), version: Math.max(1, repairVersion) }];
    }
    case 'scan-bak': {
      const scan = createToolFiles('scan')[0]!;
      const desc = REPO_FILE_TEXT[id].desc;
      if (desc === null) throw new Error('repository: Scan.bak has no desc');
      const seg: FsToolSegment = { ...scan, id: makeId('t_scan_bak'), name: REPO_FILE_DATA[id].name, desc };
      return [seg];
    }
    case 'repair-v2': {
      const desc = REPO_FILE_TEXT[id].desc;
      if (desc === null) throw new Error('repository: the REPAIR v2 patch has no desc');
      const patch: UpgradeSegment = {
        id: makeId('repair_patch'), name: REPO_FILE_DATA[id].name, type: 'upgrade', upgrade: 'repair-patch',
        size: REPAIR_PATCH_BLOCKS, integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc,
      };
      return [patch];
    }
  }
}

// The catalogue's checks (plan §4.1), as a list of problems (empty: sound). At load they throw.
// • every row's size is catalogue v1's pin (V1_BLOCKS; a drift needs a REPO_CATALOGUE_VERSION bump), its segments total
//   it, and a tool row's size is its tool file's (TOOL_FILES): the PACKET, the card and the layout all count one number;
// • every tool row gives a tool kind, and no row is bigger than the biggest file of its kind: arrival-preview's locked-floor
//   check (46 blocks fit the shortest link and TIGHT's room) counts one copy of each kind at its biggest, so a delivery can
//   never make that floor untrue;
// • every word fits a strip row (MAX_LINE_CHARS), the AVAILABLE row with its effect included.
export function validateCatalogue(): string[] {
  const problems: string[] = [];
  for (const id of REPO_FILE_IDS) {
    const def = REPO_FILES[id];
    if (def.id !== id) problems.push(`${id}: its def says ${def.id}`);
    if (def.blocks !== V1_BLOCKS[id]) problems.push(`${id}: ${def.blocks} blocks, catalogue v1 pins ${V1_BLOCKS[id]}: bump REPO_CATALOGUE_VERSION and re-pin`);
    const segs = repoFileSegments(id, (prefix) => `${prefix}~check`, 2);
    const total = segs.reduce((sum, seg) => sum + seg.size, 0);
    if (total !== def.blocks) problems.push(`${id}: ${def.blocks} blocks on the row, ${total} laid out`);
    if (segs.some((seg) => seg.name !== def.name)) problems.push(`${id}: a segment not named ${def.name}`);
    const kind = repoToolKind(id);
    if (kind === null) {
      if (!segs.every((seg) => seg.type === 'upgrade' && seg.upgrade === 'repair-patch')) problems.push(`${id}: the patch is not a repair-patch upgrade file`);
    } else {
      if (!segs.every((seg) => seg.type === 'fs-tool' && seg.fsTool === kind)) problems.push(`${id}: not a ${kind} tool file`);
      const biggest = Math.max(...TOOL_FILES[kind].map((file) => file.size));
      if (def.blocks > biggest) problems.push(`${id}: ${def.blocks} blocks, over ${kind}'s biggest file (${biggest})`);
    }
    // (A desc is the INSPECT panel's paragraph, as the tool files' own are: it wraps, so it has no row limit.)
    const words = [def.name, def.effect, REPO_TEXT.row(def.name, def.blocks, def.effect), REPO_FILE_TEXT[id].boot];
    if (words.some((text) => text.length > MAX_LINE_CHARS)) problems.push(`${id}: a line over ${MAX_LINE_CHARS} characters`);
  }
  if (new Set(REPO_FILE_IDS).size !== Object.keys(REPO_FILES).length || REPO_FILE_IDS.length !== Object.keys(REPO_FILES).length) {
    problems.push('the row order does not list every catalogue row once');
  }
  for (const row of RESTRICTED_ROWS) {
    if (`${row.name} · ${row.why}`.length > MAX_LINE_CHARS) problems.push(`${row.id}: its locked row is over ${MAX_LINE_CHARS} characters`);
  }
  return problems;
}

(function checkCatalogue(): void {
  const problems = validateCatalogue();
  if (problems.length > 0) throw new Error(`repository: the catalogue fails its checks: ${problems.join('; ')}`);
})();
