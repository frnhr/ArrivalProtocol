import type { FsToolKind } from '@/types/fs-tool';
import type { RepoFileDef, RepoFileId, RestrictedRowDef, RestrictedId } from '@/types/repo';
import type { FsToolSegment, Segment, UpgradeSegment } from '@/types/segment';
import { TOOL_FILES, createToolFiles } from '@data/fs-tools';
import { REPO_FILE_TEXT, RESTRICTED_TEXT, REPO_TEXT } from '@data/repo-text';
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

// The tool file a catalogue row copies (its def by name, so a renamed tool file fails loudly here, not on a desk).
function toolDef(kind: FsToolKind, name: string): (typeof TOOL_FILES)[FsToolKind][number] {
  const def = TOOL_FILES[kind].find((file) => file.name === name);
  if (def === undefined) throw new Error(`repository: no ${kind} tool file named ${name}`);
  return def;
}

function fileDef(id: RepoFileId, gives: RepoFileDef['gives'], blocks: number): RepoFileDef {
  return { id, name: REPO_FILE_TEXT[id].name, blocks, gives, effect: REPO_FILE_TEXT[id].effect };
}

export const REPO_FILES: Readonly<Record<RepoFileId, RepoFileDef>> = {
  mv: fileDef('mv', 'move', toolDef('move', 'Mv').size),
  rm: fileDef('rm', 'delete', toolDef('delete', 'Rm').size),
  cp: fileDef('cp', 'copy', toolDef('copy', 'Cp').size),
  swap: fileDef('swap', 'swap', toolDef('swap', 'Swap').size),
  'repair-bak': fileDef('repair-bak', 'repair', toolDef('repair', 'Repair.bak').size),
  // A backup copy of Scan is Scan's own file under another name: the same size.
  'scan-bak': fileDef('scan-bak', 'scan', toolDef('scan', 'Scan').size),
  'repair-v2': fileDef('repair-v2', 'repair-v2', REPAIR_PATCH_BLOCKS),
};

// The locked rows (02 §3.8: shown locked, never sent; no trace changes this list).
export const RESTRICTED_IDS: readonly RestrictedId[] = ['autoburn-skl', 'thread-plus', 'firewall-sys'];
export const RESTRICTED_ROWS: readonly RestrictedRowDef[] = RESTRICTED_IDS.map((id) => ({ id, ...RESTRICTED_TEXT[id] }));

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
      const kind = repoToolKind(id)!;
      const def = toolDef(kind, REPO_FILE_TEXT[id].name);
      return createToolFiles(kind).filter((seg) => seg.name === def.name).map((seg) => ({ ...seg, id: makeId(seg.id) }));
    }
    case 'repair-bak': {
      const seg = createToolFiles('repair').find((file) => file.name === REPO_FILE_TEXT[id].name)!;
      return [{ ...seg, id: makeId(seg.id), version: Math.max(1, repairVersion) }];
    }
    case 'scan-bak': {
      const scan = createToolFiles('scan')[0]!;
      const desc = REPO_FILE_TEXT[id].desc;
      if (desc === null) throw new Error('repository: Scan.bak has no desc');
      const seg: FsToolSegment = { ...scan, id: makeId('t_scan_bak'), name: REPO_FILE_TEXT[id].name, desc };
      return [seg];
    }
    case 'repair-v2': {
      const desc = REPO_FILE_TEXT[id].desc;
      if (desc === null) throw new Error('repository: the REPAIR v2 patch has no desc');
      const patch: UpgradeSegment = {
        id: makeId('repair_patch'), name: REPO_FILE_TEXT[id].name, type: 'upgrade', upgrade: 'repair-patch',
        size: REPAIR_PATCH_BLOCKS, integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc,
      };
      return [patch];
    }
  }
}

// The catalogue's checks (plan §4.1), as a list of problems (empty: sound). At load they throw.
// • every row's segments total its blocks, and a tool row's size is its tool file's (TOOL_FILES): the PACKET, the card and
//   the layout all count one number;
// • every tool row gives a tool kind, and no row is bigger than the biggest file of its kind: arrival-preview's locked-floor
//   check (46 blocks fit the shortest link and TIGHT's room) counts one copy of each kind at its biggest, so a delivery can
//   never make that floor untrue;
// • every word fits a strip row (MAX_LINE_CHARS), the AVAILABLE row with its effect included.
export function validateCatalogue(): string[] {
  const problems: string[] = [];
  for (const id of REPO_FILE_IDS) {
    const def = REPO_FILES[id];
    if (def.id !== id) problems.push(`${id}: its def says ${def.id}`);
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
