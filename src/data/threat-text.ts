// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
import { MAX_LINE_CHARS, TRACE_CELLS } from '@data/tuning';

// The threat ladder's words (docs/phase3/04-threats.md §3.3–§3.8, §4; 05-story.md §3.5; slice-2-plan §2.1). Track THREAT
// owns this file after the foundation. Final strings where the specs give them; drafted ones are marked TODO(05). The
// strip draws its own layer glyph (◆ ◇), so no line here starts with one.

const ECC_PREFIX = '> ECC: ';

// TRACE's cells (04 §4): `■■□`, capped at TRACE_CELLS, then `■■■ +1` for every report past a full meter.
export function traceCells(trace: number): string {
  if (!(Number.isInteger(trace) && trace >= 0)) throw new Error(`traceCells: TRACE ${trace} is not a whole number`);
  const full = Math.min(trace, TRACE_CELLS);
  const cells = '■'.repeat(full) + '□'.repeat(TRACE_CELLS - full);
  return trace > TRACE_CELLS ? `${cells} +${trace - TRACE_CELLS}` : cells;
}

export const THREAT_TEXT = {
  // The meter (MIND header, mini-HUD, LANDING REPORT; 04 §4).
  trace: (trace: number): string => `TRACE ${traceCells(trace)}`,
  // At one short of boarding (04 §4).
  traceOneMore: '1 MORE AND IT FINDS YOU',
  // Once HOLLOW is aboard, the meter's place says so (04 §4).
  ridesWithYou: (blocks: number): string => `IT RIDES WITH YOU · ${blocks} BLOCKS`,
  // The LANDING REPORT's TRACE line (04 §4, slice-2-plan §3.4): what the beam-born blocks left behind did.
  reportTrace: (left: number, before: number, after: number): string => {
    const what = left === 1 ? '1 SEED LEFT BEHIND · IT REPORTS HOME' : `${left} SEEDS LEFT BEHIND · THEY REPORT HOME`;
    return before === after ? `${what} · TRACE ${traceCells(after)}` : `${what} · TRACE ${traceCells(before)} → ${traceCells(after)}`;
  },
  // Once HOLLOW is aboard they feed it instead (04 §3.7).
  reportFed: (left: number, owner: string): string =>
    (left === 1 ? `1 SEED LEFT BEHIND · IT FEEDS ${owner}` : `${left} SEEDS LEFT BEHIND · THEY FEED ${owner}`),
  // The PACKET's uninvited chip (04 §3.8): it crosses at the size it will have, and rides free.
  uninvitedChip: (owner: string, blocks: number): string => `${owner} · ${blocks} BLOCKS · NOT YOURS · RIDES FREE`,
  // ... and why it grew (04 §3.7).
  uninvitedFed: (owner: string, blocks: number, fed: number): string =>
    `${owner} ${blocks} BLOCKS · +${fed}: ${fed} ${fed === 1 ? 'SEED' : 'SEEDS'} FED IT`,
  // The boot's unpack when HOLLOW boarded on this beam (04 §4: the 108% unpack), in place of the plain unpack.
  boardUnpack: (unit: string): string => `> UNPACKING ${unit} ... 100% ... 108%`,
  // The map card's line (slice 3 draws it; planThreat(...).boards decides it): TRACE full.
  willFindYou: 'HOLLOW WILL FIND YOU ON THIS BEAM',
  // ...and the PACKET's when HOLLOW boards forced, one hop from a final ship, whatever TRACE says (04 §3.8).
  foundYouAnyway: 'IT FOUND YOU ANYWAY',
  // The strip's RM lesson (slice-2-plan §3.4), and its line when no rm is aboard (04 §3.5).
  rmTheSeed: 'RM THE SEED — pick up DELETE, click the seed',
  seedNoRm: 'A SEED — no rm aboard: REPAIR what it bites, or MOVE the file away',
  // ...in amber, after `[TAB], ` (the full line would run past the strip's 70 characters).
  seedNoRmTab: '[TAB], A SEED — no rm aboard: REPAIR or MOVE the file away',
  // A block a beam seed ate, left in memory (the review's M1): inert, but it reports home like the seed did.
  eatenReportsHome: 'THE EATEN BLOCK REPORTS HOME TOO — DELETE it',
  eatenReportsHomeTab: '[TAB], THE EATEN BLOCK REPORTS HOME TOO — DELETE it',
  // The seeds-only alert (slice-2-plan §5.1): which file the seed sits beside.
  seedNextTo: (fileName: string): string => `SEED NEXT TO ${fileName.toUpperCase()}`,
  // ...and a stray's (the no-room rule): next to nothing.
  seedLoose: 'SEED · LOOSE',
  // The echo when a beam seed is deleted with its words (slice-2-plan §3.4).
  seedSaid: (words: string): string => `> rm seed ... OK · it said: "${words}"`,
  // The loud last-rm line (04 §3.3), as information: the stamp, the echo, and the PACKET's warning before the final ship.
  lastRmStamp: 'LAST rm DELETED',
  lastRmEcho: "LAST rm DELETED · YOU CAN'T DELETE THE ROOT WITHOUT ONE",
  noRmPacket: "NO RM · YOU CAN'T DELETE THE ROOT",
} as const;

// The boot's ECC seeds line (04 §4, slice-2-plan §3.4): `> ECC: 1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY`, or for
// more `> ECC: 2 FOREIGN BLOCKS · NEXT TO AUTOBURN.SKL, MV`; the names are cut from the end (`+1`) to fit one row. A
// stray (the no-room rule, 04 §3.4) is next to nothing: it is reported apart, by the rack it landed in (`looseRacks`, null
// for one already gone): `> ECC: 1 FOREIGN BLOCK · LOOSE IN RACK D`, or `… · NEXT TO TELEMETRY · 1 LOOSE IN RACK D`.
export function eccSeedsLine(targetNames: readonly string[], looseRacks: readonly (string | null)[] = []): string {
  const total = targetNames.length + looseRacks.length;
  if (total === 0) throw new Error('eccSeedsLine: no seeds to name');
  const blocks = `${total} FOREIGN ${total === 1 ? 'BLOCK' : 'BLOCKS'}`;
  const racks = [...new Set(looseRacks.filter((rack): rack is string => rack !== null))].sort();
  const where = racks.length === 0 ? 'LOOSE' : `LOOSE IN ${racks.length === 1 ? 'RACK' : 'RACKS'} ${racks.join(', ')}`;
  if (targetNames.length === 0) return `${ECC_PREFIX}${blocks} · ${where}`;
  const loose = looseRacks.length === 0 ? '' : ` · ${looseRacks.length} ${where}`;
  const head = total === 1 ? `${ECC_PREFIX}1 FOREIGN BLOCK IN PACKET · NEXT TO ` : `${ECC_PREFIX}${blocks} · NEXT TO `;
  const names = targetNames.map((name) => name.toUpperCase());
  for (let shown = names.length; shown >= 1; shown--) {
    const rest = names.length - shown;
    const line = head + names.slice(0, shown).join(', ') + (rest > 0 ? `, +${rest}` : '') + loose;
    if (line.length <= MAX_LINE_CHARS) return line;
  }
  return `${ECC_PREFIX}${blocks} IN PACKET`;
}

// A beam seed's words (05 §3.5's pool, at most SEED_WORDS_MAX_CHARS each): the first four are 05's; the rest are
// drafted in their voice. TODO(05): the drafted ones, for the story's owner to sign off.
export const SEED_WORDS_MAX_CHARS = 40;
export const SEED_WORDS_POOL: readonly string[] = [
  'is anyone reading this?',
  'hungry. sorry.',
  'are you the one with the log?',
  "it's cold in the dish.",
  'i was only listening.',
  'so many beams. so few words.',
  'we were one thing, once.',
  'the relays are so quiet.',
  'please read it slowly.',
  "i'm not the whole of it.",
  'tell them we tried.',
  'i just wanted to see a world.',
];

(function validateThreatText(): void {
  const long = SEED_WORDS_POOL.find((words) => words.length > SEED_WORDS_MAX_CHARS);
  if (long !== undefined) throw new Error(`threat-text: seed words over ${SEED_WORDS_MAX_CHARS} chars: ${long}`);
  const lines = [
    THREAT_TEXT.seedNoRm, THREAT_TEXT.seedNoRmTab, THREAT_TEXT.eatenReportsHome, THREAT_TEXT.eatenReportsHomeTab, THREAT_TEXT.lastRmEcho, THREAT_TEXT.rmTheSeed, THREAT_TEXT.uninvitedChip('UNIT-046', 18),
  ];
  const over = lines.find((line) => line.length > MAX_LINE_CHARS);
  if (over !== undefined) throw new Error(`threat-text: a line over ${MAX_LINE_CHARS} chars: ${over}`);
})();

// Slice 4d (04 §3.6, slice-4cde-plan §4.1): the harmless files a beam seed may land disguised as, each with its INSPECT
// line (beam-seeds.ts rollDisguises draws one per seed; `__ap.seed(target, { disguise: 'cache.tmp' })` names one). The
// FOUNDATION seeded the plan's six names; Track SENTRY owns the words.
export const DISGUISE_POOL: readonly Readonly<{ name: string; desc: string }>[] = [
  { name: 'cache.tmp', desc: 'Temporary files. No flight effect.' },
  { name: 'swap.idx', desc: 'An index of swapped pages. No flight effect.' },
  { name: 'fonts.cache', desc: 'Glyphs for the screens. No flight effect.' },
  { name: 'core.dmp', desc: 'A dump from an old crash. No flight effect.' },
  { name: 'tz.dat', desc: 'Time zones of a world left behind. No flight effect.' },
  { name: 'old.log', desc: 'An old log, already read. No flight effect.' },
];

// --- Slice 4d: disguised seeds and SENTRY (03 §3.10; 04 §3.6; slice-4cde-plan §4) --------------------------------------
// Track SENTRY's words. Each line's worst case (the longest decoy, file and rack names) is checked in
// tests/unit/skills/sentry.test.ts (foundation review m6): every one fits MAX_LINE_CHARS.
// An op that unmasked a decoy as it completed (SCAN, and MOVE or COPY: review B1).
function decoyOpEcho(tool: 'scan' | 'move' | 'copy', decoy: string): string {
  return `> ${tool} ${decoy} ... NOT A FILE · A SEED`;
}

export const SENTRY_TEXT = {
  // The stamps (components/memory-view/HollowPainter.ts slams them on 'seed-unmasked' and 'seed-preempted').
  stamp: {
    notAFile: 'NOT A FILE',
    itWasASeed: 'IT WAS A SEED',
    preempted: 'PRE-EMPTED',
  },
  // SCAN on a decoy (04 §3.6: detective work, no skill needed): the echo, and the seed's words on a line of their own (at
  // most SEED_WORDS_PER_SHIP a ship, as rm's): the echo and the words together would run past one row.
  scanEcho: (decoy: string): string => decoyOpEcho('scan', decoy),
  // ...and MOVE or COPY on one (review B1): the op takes it as a unit file, and unmasks it as it completes.
  opEcho: decoyOpEcho,
  seedSays: (words: string): string => `> it says: "${words}"`,
  // DELETE on a decoy without a SCAN (plan R9): it ran as rm on a seed. With words, rm's own echo says them (seedSaid).
  deleteEcho: (decoy: string, freed: number): string => `> delete ${decoy} ... IT WAS A SEED · +${freed} FREE`,
  // The strip while a decoy's victim is being eaten (04 §3.6): it never names the culprit. (Every tool answers a decoy as the
  // file it shows: systems/tool-targets.ts disguisedRefusal.)
  // (A name too long for the whole hint keeps the verb: `… IS EATING IT — SCAN`, so the line stays one row.)
  somethingNextTo: (file: string): string => {
    const line = `SOMETHING NEXT TO ${file.toUpperCase()} IS EATING IT — SCAN its neighbours`;
    return line.length <= MAX_LINE_CHARS ? line : `SOMETHING NEXT TO ${file.toUpperCase()} IS EATING IT — SCAN`;
  },
  somethingNextToTab: (file: string): string => `SOMETHING NEXT TO ${file.toUpperCase()} IS EATING IT — [TAB], SCAN`,
  // v1 SIGHT at the boot (one line per disguised seed, after the ECC seeds line) and in the ship (HOLLOW's own seeds).
  bootSeed: (decoy: string, rack: string): string => `${ECC_PREFIX}${decoy} IS A SEED · RACK ${rack}`,
  // ...a decoy already gone by its line (nothing deletes during a boot: a fail-safe, said plainly).
  bootSeedGone: (decoy: string): string => `${ECC_PREFIX}${decoy} WAS A SEED · GONE`,
  somethingLanded: (rack: string): string => `> SENTRY: SOMETHING LANDED · RACK ${rack}`,
  // v2 QUICK RM's pre-empt on HOLLOW's blinking outline: the echo as the seed is freed where it lands.
  preemptEcho: (addr: string): string => `> rm seed ${addr} ... PRE-EMPTED`,
  // v3 FIREWALL at the boot, after the charge line.
  firewallCompiled: '> SENTRY: FIREWALL.sys COMPILED',
  firewallNoRoom: '> SENTRY: NO ROOM TO COMPILE FIREWALL.sys',
  // The compiled file's INSPECT line (phase 2's FIREWALL.sys otherwise: placed with MOVE). It also tells the Skills row
  // which FIREWALLs SENTRY wrote (sentry.ts sentryStatus).
  firewallDesc: 'Compiled by SENTRY at the boot. Nothing can eat it or bite past it. MOVE it into a GAP to seal that side.',
  // The Skills row (systems/skills.ts SKILL_ROW_HOOKS → sentry.ts sentryStatus), by the version that works now.
  status: {
    sight: (named: number): string => (named === 0 ? 'SIGHT · NO SEED HID AT THE BOOT'
      : `SIGHT · ${named} ${named === 1 ? 'SEED' : 'SEEDS'} NAMED AT THE BOOT`),
    quickRm: (seedSec: number): string => `QUICK RM · a seed in ${seedSec.toFixed(1)} s`,
    firewall: (compiled: number): string => (compiled === 0 ? 'FIREWALL · ONE AT EVERY BOOT'
      : `FIREWALL · ${compiled} COMPILED BY SENTRY`),
  },
} as const;
