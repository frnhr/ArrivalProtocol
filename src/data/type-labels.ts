import type { Segment, SegmentType } from '@/types/segment';
import { TOOL_ICONS, TOOL_FILES, FS_TOOL_KINDS } from '@data/fs-tools';
import { RACK_A, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F } from '@data/memory';
import { STRIP_NARROW_MAX_BLOCKS, STRIP_TINY_MAX_BLOCKS, STRIP_MICRO_MAX_BLOCKS } from '@data/tuning';
import { HOLLOW_TYPE_LABEL } from '@data/hollow-text';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';

export const TYPE_LABELS: Record<SegmentType, string> = {
  core: 'AI · Core Process',
  tool: 'AI · Tool',
  skill: 'AI · Skills',
  'fs-tool': 'Filesystem Utility · in memory',
  ship: 'Ship System · Active',
  'ship-backup': 'Ship System · Backup',
  free: 'Unallocated',
  hollow: HOLLOW_TYPE_LABEL,
  redundancy: 'Repair currency · redundancy pool',
  soul: 'Colonists · soul cluster',
  upgrade: 'AI · Upgrade file',
  firewall: 'Firewall · nothing bites past it',
};

// INSPECT's type line for one file. A SWAP (WP10) leaves a pair the plain type labels misname: the backup now doing
// the job, and the old primary switched off (a ship file with no job: the only kind a swap leaves).
export function segTypeLabel(seg: Segment): string {
  if (seg.type === 'ship-backup' && seg.role) return 'Ship System · Backup, in use';
  if (seg.type === 'ship' && seg.role === undefined) return 'Ship System · Switched off';
  return TYPE_LABELS[seg.type];
}

// --- Names on the strip (§9 WP5 item 5) ----------------------------------------------------------

// How much a chip on the strip can show, by its width in blocks (see tuning.ts STRIP_*): 'wide'
// shows everything; 'narrow' packs tighter; 'tiny' drops the size and the badge for a smaller name
// and the health; 'micro' is a single glyph.
export type StripTier = 'wide' | 'narrow' | 'tiny' | 'micro';

export function stripTier(blocks: number): StripTier {
  if (!(blocks >= 1)) throw new Error(`stripTier: a chip of ${blocks} blocks`);
  if (blocks <= STRIP_MICRO_MAX_BLOCKS) return 'micro';
  if (blocks <= STRIP_TINY_MAX_BLOCKS) return 'tiny';
  if (blocks <= STRIP_NARROW_MAX_BLOCKS) return 'narrow';
  return 'wide';
}

// Where a name may break inside a word. The strip wraps a name onto two lines at its spaces when
// the chip is narrow (THRUST / CONTROLLER, SENSOR / INTERP); these few are single words too long
// for their chip at 1280 px. A soft hyphen draws as "-" only where the line actually breaks
// (AUTO- / PILOT in a 4-block chip, AUTOPILOT in a wide one); a zero-width space breaks silently.
// Both are written as escapes: as raw characters they are invisible in an editor and a diff.
const SOFT_HYPHEN = '\u00AD';
const ZERO_WIDTH_BREAK = '\u200B';
// Keyed by the file's name as written in data/memory.ts and data/fs-tools.ts; checked below, so a
// renamed file fails the page instead of quietly losing its break (and being cut at 1280 px).
const NAME_BREAKS: Readonly<Record<string, string>> = {
  Autopilot: `Auto${SOFT_HYPHEN}pilot`,
  Telemetry: `Tele${SOFT_HYPHEN}metry`,
  'Repair.bak': `Repair${ZERO_WIDTH_BREAK}.bak`,
  // WP9 review round 1: a 6-block chip at 1280 px cut it as `AUTOBUR` / `N.SKL`. Now `AUTOBURN` / `.SKL` where the
  // word fits (1440 px), else `AUTO-` / `BURN` (the name is whole in the title and INSPECT).
  [UPGRADE_FILE_TEXT.autoburn.name]: `AUTO${SOFT_HYPHEN}BURN${ZERO_WIDTH_BREAK}.skl`,
};

function validateNameBreaks(): void {
  const names = new Set<string>();
  for (const item of [...RACK_A, ...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]) if ('name' in item) names.add(item.name);
  for (const kind of FS_TOOL_KINDS) for (const file of TOOL_FILES[kind]) names.add(file.name);
  for (const file of Object.values(UPGRADE_FILE_TEXT)) names.add(file.name);
  for (const [name, broken] of Object.entries(NAME_BREAKS)) {
    if (!names.has(name)) throw new Error(`type-labels.ts: NAME_BREAKS names '${name}', which is no file in the game`);
    if (broken.replace(/[\u00AD\u200B]/g, '') !== name) throw new Error(`type-labels.ts: NAME_BREAKS '${name}' spells another name`);
  }
}
validateNameBreaks();

// The cards' 2-block files (WP8): a name a tiny chip can hold (`FW`, `FUEL`); the colour says what they are.
const TINY_NAMES: Readonly<Record<string, string>> = {
  [UPGRADE_FILE_TEXT.firewall.name]: UPGRADE_FILE_TEXT.firewall.short,
  [UPGRADE_FILE_TEXT.fuelTrim.name]: UPGRADE_FILE_TEXT.fuelTrim.short,
};

// A file's name as its chip draws it (`blocks` is the chip's width). A 1-block chip has room for
// one glyph only: a tool's own icon (Rm: ×), else the name's first letter. INSPECT and the hover
// tooltip always give the whole name.
export function stripName(seg: Segment, blocks: number): string {
  const tier = stripTier(blocks);
  if (tier === 'micro') return seg.type === 'fs-tool' ? TOOL_ICONS[seg.fsTool] : seg.name.charAt(0);
  if (tier === 'tiny' && TINY_NAMES[seg.name]) return TINY_NAMES[seg.name]!;
  return NAME_BREAKS[seg.name] ?? seg.name;
}
