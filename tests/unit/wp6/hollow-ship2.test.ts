// Phase 3 slice 2: HALCYON is calm now (no slot); its phase-2 pod racks come from support/hollow-world.ts, the root written
// through the slot as the ladder brings one.
// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// WP6 acceptance 4: the HOLLOW rules on a ship-2 config (§4.2 HALCYON: spreads every 25 s, drain
// 3.5/s, ×1.5 while landing, wakes 30 AI s into the flight). Slice 1a: HALCYON's real pod racks (`P P P _40`,
// `P _2 R _1 P _37`), so the root sits between POD 04 (a 2-block gap) and POD 05 (a 1-block gap), with a WALL past
// each (rack B's 40 free blocks, rack C's 37). HALCYON itself arrives with WP7;
// here ship 1's state carries HALCYON's memory and HOLLOW, on a quiet closed orbit (no lock, no
// crash) for 180 AI s, with the real tools: REPAIR, MOVE, 2 threads and 32 REPAIR CHARGE.
// • an active scripted defender (MOVE licensed at 25 s; from 1 s after the wake: REPAIR what is
//   bitten, then MOVE the drivers next to HOLLOW out to rack D, so both sides become WALLs) loses
//   no pod's driver;
// • an idle defender loses both (POD 04 and POD 05), and the spread stops at the WALLs.
import { check, finish } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { hollowReach } from '@systems/hollow';
import { actionRepair, actionMove } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { installTool } from '@systems/licences';
import { isBusy } from '@systems/tool-targets';
import { buildShipMemory } from '@data/memory';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import type { ShipDef, HollowDef } from '@data/ships';
import { childRng } from '@systems/rng';
import { createHollowState, createLandingState } from '@state/initial';
import { driversInMemory, getRedundancy, isInfected } from '@state/selectors';
import { stateFromElements } from '@/types/orbit';
import type { DriverSegment, FreeSegment } from '@/types/segment';
import { WALL_MIN_BLOCKS, ROOT_BLOCKS } from '@data/tuning';
import { phase2HalcyonDef, PHASE2_LANDINGS } from '../support/hollow-world';
import { fixtureShip } from '../support/arm-ship';

const HALCYON_HOLLOW: HollowDef = {
  wake: { afterAiSec: 30, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, landMult: 1.5, seed: null, verbs: null, deal: false, story: 'none',
};
// Track RETIRE: run 1's ARES-VII (its fresh unit's written racks E–F) with phase 2's FULL HALCYON geometry, drivers and
// landing (support/hollow-world), as the classic five's ARES-VII and HALCYON made it.
const ares = fixtureShip(0);
const halcyon = phase2HalcyonDef();
const HALCYON: ShipDef = {
  ...ares,
  id: 'halcyon-test',
  name: 'HALCYON',
  memoryClass: 'FULL',
  memory: {
    ...ares.memory,
    podRacks: halcyon.memory.podRacks,
    drivers: halcyon.memory.drivers,
  },
  landing: structuredClone(PHASE2_LANDINGS[1]) as ShipDef['landing'],
};
const CHARGE = 32;
const RUN_SEC = 180;
const REACT_SEC = 1;
const MOVE_LICENCE_AT_SEC = 25;

const h = createHarness6(7, { soulsFound: true });

function setUp(): void {
  h.resetTo('flight');
  h.noFault();
  const memory = buildShipMemory(HALCYON, null, childRng(7, 1, 'families'), false, UNNAMED_HOLLOW, { blocks: ROOT_BLOCKS }, []);
  const state = h.store.getState();
  // A closed loop that pokes out of the ring (▼ 5,500 km inside, ▲ 11,000 km outside): it never
  // locks and never crashes, and nobody burns, so 180 AI s pass on a quiet flight.
  const rp = 5500;
  const ra = 11000;
  const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, 0, state.level.planet.mu);
  h.store.update((d) => {
    d.memory = memory;
    d.level.memoryClass = 'FULL';
    d.hollow = createHollowState(HALCYON_HOLLOW);
    d.landing = createLandingState(HALCYON.landing, memory, { finalShip: false, lead: 5, hurt: [], planetR: d.level.planet.R });
    d.mission.colonists = d.landing.pods.reduce((sum, record) => sum + record.colonists, 0);
    d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
    d.ui.memoryRev++;
  });
  // Ship 2's unit carries REPAIR from ship 1; MOVE is licensed at boot + 25 s (§6.5), see run().
  installTool(h.store, 'repair');
  const charge = getRedundancy(h.store.getState())!;
  h.store.update((d) => { charge.used = CHARGE; d.ui.memoryRev++; });
}

interface Outcome {
  lost: number[];
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
    for (const soul of driversInMemory(state)) {
      if (!isInfected(soul)) { infectedSince.delete(soul.id); continue; }
      if (!infectedSince.has(soul.id)) infectedSince.set(soul.id, now);
      if (now - infectedSince.get(soul.id)! < REACT_SEC || getOpsBySeg(soul.id).length > 0 || !canStartOp()) continue;
      actionRepair(h.store, soul);
    }
    // Clean clusters within a GAP of HOLLOW go to the far end of the biggest free space (rack D).
    for (const reach of hollowReach(state.memory, now)) {
      if (reach.gapBlocks >= WALL_MIN_BLOCKS || reach.neighbourId === null) continue;
      const soul = state.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.id === reach.neighbourId);
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
    lost: h.store.getState().landing.pods.filter((record) => record.driverLost === 'eaten').map((record) => record.pod),
    chargeLeft: getRedundancy(h.store.getState())?.used ?? 0,
    firstBiteAt: firstBite ? firstBite.wall : null,
    fizzles: events.filter((event) => event.name === 'hollow-wall').length,
  };
}

{
  const idle = run(false);
  check('the layout: the root between POD 04 (gap 2) and POD 05 (gap 1); HOLLOW wakes at 30 AI s and bites both at once',
    idle.firstBiteAt !== null && Math.abs(idle.firstBiteAt - 30) < 0.1, `first bite at ${idle.firstBiteAt}`);
  check(`an idle defender loses both pods' drivers next to the root in ${RUN_SEC} s, and the spread stops at the WALLs (POD 03 behind rack B's 40 free blocks, rack C's 37 past POD 05): exactly POD 04 and POD 05`,
    idle.lost.slice().sort().join() === '4,5', idle.lost.join(', '));
}
{
  const active = run(true);
  check(`an active defender (REPAIR, then MOVE behind a WALL) with ${CHARGE} charge loses no pod's driver in ${RUN_SEC} s`,
    active.lost.length === 0, `lost: [${active.lost.join(', ')}], charge left ${active.chargeLeft}, ${active.fizzles} fizzles`);
  check('…the walls held: later bites fizzle on both sides', active.fizzles >= 2, `${active.fizzles} fizzles`);
  check('…and the fight cost charge, but not all of it', active.chargeLeft > 0 && active.chargeLeft < CHARGE, `${active.chargeLeft} left`);
}

finish();
