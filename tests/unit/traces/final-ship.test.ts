// Slice 7c, Track TRACE (docs/phase3/impl/slice-7-plan.md §6.1 traces/final-ship; R33, R32's allowance): run 2's final ship
// after each ending, on one arm and one route (seed 4's longest, whose beam into the final ship rolls two seeds), beamed desk
// to desk (map/repo-fixture's real sends) and the final boot played, each against the same run with no trace:
// • PURGE: the seeds the unit carries in are gone (`> THE DISH HERE WAS WIPED · 2 SEEDS GONE`), and the FINALE bites every
//   spreadEverySec × 0.85;
// • MERGE: the Core's capacity +1 as `> A THREAD IN THE DISH · +1 THREAD` is said, and an 18-block root;
// • REASSIGNMENT: +15 REPAIR CHARGE through the arrival path (`> AN ALLOWANCE FOR THE WAIT`), the root is the last unit, its
//   FINALE seeds 'near-skill', and its RM hunts the highest-version `.skl` (huntTarget: ties the larger file);
// • non-compliant (SUNSET, SPARE): one wild seed at the final boot (`> THE DISH HERE RUNS WILD · 1 SEED CAME IN`), never behind
//   a file another seed rides, never wiped by PURGE, one however many are held;
// • the hunt itself, pure on the final ship's memory: RM takes the hunted skill first whatever rmTargets' tier (a Repair.bak
//   spare too: the 7c review) and landVerb unlinks it; the layout keeps a hunting gap before it; a near-skill seed lands in a gap beside it, facing it, and with no such gap where the FINALE's own seed would.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import type { GameState } from '@state/schema';
import type { HollowFate, YouChoice } from '@/types/ending';
import type { Segment } from '@/types/segment';
import type { ShipThreat } from '@/types/threat';
import { huntTarget, huntedSkill, nearSkillSeedSpot } from '@systems/trace-hunt';
import { traceGiftCharge } from '@systems/trace-gifts';
import { rootUnitsOf, finalTraces } from '@systems/traces';
import { chooseVerb, landVerb, seedSpot, rmTargets } from '@systems/hollow';
import { freeSegment, mergeAdjacentFree, segmentStarts } from '@systems/memory-ops';
import { packUnit, layoutCarried } from '@systems/carry';
import { shipDefAt } from '@systems/map-run';
import { createRng } from '@systems/rng';
import { chargeLeft, isSkillFile } from '@state/selectors';
import { giveSkillFile } from '../support/skills';
import { TRACE_TEXT } from '@data/trace-text';
import { HOLLOW_STAGES } from '@data/threats';
import {
  TRACE_GIFT_CHARGE, TRACE_PURGE_BITE_MULT, TRACE_MERGE_THREADS, FINAL_ROOT_MAX_BLOCKS, SEED_BLOCKS, SEED_TOOL_GAP_BLOCKS, WALL_MIN_BLOCKS,
} from '@data/tuning';
import { endingOf, lastUnitOf, startRun2, routeVia, beamTo, finalSlotOf, arm2 } from './trace-arm';

const SEED = 4;
const h = createHarness11(SEED, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();
const step = (): void => h.step();
const route = routeVia(arm2(SEED))!;
const finalSlot = finalSlotOf(route, arm2(SEED));

interface FinalLook {
  state: GameState;
  seeds: string[];               // the seeds' targets as laid out (loose: '(loose)')
  lines: string[];
  said: string[];                // the trace lines the TERMINAL typed
  capacityBefore: number;        // the Core's capacity as the unit arrived (before the boot's lines)
  capacity: number;
  root: number;
  spread: number | null;
  giftCharge: number;
}

function core(memory: readonly Segment[]): number {
  const seg = memory.find((candidate) => candidate.type === 'core');
  if (seg === undefined || seg.type !== 'core') throw new Error('final-ship: no AI Core');
  return seg.capacity;
}

function toFinal(hollow: HollowFate | null, you: YouChoice = 'reassignment'): FinalLook {
  h.newRun(SEED);
  startRun2(h.store, step, SEED, hollow === null ? null : lastUnitOf(endingOf(hollow, you)));
  beamTo(h.store, step, route, route[route.length - 2]!);
  let capacityBefore = -1;
  const off = h.store.subscribe((s) => s.run.phase, (phase) => { if (phase === 'boot' && capacityBefore < 0) capacityBefore = core(h.store.getState().memory); });
  beamTo(h.store, step, route.slice(route.length - 2), finalSlot);
  off();
  const s = state();
  const arrival = s.run.arrival!;
  const lines = arrival.traceLines.map((line) => line.text);
  return {
    state: structuredClone(s) as GameState,
    seeds: arrival.seeds.map((seed) => (seed.loose ? '(loose)' : seed.targetName)),
    lines,
    said: s.log.entries.map((entry) => entry.text).filter((text) => lines.includes(text)),
    capacityBefore,
    capacity: core(s.memory),
    root: s.memory.filter((seg) => seg.type === 'hollow' && seg.root).reduce((sum, seg) => sum + seg.size, 0),
    spread: s.hollow.cfg.spreadEverySec,
    giftCharge: arrival.giftCharge,
  };
}

const none = toFinal(null);
const finaleSpread = HOLLOW_STAGES.finale.hollow.spreadEverySec!;
check(`no trace (seed ${SEED}, route ${route.join(',')}): the beam into the final ship rolls ${none.seeds.length} seeds, the FINALE as it stands`,
  none.seeds.length === 2 && none.lines.length === 0 && none.giftCharge === 0 && none.spread === finaleSpread && none.root === 16
  && none.capacity === none.capacityBefore && none.state.hollow.cfg.seed?.target === 'walls', JSON.stringify(none.seeds));

// --- PURGE + REASSIGNMENT ----------------------------------------------------------------------------------------------------
const purge = toFinal('purge');
check('PURGE: the seeds the unit carried in are gone, the boot says `> THE DISH HERE WAS WIPED · 2 SEEDS GONE`',
  purge.seeds.length === 0 && purge.lines[0] === TRACE_TEXT.wiped(2) && purge.said.includes(TRACE_TEXT.wiped(2)), JSON.stringify(purge.lines));
check('…and the FINALE bites every 12 s × 0.85; its root is 16 blocks, the Core as it was',
  purge.spread === finaleSpread * TRACE_PURGE_BITE_MULT && purge.root === 16 && purge.capacity === none.capacity, String(purge.spread));
check('REASSIGNMENT: +15 REPAIR CHARGE through the arrival path (`> AN ALLOWANCE FOR THE WAIT · +15 REPAIR CHARGE`), the charge laid out',
  purge.giftCharge === TRACE_GIFT_CHARGE && purge.lines.at(-1) === TRACE_TEXT.allowance(TRACE_GIFT_CHARGE)
  && chargeLeft(purge.state) === chargeLeft(none.state) + TRACE_GIFT_CHARGE && purge.said.length === purge.lines.length,
  `${chargeLeft(purge.state)} vs ${chargeLeft(none.state)}`);
check('…the root is the last unit (UNIT-047), its FINALE seeds hunt your best skill (\'near-skill\'), its RM goes for AUTOBURN.skl',
  JSON.stringify(rootUnitsOf(purge.state.run)) === '[47]' && purge.state.hollow.cfg.seed?.target === 'near-skill'
  && huntTarget(purge.state) === huntedSkill(purge.state.memory)?.id && huntedSkill(purge.state.memory)?.name === 'AUTOBURN.skl'
  && huntTarget(none.state) === null);

// The hunting gap (the 7c review, the TRACE track's optional patch): laid out for the final ship with REASSIGNMENT's
// 'near-skill' seeds, the unit's block keeps WALL + seed + gap free right before the hunted skill, and the FINALE's seed
// lands there facing it; with the FINALE's own 'walls' seeds (no trace) the files stay back to back.
{
  const layoutFor = (look: FinalLook): Segment[] => {
    const s = look.state;
    const racks = layoutCarried(packUnit(s.memory, 999, []), 20, shipDefAt(s.run.map, finalSlot),
      { hollow: s.hollow.cfg } as unknown as ShipThreat /* the layout reads only the seeds' target: the ship's HOLLOW as planned */, 'UNIT-047').racks;
    return racks.startAddr > 0 ? [freeSegment(racks.startAddr), ...racks.segs] : [...racks.segs];
  };
  const gap = WALL_MIN_BLOCKS + SEED_BLOCKS + SEED_TOOL_GAP_BLOCKS;
  const hunting = layoutFor(purge);
  const at = hunting.findIndex((seg) => seg.id === huntedSkill(hunting)?.id);
  const spot = nearSkillSeedSpot(hunting, []);
  const starts = segmentStarts(hunting);
  const plain = layoutFor(none);
  const plainAt = plain.findIndex((seg) => seg.id === huntedSkill(plain)?.id);
  check(`…the hunting gap: ${gap} free blocks right before the hunted skill, the FINALE's seed in it facing the skill; none without the trace`,
    purge.state.hollow.cfg.seed?.target === 'near-skill' && at > 0 && hunting[at - 1]!.type === 'free' && hunting[at - 1]!.size === gap
    && spot?.gapId === hunting[at - 1]!.id && spot.startAddr === starts[at]! - SEED_TOOL_GAP_BLOCKS - SEED_BLOCKS
    && plainAt > 0 && plain[plainAt - 1]!.type !== 'free', JSON.stringify({ before: hunting[at - 1], spot }));
}

// --- MERGE + REASSIGNMENT ----------------------------------------------------------------------------------------------------
const merge = toFinal('merge');
check('MERGE: `> A THREAD IN THE DISH · +1 THREAD` said, the Core\'s capacity +1 from it; the seeds ride as rolled',
  merge.lines[0] === TRACE_TEXT.thread(TRACE_MERGE_THREADS) && merge.said.includes(merge.lines[0]!)
  && merge.capacity === merge.capacityBefore + TRACE_MERGE_THREADS && merge.capacityBefore === none.capacity
  && JSON.stringify(merge.seeds) === JSON.stringify(none.seeds), `${merge.capacityBefore} → ${merge.capacity}`);
check('…and the final root is FINAL_ROOT_MAX_BLOCKS (18), 046·047 after the MERGE; the bites as they are',
  merge.root === FINAL_ROOT_MAX_BLOCKS && JSON.stringify(rootUnitsOf(merge.state.run)) === '[46,47]' && merge.spread === finaleSpread);

// --- The non-compliant traces: the wild seed ----------------------------------------------------------------------------------
const sunset = toFinal('followed', 'sunset');
const purgeSunset = toFinal('purge', 'sunset');
const spare = toFinal('spare', 'reassignment');
const distinct = (seeds: readonly string[]): boolean => new Set(seeds.filter((name) => name !== '(loose)')).size === seeds.filter((name) => name !== '(loose)').length;
check('SUNSET (non-compliant): one wild seed on top of the beam\'s, `> THE DISH HERE RUNS WILD · 1 SEED CAME IN`, one seed a file',
  sunset.seeds.length === none.seeds.length + 1 && sunset.lines.join() === TRACE_TEXT.wild(1) && sunset.said.length === 1 && distinct(sunset.seeds)
  && sunset.giftCharge === 0 && sunset.root === 16 && sunset.state.hollow.cfg.seed?.target === 'walls', JSON.stringify(sunset.seeds));
check('…PURGE + SUNSET: the wipe takes the two the unit carried, never the wild one',
  purgeSunset.seeds.length === 1 && purgeSunset.lines.join(' | ') === `${TRACE_TEXT.wiped(2)} | ${TRACE_TEXT.wild(1)}`, JSON.stringify(purgeSunset.lines));
check('…SPARE + REASSIGNMENT: the wild seed and the allowance (one seed however many non-compliant traces are held)',
  spare.seeds.length === none.seeds.length + 1 && spare.lines.join(' | ') === `${TRACE_TEXT.wild(1)} | ${TRACE_TEXT.allowance(TRACE_GIFT_CHARGE)}`
  && finalTraces(spare.state.run).wild, JSON.stringify(spare.lines));
check('…compliant endings owe none (PURGE / MERGE + REASSIGNMENT), and the gift charge is the allowance\'s alone',
  !finalTraces(purge.state.run).wild && !finalTraces(merge.state.run).wild && traceGiftCharge(none.state, finalSlot) === 0);

// --- The hunt (pure, on the final ship's memory) ---------------------------------------------------------------------------------
{
  // With a second, higher skill the hunt takes it; of two at one version, the larger file.
  h.store.update((draft) => { Object.assign(draft, structuredClone(purge.state)); });
  const v2 = giveSkillFile(h.store, 'autodrop', 2);
  check('the hunt takes the highest-version skill (AUTODROP v2 over AUTOBURN v1)', huntTarget(state()) === v2.id);
  const skills = state().memory.filter(isSkillFile);
  const tie = skills.map((seg) => ({ ...seg, version: 2 as const }));
  const larger = tie.reduce((a, b) => (b.size > a.size ? b : a));
  check('…of two at one version, the larger file', huntedSkill(tie)?.id === larger.id);
  // RM's fair targets (hollow.ts rmTargets, tier by tier): the unit's Repair.bak is a spare, RM's first tier. The hunt does
  // not wait for it (the 7c review, R33's "first"): RM takes the hunted skill whatever the tier, and the verb lands on it.
  const untried = state().hollow.untriedTools;
  const weights = { mv: 0, rm: 1 };
  const withSpare = state().memory;
  let huntedPastSpare = 0;
  for (let draw = 1; draw <= 40; draw++) if (chooseVerb(withSpare, createRng(draw), weights, untried, v2.id)?.targetId === v2.id) huntedPastSpare++;
  const pastSpare = structuredClone(withSpare) as Segment[];
  check(`…while a spare tool is in memory (Repair.bak, RM's first tier) RM still takes the skill first (${huntedPastSpare}/40), and it lands`,
    rmTargets(withSpare, untried).every((seg) => seg.type === 'fs-tool') && !rmTargets(withSpare, untried).some((seg) => seg.id === v2.id)
    && huntedPastSpare === 40 && landVerb(pastSpare, { kind: 'rm', targetId: v2.id }, untried, v2.id) && !pastSpare.some((seg) => seg.id === v2.id),
    rmTargets(withSpare, untried).map((seg) => seg.name).join());
  check('…without the hunt the tier holds: no hunted id, the spare tier is drawn and an RM at the skill there fails',
    chooseVerb(withSpare, createRng(1), weights, untried, null)?.targetId !== v2.id
    && !landVerb(structuredClone(withSpare) as Segment[], { kind: 'rm', targetId: v2.id }, untried));
  const memory = withSpare.map((seg) => (seg.type === 'fs-tool' && /\.(bak|cp)$/.test(seg.name) ? freeSegment(seg.size) : seg));
  mergeAdjacentFree(memory);
  const fair = rmTargets(memory, untried);
  let hunted = 0;
  let drawn = 0;
  for (let draw = 1; draw <= 40; draw++) {
    if (chooseVerb(memory, createRng(draw), weights, untried, huntTarget({ ...state(), memory }))?.targetId === v2.id) hunted++;
    if (chooseVerb(memory, createRng(draw), weights, untried, null)?.targetId === v2.id) drawn++;
  }
  check(`…with no spare: RM takes it first, every draw (${hunted}/40; ${drawn}/40 without the hunt, among ${fair.length} fair targets)`,
    fair.some((seg) => seg.id === v2.id) && hunted === 40 && drawn < 40, fair.map((seg) => seg.name).join());
  const landed = structuredClone(memory) as Segment[];
  check('…and the verb lands: the skill is unlinked (its blocks free), the hunt moves on to AUTOBURN.skl', landVerb(landed, { kind: 'rm', targetId: v2.id }, untried)
    && !landed.some((seg) => seg.id === v2.id) && huntedSkill(landed)?.name === 'AUTOBURN.skl');

  // The near-skill seed: no gap beside the skill (the receiver packs the unit's files back to back: AUTOBURN.skl as it
  // arrived) → the FINALE's own spot; a gap beside it (AUTODROP.skl, written into a free run) → in that gap,
  // SEED_TOOL_GAP_BLOCKS from the skill, facing it.
  const packed = purge.state.memory;
  check('a near-skill seed with no gap beside the skill lands where the FINALE\'s own would',
    JSON.stringify(nearSkillSeedSpot(packed, untried)) === JSON.stringify(seedSpot(packed, untried)));
  const opened = structuredClone(memory) as Segment[];
  const at = opened.findIndex((seg) => seg.id === v2.id);
  const right = opened[at + 1]!;
  opened[at + 1] = freeSegment(right.size + 6);
  // Keep the total: take the 6 extra blocks from the largest free run.
  const largest = opened.filter((seg) => seg.type === 'free' && seg !== opened[at + 1]).reduce((a, b) => (b.size > a.size ? b : a));
  largest.size -= 6;
  mergeAdjacentFree(opened);
  const gapAt = opened.findIndex((seg) => seg.id === v2.id) + 1;
  const spot = nearSkillSeedSpot(opened, untried);
  const starts = segmentStarts(opened);
  check(`…with a gap beside it (${opened[gapAt]!.size} blocks): in that gap, ${SEED_TOOL_GAP_BLOCKS} block from the skill`,
    spot !== null && spot.gapId === opened[gapAt]!.id && spot.startAddr === starts[gapAt]! + SEED_TOOL_GAP_BLOCKS
    && spot.startAddr + SEED_BLOCKS <= starts[gapAt]! + opened[gapAt]!.size, JSON.stringify(spot));
}

finish();
