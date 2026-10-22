// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// WP6 acceptance 4: the HOLLOW rules on a ship-2 config (§4.2 HALCYON: spreads every 25 s, drain
// 3.5/s, ×1.5 while printing, wakes 30 AI s into the flight; rack C `C C _2 R _1 C C _21`, so the
// root sits between C08 (a 2-block gap) and C09 (a 1-block gap)). HALCYON itself arrives with WP7;
// here ship 1's state carries HALCYON's memory and HOLLOW, on a quiet closed orbit (no lock, no
// crash) for 180 AI s, with the real tools: REPAIR, MOVE, 2 threads and 32 REPAIR CHARGE.
// • an active scripted defender (MOVE licensed at 25 s; from 1 s after the wake: REPAIR what is
//   bitten, then MOVE the clusters next to HOLLOW out to rack D, so both sides become WALLs) loses
//   ≤ 1 cluster;
// • an idle defender loses ≥ 3.
import { check, finish } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { hollowReach } from '@systems/hollow';
import { actionRepair, actionMove } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { installTool } from '@systems/licences';
import { isBusy } from '@systems/tool-targets';
import { buildShipMemory } from '@data/memory';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { SHIPS, type ShipDef, type HollowDef } from '@data/ships';
import { childRng } from '@systems/rng';
import { createHollowState } from '@state/initial';
import { soulsInMemory, getRedundancy, isInfected } from '@state/selectors';
import { stateFromElements } from '@/types/orbit';
import type { SoulSegment, FreeSegment } from '@/types/segment';
import { WALL_MIN_BLOCKS } from '@data/tuning';

const HALCYON_HOLLOW: HollowDef = {
  wake: { afterAiSec: 30, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, printMult: 1.5, seed: null, verbs: null, deal: false, story: 'none',
};
const ares = SHIPS[0]!;
const HALCYON: ShipDef = {
  ...ares,
  id: 'halcyon-test',
  name: 'HALCYON',
  memory: {
    ...ares.memory,
    racksBD: { B: 'C C C C C C _16', C: 'C C _2 R _1 C C _21', D: '_64' },
    souls: { familiesSeedStream: 'families', hurt: { cluster: 1, integrity: 90 }, lead: 9, sealed: false, firstRun: null },
  },
  hollow: HALCYON_HOLLOW,
};
const CHARGE = 32;
const RUN_SEC = 180;
const REACT_SEC = 1;
const MOVE_LICENCE_AT_SEC = 25;

const h = createHarness6(7, { soulsFound: true });

function setUp(): void {
  h.resetTo('flight');
  h.noFault();
  const memory = buildShipMemory(HALCYON, null, childRng(7, 1, 'families'), false, UNNAMED_HOLLOW);
  const state = h.store.getState();
  // A closed loop that pokes out of the ring (▼ 5,500 km inside, ▲ 11,000 km outside): it never
  // locks and never crashes, and nobody burns, so 180 AI s pass on a quiet flight.
  const rp = 5500;
  const ra = 11000;
  const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, 0, state.level.planet.mu);
  h.store.update((d) => {
    d.memory = memory;
    d.hollow = createHollowState(HALCYON);
    d.mission.souls = soulsInMemory(d).reduce((sum, soul) => sum + soul.souls, 0);
    d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
    d.ui.memoryRev++;
  });
  // Ship 2's unit carries REPAIR from ship 1; MOVE is licensed at boot + 25 s (§6.5), see run().
  installTool(h.store, 'repair');
  const charge = getRedundancy(h.store.getState())!;
  h.store.update((d) => { charge.used = CHARGE; d.ui.memoryRev++; });
}

interface Outcome {
  lost: string[];
  chargeLeft: number;
  firstBiteAt: number | null;
  fizzles: number;
}

// The kid meets HOLLOW at its wake: the defender reacts REACT_SEC after the first bite, not before
// (a GAP label it never had a reason to read is no warning).
function run(defend: boolean): Outcome {
  setUp();
  const start = h.events.length;
  const infectedSince = new Map<string, number>();
  let awakeSince: number | null = null;
  h.stepFor(RUN_SEC, () => {
    const state = h.store.getState();
    const now = state.clock.aiSec;
    if (now >= MOVE_LICENCE_AT_SEC && !state.run.licences.includes('move')) installTool(h.store, 'move');
    if (awakeSince === null && state.hollow.phase === 'awake') awakeSince = now;
    if (!defend || awakeSince === null || now - awakeSince < REACT_SEC) return;
    for (const soul of soulsInMemory(state)) {
      if (!isInfected(soul)) { infectedSince.delete(soul.id); continue; }
      if (!infectedSince.has(soul.id)) infectedSince.set(soul.id, now);
      if (now - infectedSince.get(soul.id)! < REACT_SEC || getOpsBySeg(soul.id).length > 0 || !canStartOp()) continue;
      actionRepair(h.store, soul);
    }
    // Clean clusters within a GAP of HOLLOW go to the far end of the biggest free space (rack D).
    for (const reach of hollowReach(state.memory, now)) {
      if (reach.gapBlocks >= WALL_MIN_BLOCKS || reach.neighbourId === null) continue;
      const soul = state.memory.find((seg): seg is SoulSegment => seg.type === 'soul' && seg.id === reach.neighbourId);
      if (!soul || isInfected(soul) || isBusy(soul) || !canStartOp()) continue;
      const biggest = state.memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined)
        .sort((a, b) => b.size - a.size)[0];
      if (!biggest || biggest.size < soul.size) continue;
      actionMove(h.store, soul, { regionSegIds: [biggest.id], col: biggest.size - soul.size });
    }
  });
  h.checkMemory();
  const events = h.events.slice(start);
  const firstBite = events.find((event) => event.name === 'hollow-infect');
  return {
    lost: h.store.getState().souls.results.filter((result) => result.outcome === 'lost').map((result) => result.cluster),
    chargeLeft: getRedundancy(h.store.getState())?.used ?? 0,
    firstBiteAt: firstBite ? firstBite.wall : null,
    fizzles: events.filter((event) => event.name === 'hollow-wall').length,
  };
}

{
  const idle = run(false);
  check('the layout: the root between C08 (gap 2) and C09 (gap 1); HOLLOW wakes at 30 AI s and bites both at once',
    idle.firstBiteAt !== null && Math.abs(idle.firstBiteAt - 30) < 0.1, `first bite at ${idle.firstBiteAt}`);
  check(`an idle defender loses ≥ 3 clusters in ${RUN_SEC} s`, idle.lost.length >= 3, idle.lost.join(', '));
  check('…and the spread stops at the WALLs (C06 behind rack B\'s 16 free blocks, rack D past C10): exactly C07–C10',
    idle.lost.slice().sort().join() === 'C07,C08,C09,C10', idle.lost.join(', '));
}
{
  const active = run(true);
  check(`an active defender (REPAIR, then MOVE behind a WALL) with ${CHARGE} charge loses ≤ 1 cluster in ${RUN_SEC} s`,
    active.lost.length <= 1, `lost: [${active.lost.join(', ')}], charge left ${active.chargeLeft}, ${active.fizzles} fizzles`);
  check('…the walls held: later bites fizzle on both sides', active.fizzles >= 2, `${active.fizzles} fizzles`);
  check('…and the fight cost charge, but not all of it', active.chargeLeft > 0 && active.chargeLeft < CHARGE, `${active.chargeLeft} left`);
}

finish();
