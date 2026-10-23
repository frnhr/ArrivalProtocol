// WP5 part 2: the strip as racks and the numbers around it, headless (§9 WP5 items 5 and 9).
// • rack labels `RACK X · 0xNNN` on rack borders only;
// • how much a chip shows by its width (micro / tiny / narrow / wide) and the names it draws,
//   checked for every file of ship 1 against the pixel room a chip has at 1280 px;
// • the computed .mem-stats: souls hidden while sealed, then counted; charge, free, corrupt, total;
// • the MiniHud's ★ INTACT line and its tones (on track, at risk, lost).
// The DOM side (six rows, labels, nothing clipped, no console errors) is tests/unit/wp5/p2-flow.mjs.
import { check, finish, harnessState } from '../wp1/harness';
import { rackLabel, hexAddr, RACK_NAMES } from '@data/memory';
import { stripTier, stripName } from '@data/type-labels';
import { memStatsModel, stripRangeLabel } from '@components/memory-view/MemoryStats';
import { intactTally, intactHudLine, type IntactTally } from '@systems/stars';
import { openArchive } from '@state/initial';
import { segmentStarts } from '@systems/memory-ops';
import { RACK_BLOCKS } from '@data/tuning';

// --- Rack labels -------------------------------------------------------------------------------------
check('rack labels: RACK A · 0x000 … RACK F · 0x140', RACK_NAMES.map((_, i) => rackLabel(i * RACK_BLOCKS)).join()
  === 'RACK A · 0x000,RACK B · 0x040,RACK C · 0x080,RACK D · 0x0C0,RACK E · 0x100,RACK F · 0x140');
let threw = false;
try { rackLabel(0x41); } catch { threw = true; }
check('a label off a rack border throws', threw);
check('hexAddr pads and capitalises', hexAddr(0x17f) === '0x17F' && hexAddr(5) === '0x005');

// --- Chip tiers and names ------------------------------------------------------------------------------
check('tiers by width: 1 micro, 2–4 tiny, 5–6 narrow, 7+ wide',
  [1, 2, 3, 4, 5, 6, 7, 8, 36].map(stripTier).join() === 'micro,tiny,tiny,tiny,narrow,narrow,wide,wide,wide');
threw = false;
try { stripTier(0); } catch { threw = true; }
check('a chip of 0 blocks throws', threw);

const state = harnessState(1, false);
const bySize = (name: string) => state.memory.find((seg) => seg.name === name)!;
check('Autopilot breaks as AUTO- / PILOT (a soft hyphen), Engine I/O stays whole',
  stripName(bySize('Autopilot'), 4) === 'Auto­pilot' && stripName(bySize('Engine I/O'), 8) === 'Engine I/O');
check('a 1-block tool file is its icon (Rm: ×)', stripName({ id: 't', name: 'Rm', type: 'fs-tool', size: 1, integrity: 100, scanned: true, fsTool: 'delete', version: 1 }, 1) === '×');

// Room for a name at the 1280×720 minimum: the strip is about 670 px for 64 columns with 3 px gaps
// (about 7.5 px a block). A line holds (chip width − border − padding) / (font × 0.6 + spacing) of
// JetBrains Mono's capitals; a name may take two lines, broken at spaces and soft hyphens.
const COL_PX = 7.5;
const GAP_PX = 3;
const TIER_TYPE: Record<string, { padding: number; font: number; spacingEm: number }> = {
  wide: { padding: 6, font: 10, spacingEm: 0.05 },
  narrow: { padding: 5, font: 10, spacingEm: 0.04 },
  tiny: { padding: 3, font: 8, spacingEm: 0.02 },
  micro: { padding: 0, font: 10, spacingEm: 0 },
};
function linesNeeded(name: string, blocks: number): number {
  const tier = stripTier(blocks);
  const type = TIER_TYPE[tier]!;
  const room = blocks * COL_PX + (blocks - 1) * GAP_PX - 2 - 2 * type.padding;
  const perLine = Math.floor(room / (type.font * 0.6 + type.font * type.spacingEm));
  // Greedy: words (pieces between spaces), and pieces of a word at a soft hyphen (+1 for the "-").
  const words = name.toUpperCase().split(' ');
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const pieces = word.split('­').flatMap((piece) => piece.split('​'));
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]! + (i < pieces.length - 1 && word.includes('­') ? '-' : '');
      if (piece.length > perLine) return Infinity;
      const need = used === 0 ? piece.length : used + (i === 0 ? 1 : 0) + piece.length;
      if (need <= perLine) used = need;
      else { lines++; used = piece.length; }
    }
  }
  return lines;
}
const starts = segmentStarts(state.memory);
const badNames = state.memory
  .map((seg, i) => ({ seg, start: starts[i]! }))
  .filter(({ seg }) => seg.type !== 'free' && seg.type !== 'soul')
  .map(({ seg }) => ({ name: seg.name, shown: stripName(seg, seg.size), lines: linesNeeded(stripName(seg, seg.size), seg.size) }))
  .filter(({ lines }) => lines > 2);
check('every ship-1 file name fits its chip in two lines at 1280 px', badNames.length === 0,
  badNames.map(({ name, lines }) => `${name}: ${lines} lines`).join(' | '));
const crossing = state.memory.map((seg, i) => ({ seg, start: starts[i]! }))
  .filter(({ seg, start }) => seg.type !== 'free' && Math.floor(start / RACK_BLOCKS) !== Math.floor((start + seg.size - 1) / RACK_BLOCKS));
check('no ship-1 file straddles two racks (every chip is whole in its row)', crossing.length === 0, crossing.map(({ seg }) => seg.name).join());

// --- The stats row -------------------------------------------------------------------------------------
{
  const sealed = memStatsModel(state);
  // Fix round 1: while sealed the stat tells the briefing's story (no SOULS IN MEMORY before the reveal).
  check('stats, sealed: COLONISTS 2,400 in stasis (the briefing\'s words, not the twist)', sealed.souls.label === 'colonists'
    && sealed.souls.value === '2,400' && sealed.souls.small === 'in stasis' && sealed.souls.tone === 'plain', JSON.stringify(sealed.souls));
  check('stats: REPAIR CHARGE 36 blk, MEMORY 384 blk · 6 racks', sealed.charge.value === '36' && sealed.total.value === '384' && sealed.total.small === 'blk · 6 racks');
  const free = state.memory.filter((seg) => seg.type === 'free').reduce((sum, seg) => sum + seg.size, 0);
  check(`stats: FREE ${free} blk (computed)`, sealed.free.value === String(free));
  check('stats, sealed: DAMAGE, the damage the kid can see (Engine I/O 85%, Sensor Interp 78%), is counted, the hidden is not',
    sealed.damage.label === 'damage' && sealed.damage.tone === 'warn' && sealed.damage.value === String(Math.round(0.15 * 8 + 0.22 * 8)), JSON.stringify(sealed.damage));
  const open = harnessState(1, false);
  openArchive(open);
  const revealed = memStatsModel(open);
  check('stats, revealed: SOULS IN MEMORY 2,400 · 12 clusters', revealed.souls.label === 'souls in memory' && revealed.souls.value === '2,400'
    && revealed.souls.small === '12 clusters' && revealed.souls.tone === 'soul');
  check('stats, revealed: C09 at 71% now shows in the damage (+2 blk)', revealed.damage.value === String(Math.round(0.15 * 8 + 0.22 * 8 + 0.29 * 8)), revealed.damage.value);
  check('the strip header range: RACK A → F · 0x000 → 0x17F', stripRangeLabel(open) === 'RACK A → F · 0x000 → 0x17F', stripRangeLabel(open));
}

// --- The MiniHud's INTACT line ---------------------------------------------------------------------------
{
  const open = harnessState(1, false);
  openArchive(open);
  const tally = intactTally(open);
  // Fix round 1: at risk the line names the repair (the gold and the hurt yellow look the same).
  check('ship 1 at the reveal: 11/12 intact, at risk, naming the fix (★ INTACT 11/12 · REPAIR C09)', tally.intact === 11 && !tally.onTrack && tally.possible
    && intactHudLine(tally).text === '★ INTACT 11/12 · REPAIR C09' && intactHudLine(tally).tone === 'risk', JSON.stringify(intactHudLine(tally)));
  const good: IntactTally = { intact: 12, clusters: 12, intactSouls: 2400, souls: 2400, onTrack: true, possible: true, hurt: [] };
  const lost: IntactTally = { intact: 11, clusters: 12, intactSouls: 2200, souls: 2400, onTrack: false, possible: false, hurt: ['C10'] };
  check('on track: ★ INTACT 12/12 (good)', intactHudLine(good).text === '★ INTACT 12/12' && intactHudLine(good).tone === 'good');
  check('lost for good: a hollow ☆ INTACT 11/12', intactHudLine(lost).text === '☆ INTACT 11/12' && intactHudLine(lost).tone === 'lost');
}

finish();
