import type { HollowDef, HollowStage } from '@/types/threat';
import {
  DRIVER_BLOCKS, HEAL_BEATS_DRAIN_FACTOR, VERB_TELEGRAPH_SEC, VERB_FIRST_TELEGRAPH_SEC, BEAM_SEED_FIRST_BITE_CALM_SEC,
  BEAM_SEED_BITE_EVERY_SEC, BEAM_SEED_DRAIN_PER_SEC, PRE_FINAL_ROOT_CAP,
} from '@data/tuning';
import { repairRatePerSec } from '@data/fs-tools';

// HOLLOW's configs by stage (docs/phase3/04-threats.md §3.9, slice-2-plan §2.4): phase 2 kept one HollowDef per ship in
// data/ships.ts; slice 2 keys them by HOLLOW's stage, and the ladder (systems/threat-plan.ts planThreat) picks one per
// ship from its depth, TRACE and HOLLOW's age. The five phase-2 defs moved here verbatim, each with its ship's WHY (the
// numbers were tuned on that ship, and the stage keeps them): ARES-VII's is ARRIVAL, HALCYON's WALLS, KESTREL's SEEDS,
// VESPER's HUNT and LAST LIGHT's FINALE. Two new ones: SEEDS_ONLY_DEF (beam seeds before HOLLOW boards) and CALM_DEF (no
// adversary). Data only, plus the validator every def passes at load; it imports no other data module that imports it.
// Track THREAT owns this file after the slice 2 foundation.

// One stage: its HollowDef and the root it brings (04 §3.9's Root column; the root grows by the seeds it was fed,
// threat-plan.ts rootBlocksFor).
export interface HollowStageDef {
  hollow: HollowDef;
  rootBlocks: number;
}

// ARRIVAL (phase 2's ARES-VII). §4.2 ship 1: no spread. It waits until you brake: the first time the loop closes it bites
// POD 01 (Ada's family, right next to the root) and eats 2%/s, 4%/s while the engine fires, so the capture burn costs
// Ada's family's driver about a third and the fight comes after the lock. After that one fight it goes quiet for this
// ship (`> ...047?`).
const ARRIVAL: HollowDef = {
  wake: 'loop-closed-once',
  spreadEverySec: null,
  drainPerSec: 2,
  burnMult: 2,
  landMult: 1,
  seed: null,
  verbs: null,
  deal: false,
  story: 'notices-you',
};

// WALLS (phase 2's HALCYON). §4.2 HALCYON: it wakes 5 AI s after the coast begins (at the latest 30 s into the flight) and
// bites at once, then every 25 s; 3.5 %/s, twice
// that while the engine burns, ×1.5 while a window is open with a pod to launch (it gets desperate as its food
// leaves). A repair still wins: heal(8) 18.5 %/s against at most 7 %/s.
const WALLS: HollowDef = {
  wake: { afterAiSec: 30, coastLeadSec: 5 },
  spreadEverySec: 25,
  drainPerSec: 3.5,
  burnMult: 2,
  landMult: 1.5,
  seed: null,
  verbs: null,
  deal: false,
  story: 'names-itself',
};

// SEEDS (phase 2's KESTREL). §4.2 KESTREL: it wakes like HALCYON's, 5 AI s into the coast, and bites at once, then every
// 20 s at 4 %/s; the first seed 30 s after the wake (between the second and third bites; SKIP waits for it, pace.ts, and
// its clock stands still while the flight is at TACTICAL, so it never lands under a burn's lines, systems/hollow.ts), then
// one every 50 s, aimed at the walls you built. HOLLOW already said who it is on HALCYON: on this ship its one new line is
// the first seed's (`> sorry. i'm so hungry.`, systems/hollow.ts).
// It never wakes inside the debris dodge's window (the lead's ruling for WP9 fix round 1): the IN correction
// dodges the cloud until about 152 tactical s in (judged with both Core threads busy, LEAD-2), and a wake inside
// that window buried TOO WIDE's countdown under HOLLOW's lines for a kid who repaired the sensor late. Since review
// round 2 that is an explicit rule (systems/hollow.ts: a timed wake waits while the dodge is open, and
// WAKE_AFTER_DODGE_SEC after it closes), so it holds at any pace (the window's TACTICAL end, OVERCLOCK in blue, a
// kid tapping the engine). The 60 s cap is round 1's: at CRUISE the window closes at about 55 AI s, so the hold,
// not the cap, sets a never-corrector's wake.
const SEEDS: HollowDef = {
  wake: { afterAiSec: 60, coastLeadSec: 5 },
  spreadEverySec: 20,
  drainPerSec: 4,
  burnMult: 2,
  landMult: 1.5,
  seed: { everySec: 50, firstAfterSec: 30, target: 'walls' },
  verbs: null,
  deal: false,
  story: 'none',
};

// HUNT (phase 2's VESPER). §4.2 VESPER: it wakes 30 AI s into the coast (which begins at the flight's start: the path
// arrives in the ring), so the engine firing by itself is the ship's first lesson and HOLLOW its second, then bites every
// 16 s at 4 %/s, ×2 while the engine burns (ghost bursts included: P1), ×1.5 while the landing is active. Its first seed
// 25 s after the wake (after THE DEAL's 15 s), then one every 40 s, next to your filesystem tools; its first seed waits for
// a calm flight like every ship's (systems/hollow.ts).
const HUNT: HollowDef = {
  wake: { afterAiSec: 45, coastLeadSec: 30 },
  spreadEverySec: 16,
  drainPerSec: 4,
  burnMult: 2,
  landMult: 1.5,
  seed: { everySec: 40, firstAfterSec: 25, target: 'near-tools' },
  verbs: null,
  deal: true,
  story: 'wants-charge',
};

// FINALE (phase 2's LAST LIGHT). §4.2 LAST LIGHT: it wakes like HALCYON's, 5 AI s into the coast (at the latest 30 s into
// the flight), bites the two drivers beside the root at once, then every 12 s at 5 %/s, ×2 while the engine burns, ×1.5
// while the landing is active. Seeds every 35 s into your
// walls (the first 20 s after the wake, and like every ship's first seed only on a calm flight); a verb every 12 s of
// calm, counted down 3 s (§6.6; the first one 4 s: tuning.ts), every 4 s while the root's DELETE runs. Its boot closes
// on HOLLOW's own line.
const FINALE: HollowDef = {
  wake: { afterAiSec: 30, coastLeadSec: 5 },
  spreadEverySec: 12,
  drainPerSec: 5,
  burnMult: 2,
  landMult: 1.5,
  seed: { everySec: 35, firstAfterSec: 20, target: 'walls' },
  verbs: { everySec: 12, telegraphSec: VERB_TELEGRAPH_SEC, firstTelegraphSec: VERB_FIRST_TELEGRAPH_SEC, duelEverySec: 4 },
  deal: false,
  story: 'last-ship',
};

// The five stages with their roots (04 §3.9: phase 2's R and R16 with steps between). ARRIVAL's 8 is phase 2's `R`, the
// FINALE's 16 its `R16`; WALLS 10, SEEDS 12 and HUNT 14 grow by two a stage, so each stage's root reads bigger than the
// last on the PACKET's chip, and HUNT's 14 is PRE_FINAL_ROOT_CAP (a fed root before the final ship never outgrows it).
export const HOLLOW_STAGES: Readonly<Record<HollowStage, HollowStageDef>> = {
  arrival: { hollow: ARRIVAL, rootBlocks: 8 },
  walls: { hollow: WALLS, rootBlocks: 10 },
  seeds: { hollow: SEEDS, rootBlocks: 12 },
  hunt: { hollow: HUNT, rootBlocks: PRE_FINAL_ROOT_CAP },
  finale: { hollow: FINALE, rootBlocks: 16 },
};

// Beam seeds before HOLLOW boards (04 §3.5, §3.17): no root, no story, no seeds of its own; the hollow blocks are the
// seeds the beam laid out at the boot (systems/beam-seeds.ts). The first bite after BEAM_SEED_FIRST_BITE_CALM_SEC of calm
// flight, then every BEAM_SEED_BITE_EVERY_SEC at BEAM_SEED_DRAIN_PER_SEC, ×2 while the engine burns or ×1.5 while the
// landing is active (the larger applies). With no seed aboard nothing wakes (systems/hollow.ts). Only the seeds bite
// (onlySeedsBite): a file a seed ate is an inert block that reports home but eats nothing more, so with nobody aboard to
// drive it the chain is one file long, the one the ECC line named (the review's M1: left alone, KESTREL's seed ate
// Telemetry, then Nav Plotter, Engine I/O and the Core).
export const SEEDS_ONLY_DEF: HollowDef = {
  wake: { afterAiSec: BEAM_SEED_FIRST_BITE_CALM_SEC, coastLeadSec: null, calmOnly: true },
  spreadEverySec: BEAM_SEED_BITE_EVERY_SEC,
  drainPerSec: BEAM_SEED_DRAIN_PER_SEC,
  burnMult: 2,
  landMult: 1.5,
  seed: null,
  verbs: null,
  deal: false,
  story: 'none',
  onlySeedsBite: true,
};

// A calm ship (04 §3.2): no adversary. It never wakes; the cfg stays non-null so no module grows a null check. Its drain
// is the seeds-only one: an infected file carried in (04 §3.5 "infection travels") keeps draining at a seed's rate.
export const CALM_DEF: HollowDef = {
  ...SEEDS_ONLY_DEF,
  wake: 'never',
  spreadEverySec: null,
};

// HOLLOW's first ship, when it is itself one hop from a final ship (04 §3.9 "short runs fold stages"): ARRIVAL takes WALLS
// along. Silent until the loop first closes, one scripted bite on the driver beside the root, the fight, `> ...047?`, then
// WALLS's bite every 25 s at 3.5 %/s (×1.5 while landing), and it names itself on the same ship ('arrives'). The root is
// WALLS's 10 (threat-plan.ts rootBlocksFor: the larger stage's).
export function foldArrivalWalls(): HollowDef {
  return {
    ...structuredClone(ARRIVAL),
    spreadEverySec: WALLS.spreadEverySec,
    drainPerSec: WALLS.drainPerSec,
    landMult: WALLS.landMult,
    story: 'arrives',
  };
}

// Throws on a HOLLOW whose numbers break the design's promise (§6.6): a repair started before a file
// hits zero always wins, so the heal on an 8-block driver must beat the fastest drain by
// HEAL_BEATS_DRAIN_FACTOR. Losses then come from reach, threads and charge, never from a started
// repair being outrun. Exported for tests and for the generator's configs (slice 3).
export function validateHollowDef(id: string, hollow: HollowDef): void {
  const fail = (why: string): never => { throw new Error(`HollowDef ${id}: ${why}`); };
  if (!(hollow.drainPerSec > 0)) fail(`drainPerSec must be positive (got ${hollow.drainPerSec})`);
  if (!(hollow.burnMult >= 1)) fail(`burnMult must be at least 1 (got ${hollow.burnMult})`);
  if (!(hollow.landMult >= 1)) fail(`landMult must be at least 1 (got ${hollow.landMult})`);
  if (hollow.spreadEverySec !== null && !(hollow.spreadEverySec > 0)) fail(`spreadEverySec must be positive or null (got ${hollow.spreadEverySec})`);
  const timed = typeof hollow.wake === 'string' ? null : hollow.wake;
  if (timed !== null && !(timed.afterAiSec >= 0)) fail(`wake.afterAiSec must be ≥ 0 (got ${timed.afterAiSec})`);
  if (timed !== null && timed.coastLeadSec !== null && !(timed.coastLeadSec >= 0)) {
    fail(`wake.coastLeadSec must be ≥ 0 or null (got ${timed.coastLeadSec})`);
  }
  // A calm-only clock already waits for a calm flight; a coast lead on top would make "when" two rules at once.
  if (timed?.calmOnly && timed.coastLeadSec !== null) fail('a calm-only wake has no coast lead');
  const heal = repairRatePerSec(DRIVER_BLOCKS, 1);
  // The larger multiplier applies (01-landing §5), never their product: the worst drain is the larger of the two.
  const worstDrain = hollow.drainPerSec * Math.max(hollow.burnMult, hollow.landMult);
  if (!(heal > HEAL_BEATS_DRAIN_FACTOR * worstDrain)) {
    fail(`a repair heals ${heal.toFixed(1)}%/s, which must beat ${HEAL_BEATS_DRAIN_FACTOR} × the worst drain (${worstDrain}%/s)`);
  }
  if (hollow.wake === 'never') {
    // A HOLLOW that never wakes does nothing on a timer: anything timed on it would be dead data.
    if (hollow.spreadEverySec !== null || hollow.seed !== null || hollow.verbs !== null || hollow.deal || hollow.story !== 'none') {
      fail('a HOLLOW that never wakes has no spread, seeds, verbs, deal or story');
    }
  }
  if (hollow.story === 'notices-you' && hollow.wake !== 'loop-closed-once') fail('the "notices you" story follows the scripted first fight (loop-closed-once)');
  // The folded ARRIVAL + WALLS: it notices you after the scripted fight, then keeps biting and names itself (04 §3.9).
  if (hollow.story === 'arrives' && (hollow.wake !== 'loop-closed-once' || hollow.spreadEverySec === null)) {
    fail('the "arrives" story is a scripted first fight (loop-closed-once) that keeps biting after it (spreadEverySec)');
  }
  if (hollow.story === 'names-itself' && typeof hollow.wake === 'string') fail('the "names itself" story is told at a timed wake');
  if (hollow.seed !== null) {
    const { everySec, firstAfterSec } = hollow.seed;
    if (!(everySec > 0)) fail(`seed.everySec must be positive (got ${everySec})`);
    if (!(firstAfterSec >= 0)) fail(`seed.firstAfterSec must be ≥ 0 (got ${firstAfterSec})`);
    // A seed grows by the bite rule: on a HOLLOW that never bites it would be a black block that does nothing.
    if (hollow.spreadEverySec === null) fail('seeds need a HOLLOW that spreads (spreadEverySec)');
    if (timed === null) fail('seeds need a timed wake');
  }
  if (hollow.verbs !== null) {
    const { everySec, telegraphSec, firstTelegraphSec, duelEverySec } = hollow.verbs;
    if (!(telegraphSec > 0)) fail(`verbs.telegraphSec must be positive (got ${telegraphSec})`);
    // The first verb is the lesson: never shorter than the drill after it.
    if (!(firstTelegraphSec >= telegraphSec)) fail(`verbs.firstTelegraphSec (${firstTelegraphSec}) must be at least telegraphSec (${telegraphSec})`);
    // A verb's countdown must end before the next one starts: one telegraph at a time, and a gap to breathe in. On the
    // coast that holds for the longer first one too; in the duel its extra seconds push the next verb back instead
    // (systems/hollow-verbs.ts), so the duel's clock only has to outlast the drill.
    if (!(everySec > firstTelegraphSec)) fail(`verbs.everySec (${everySec}) must be longer than firstTelegraphSec (${firstTelegraphSec})`);
    if (!(duelEverySec > telegraphSec)) fail(`verbs.duelEverySec (${duelEverySec}) must be longer than telegraphSec (${telegraphSec})`);
    if (hollow.spreadEverySec === null || timed === null) fail('verbs need a HOLLOW that spreads, with a timed wake');
  }
  // THE DEAL trades a pod's driver for a pause in the spread: a HOLLOW that never spreads would offer nothing.
  if (hollow.deal && hollow.spreadEverySec === null) fail('THE DEAL needs a HOLLOW that spreads (spreadEverySec)');
  if (hollow.deal && timed === null) fail('THE DEAL needs a timed wake');
  // Only seeds bite before HOLLOW is aboard: a HOLLOW with its own seeds, verbs, deal or story is aboard, and its chain
  // rules are phase 2's.
  if (hollow.onlySeedsBite && (hollow.seed !== null || hollow.verbs !== null || hollow.deal || hollow.story !== 'none')) {
    fail('onlySeedsBite is the seeds act\'s (no HOLLOW aboard): no seeds of its own, verbs, deal or story');
  }
}

// Every stage at load: its def passes the rule above, its root is a real block, the verbs are the FINALE's alone (a verb
// anywhere else would fight a duel that never comes; a FINALE without them would make the climax a bite like any other),
// and roots grow stage by stage up to the cap before the final ship.
export function validateHollowStages(stages: Readonly<Record<HollowStage, HollowStageDef>>): void {
  let lastRoot = 0;
  for (const stage of ['arrival', 'walls', 'seeds', 'hunt', 'finale'] as const) {
    const { hollow, rootBlocks } = stages[stage];
    validateHollowDef(`stage ${stage}`, hollow);
    if (!(Number.isInteger(rootBlocks) && rootBlocks > lastRoot)) throw new Error(`HOLLOW_STAGES ${stage}: root ${rootBlocks} must grow past ${lastRoot}`);
    if (stage !== 'finale' && rootBlocks > PRE_FINAL_ROOT_CAP) throw new Error(`HOLLOW_STAGES ${stage}: root ${rootBlocks} is over the cap ${PRE_FINAL_ROOT_CAP}`);
    if ((stage === 'finale') !== (hollow.verbs !== null)) throw new Error(`HOLLOW_STAGES ${stage}: verbs are the FINALE's, and only its`);
    lastRoot = rootBlocks;
  }
}

validateHollowStages(HOLLOW_STAGES);
validateHollowDef('SEEDS_ONLY_DEF', SEEDS_ONLY_DEF);
validateHollowDef('CALM_DEF', CALM_DEF);
validateHollowDef('foldArrivalWalls()', foldArrivalWalls());
