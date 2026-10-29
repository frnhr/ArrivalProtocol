// WP11 headless harness: the WP10 harness (every DOM-free system through the run, the zones, AUTOBURN, the ghost thrust,
// THE DEAL; WP6's base now also mounts HOLLOW's verbs and LAST LIGHT's finale) plus LAST LIGHT on its own and a kid who
// fights the finale the way the strip teaches:
// • lastLight(seed, opts): ship 5 alone, in flight, a fresh unit carried in (no transit hits);
// • defend11(): the WP10 defender (REPAIR bites, MOVE souls behind a WALL, REPAIR a blind sensor, DELETE seeds that can
//   bite, pip → SWAP), plus what the strip also asks of a competent kid that the earlier defenders never did: REPAIR
//   any of the unit's own files HOLLOW is eating (`SOMETHING IS EATING RM — REPAIR IT!`; a tool lost on VESPER is gone
//   for LAST LIGHT), a weak Engine I/O (ship 1's ENGINE I/O lesson) and a Core worn below 80 by transit hits; a block of HOLLOW that can bite the Core is
//   DELETEd first (cut away: a Core bitten again and again drains the charge); a clean cluster HOLLOW bites next is MOVEd
//   behind a WALL onto a spot the game's own MOVE preview calls SAFE (WP11 fix round 1: the WP7 defender's MOVE went to
//   the far end of the biggest free space, often inside a seed's reach, and moved the same cluster on and on, a thread
//   held and the charge spent on the bites; the strip says `MOVE C13 behind a WALL` and the preview says where); a verb
//   counting down is BLOCKED with a SCAN on
//   its file (RM) or a DELETE on its block (MV), `blockAfterSec` into the countdown; and once the duel is on, the root's
//   DELETE is started whenever a thread is free;
// • flyLastLight(maxWall): the strip-following kid with that defender (and [B] when AUTOBURN is offered);
// • finish(choice, maxWall): defends through the duel to the choice, makes it, and steps to the WAKE REPORT.
// One harness per test file (systems are module singletons).
import { createHarness10, type Harness10 } from '../wp10/harness10';
import { followDirector } from '../wp2/harness2';
import { actionScan, actionDelete, actionRepair, actionMove } from '@state/actions';
import { getByRole, isInfected, isRepairable, integrityBand } from '@state/selectors';
import { exposedDrivers } from '@systems/hollow';
import { safestSpot } from '@systems/move-preview';
import { isBusy } from '@systems/tool-targets';
import type { PendingPlacement } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import { canStartOp, getOpsBySeg, cancelOp } from '@systems/ops-core';
import { theRoot, rootDeleteRunning, hollowReach } from '@systems/hollow';
import { chooseFinale, type FinaleChoice } from '@systems/finale';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { knownHitRacks } from '@systems/zones';
import { isHollow } from '@state/selectors';
import { BAND_OK_MIN } from '@data/tuning';

export const LAST_LIGHT = 4;

export interface LastLightOpts {
  // HOLLOW put to sleep for good (a flight suite measures the flight, not the fight).
  hollowAsleep?: boolean;
}

export interface DefendOpts {
  // AI seconds into a verb's countdown before the kid blocks it (a reaction); Infinity: never blocks.
  blockAfterSec?: number;
  // The kid starts the root's DELETE in the duel.
  deleteRoot?: boolean;
  // A Core below `coreHealBelow` is repaired, and the repair is stopped once it reaches `coreHealTo` (default: below 80,
  // to 100). A kid saving charge for MERGE heals it only back to its two threads (below 50, to 60).
  coreHealBelow?: number;
  coreHealTo?: number;
}

export interface Harness11 extends Harness10 {
  lastLight: (seed: number, opts?: LastLightOpts) => void;
  defend11: (opts?: DefendOpts) => boolean;
  flyLastLight: (maxWall: number, opts?: DefendOpts) => string[];
  // Defends until the finale's choice stands (or maxWall), makes `choice`, then defends on to the WAKE REPORT.
  finishFinale: (choice: FinaleChoice, maxWall: number, opts?: DefendOpts) => { reachedChoice: boolean; refusal: string | null; reported: boolean };
}

export function createHarness11(seed = 1, opts: { soulsFound?: boolean } = {}): Harness11 {
  const base = createHarness10(seed, opts);
  const state = () => base.store.getState();

  const blockVerb = (blockAfterSec: number): boolean => {
    const now = state();
    const verb = now.hollow.verb;
    if (verb === null || now.clock.paused || !canStartOp()) return false;
    // Into the countdown this verb started with (unlink pass: the ship's first verb counts 4 s, every later one 3 s).
    if (verb.totalSec - verb.leftSec < blockAfterSec) return false;
    const target = now.memory.find((seg) => seg.id === verb.targetId);
    if (!target || getOpsBySeg(target.id).length > 0) return false;
    if (verb.kind === 'mv') return actionDelete(base.store, target) === null;
    return actionScan(base.store, target) === null || actionDelete(base.store, target) === null;
  };

  const startRootDelete = (): boolean => {
    const now = state();
    if (now.hollow.finale.phase !== 'duel' || now.clock.paused || rootDeleteRunning(now) || !canStartOp()) return false;
    const root = theRoot(now.memory);
    if (!root || !isHollow(root)) return false;
    return actionDelete(base.store, root) === null;
  };

  // The unit's own files: one HOLLOW is eating (a soul is the earlier defenders'), and a weak Engine I/O.
  const repairOwnFiles = (defendOpts: DefendOpts): boolean => {
    const now = state();
    if (now.clock.paused || !now.run.licences.includes('repair')) return false;
    let acted = false;
    const engine = getByRole(now, 'engine-io');
    const weakEngine = engine !== null && 'integrity' in engine && integrityBand(engine.integrity) !== 'ok' && engine.integrity < BAND_OK_MIN ? engine : null;
    // The Core worn down by transit hits (the biggest file, so the one they land on most): its screen tears and below 50
    // it runs one thread. A competent kid heals it on a quiet coast.
    const core = now.memory.find((seg) => seg.type === 'core');
    const healBelow = defendOpts.coreHealBelow ?? BAND_OK_MIN;
    const healTo = defendOpts.coreHealTo ?? 100;
    const wornCore = core !== undefined && core.type === 'core' && !core.infected && core.integrity < healBelow ? core : null;
    if (core !== undefined && core.type === 'core' && !core.infected && core.integrity >= healTo) {
      for (const operation of getOpsBySeg(core.id)) if (operation.kind === 'repair') cancelOp(operation.id);
    }
    const wanted = [
      ...now.memory.filter((seg) => seg.type !== 'driver' && isInfected(seg) && isRepairable(seg)),
      ...(wornCore ? [wornCore] : []),
      ...(weakEngine ? [weakEngine] : []),
    ];
    for (const seg of wanted) {
      if (getOpsBySeg(seg.id).length > 0 || !canStartOp()) continue;
      if (actionRepair(base.store, seg) === null) acted = true;
    }
    return acted;
  };

  // A block of HOLLOW (not the root) that can bite the Core, or is biting it: DELETE cuts it away (§3.2: "DELETE removes
  // HOLLOW seeds or cuts a gap"). A Core bitten again and again drains the charge its repairs need: it comes first.
  const cutFromCore = (): boolean => {
    const now = state();
    if (now.clock.paused || !now.run.licences.includes('delete')) return false;
    const core = now.memory.find((seg) => seg.type === 'core');
    if (!core) return false;
    let acted = false;
    for (const reach of hollowReach(now.memory, now.clock.aiSec)) {
      if (reach.neighbourId !== core.id || (reach.verdict !== 'bite' && reach.verdict !== 'infected' && reach.verdict !== 'recoiling')) continue;
      const block = now.memory.find((seg) => seg.id === reach.hollowId);
      if (!block || !isHollow(block) || block.root || block.last || getOpsBySeg(block.id).length > 0 || !canStartOp()) continue;
      if (actionDelete(base.store, block) === null) acted = true;
    }
    return acted;
  };

  // A SAFE spot for `soul` (the MOVE preview: HOLLOW can't reach it there, and it bridges nothing to rack E), at either end
  // of an open free region big enough; the one farthest from HOLLOW's nearest block. null: nowhere is SAFE.
  // Final fix pass: the rule moved into the game (move-preview.ts safestSpot), since the strip's bitten-again ask names
  // its rack now; it also skips a spot the preview says a hazard zone will hit (`⚠ BELT HITS RACK A`).
  const safeSpot = (soul: DriverSegment): PendingPlacement | null => {
    const now = state();
    return safestSpot(now, soul, knownHitRacks(now, getSensedPrediction()));
  };

  const moveBehindWall = (): boolean => {
    const now = state();
    if (now.clock.paused || !now.run.licences.includes('move') || now.hollow.phase !== 'awake' || !canStartOp()) return false;
    for (const soul of exposedDrivers(now)) {
      if (isInfected(soul) || isBusy(soul)) continue;
      const spot = safeSpot(soul);
      if (spot !== null && actionMove(base.store, soul, spot) === null) return true;
    }
    return false;
  };

  const defend11 = (defendOpts: DefendOpts = {}): boolean => {
    let acted = cutFromCore();
    if (moveBehindWall()) acted = true;
    if (base.defend10()) acted = true;
    if (repairOwnFiles(defendOpts)) acted = true;
    if (blockVerb(defendOpts.blockAfterSec ?? 0.8)) acted = true;
    if ((defendOpts.deleteRoot ?? true) && startRootDelete()) acted = true;
    return acted;
  };

  return {
    ...base,
    lastLight(nextSeed, lastOpts = {}) {
      base.shipAlone(LAST_LIGHT, nextSeed);
      if (lastOpts.hollowAsleep) base.store.update((d) => { d.hollow.phase = 'dormant'; });
      base.events.length = 0;
    },
    defend11,
    flyLastLight(maxWall, defendOpts = {}) {
      return followDirector(base, {
        reactionSec: 0.4,
        maxWall,
        mistake: () => {
          defend11(defendOpts);
          if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) base.press('KeyB');
          return false;
        },
      });
    },
    finishFinale(choice, maxWall, defendOpts = {}) {
      const end = base.wall() + maxWall;
      while (state().hollow.finale.phase !== 'choice' && state().run.phase === 'landing' && base.wall() < end) {
        defend11(defendOpts);
        base.step();
      }
      const reachedChoice = state().hollow.finale.phase === 'choice';
      const refusal = reachedChoice ? chooseFinale(base.store, choice) : null;
      while (state().run.phase === 'landing' && base.wall() < end) {
        defend11(defendOpts);
        base.step();
      }
      return { reachedChoice, refusal, reported: state().run.phase === 'report' };
    },
  };
}
