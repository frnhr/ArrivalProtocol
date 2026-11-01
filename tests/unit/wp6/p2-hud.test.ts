// Phase 3 slice 2: ships 1–2 are calm, so the ship-1 cases plant phase 2's root first (support/hollow-world.ts phase2ShipOne),
// and the HALCYON fixture writes its root through the slot (S) as the ladder brings one.
// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// Slice 1a: pods for clusters. ARES-VII's root comes first in rack B (rack A's 18 free blocks a WALL on its left, POD 01
// right after it), so ship 1's next bite is POD 01's left edge from the root's right mouth; HALCYON's fixture is the real
// rack-C geometry (GAP 2 and GAP 1 around the root) with one pod more on each side, so an eaten block still bites on.
// The mini-strip's pod kinds are driver / driver-hurt (Track UI's rename; `sealed` is gone from MiniKind).
// WP6 part 2: what HOLLOW looks and sounds like, as data (systems/hollow-hud.ts), on the live systems:
// • NEXT BITE: `?:??` on ship 1 (no timer), `m:ss` from a later ship's wake and bite timer, urgent in the
//   last HOLLOW_BITE_URGENT_SEC, quiet once it is done for the ship;
// • its reach: ship 1's root marks POD 01 as the next bite (POD 01's left edge, the root's right mouth) and
//   rack A's 18 free blocks on its left as WALL 18 ✓; HALCYON's rack C has GAP 2 and GAP 1 in red with
//   arrows to the pods either side; a bitten file is no longer a target but its gap stays red; a gap next to no
//   food is not labelled; an eaten block bites on; nothing while dormant;
// • the mini-strip: 6 racks of 64 blocks, the drivers mint (POD 02 hurt yellow), the root red, rack B's tail and
//   racks C–D one gap split at the rack borders, POD 01's red share
//   from the right, an unscanned ship file's share unknown (the hatch), green while a repair fights;
// • the chew follows the total drain (half for one file at rest, full while the engine burns, silent
//   when paused); the tug's beat follows the boundary speed (16.5 %/s → 8.25 Hz; slower while a burn
//   doubles the drain) and its pitch the file's integrity.
import { check, finish } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { biteClock, reachMarks, miniStripRows, chewLevel, tugTone } from '@systems/hollow-hud';
import { infectNow, cureNow } from '@systems/hollow';
import { actionRepair, repairRatePerSec } from '@state/actions';
import { installTool } from '@systems/licences';
import { setPaused } from '@systems/clock';
import { isThrustOn } from '@systems/orbit-sim';
import { buildShipMemory } from '@data/memory';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import type { ShipDef, HollowDef } from '@data/ships';
import { childRng } from '@systems/rng';
import { createHollowState, createLandingState } from '@state/initial';
import { phase2ShipOne } from '../support/hollow-world';
import { ROOT_BLOCKS } from '@data/tuning';
import { CLASSIC_FIVE } from '@data/classic-five';
import { MEMORY_LAYOUTS } from '@data/memory';
import { stateFromElements } from '@/types/orbit';
import type { Segment } from '@/types/segment';
import {
  RACK_BLOCKS, CHEW_FULL_DRAIN, TUG_BEAT_PER_PCT, TUG_PITCH_LOW_HZ, TUG_PITCH_HIGH_HZ, HOLLOW_BITE_URGENT_SEC,
} from '@data/tuning';

const h = createHarness6(1, { soulsFound: true });
const state = () => h.store.getState();
const mem = (): Segment[] => state().memory;
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

function fresh(): void {
  h.resetTo('flight');
  phase2ShipOne(h.store);
  h.noFault();
  installTool(h.store, 'repair');
}

// --- Ship 1: NEXT BITE ?:??, POD 01 marked, WALL 18 ✓ -------------------------------------------------------------
{
  fresh();
  const clock = biteClock(state());
  check('ship 1 asleep: NEXT BITE ?:?? (no timer, unknown on purpose), not urgent, not quiet',
    clock.secLeft === null && clock.text === 'NEXT BITE ?:??' && !clock.urgent && !clock.quiet, JSON.stringify(clock));
  const marks = reachMarks(state());
  const bite = marks.bites[0];
  check('ship 1 asleep: the next bite is POD 01, on its left edge, from the root\'s right mouth', marks.bites.length === 1
    && bite?.targetId === 'driver_pod01' && bite.edge === 'left' && bite.hollowId === 'root' && bite.mouth === 'right' && bite.gapBlocks === 0,
    JSON.stringify(marks.bites));
  const wall = marks.gaps[0];
  check('ship 1: rack A\'s 18 free blocks left of the root are one WALL, its right edge on the root',
    marks.gaps.length === 1 && wall?.kind === 'wall' && wall.blocks === 18 && wall.hollowEdge === 'right'
    && wall.label === 'WALL 18 ✓' && wall.word === 'WALL' && wall.count === '18 ✓', JSON.stringify(marks.gaps));

  infectNow(h.store, h.soul('POD 01'));
  const bitten = reachMarks(state());
  check('POD 01 bitten: no longer a target (it is being eaten), the WALL still holds',
    bitten.bites.length === 0 && bitten.gaps.length === 1 && bitten.gaps[0]!.kind === 'wall');
  check('ship 1 awake mid-fight: still NEXT BITE ?:?? (it never spreads)', biteClock(state()).text === 'NEXT BITE ?:??' && state().hollow.phase === 'awake');

  cureNow(h.store, h.soul('POD 01'));
  h.step();
  const quiet = reachMarks(state());
  check('after the fight, dormant: quiet, and no arrows or labels', biteClock(state()).quiet && quiet.bites.length === 0 && quiet.gaps.length === 0,
    `${state().hollow.phase} ${JSON.stringify(quiet)}`);
}

// --- The mini-strip on ship 1 -------------------------------------------------------------------------------------
{
  fresh();
  const rows = miniStripRows(state());
  check('mini-strip: 6 racks, each exactly 64 blocks', rows.length === MEMORY_LAYOUTS.FULL.racks.length && rows.every((cells) => cells.reduce((sum, cell) => sum + cell.blocks, 0) === RACK_BLOCKS),
    rows.map((cells) => cells.reduce((sum, cell) => sum + cell.blocks, 0)).join());
  const rackB = rows[1]!;
  const rackC = rows[2]!;
  const rackD = rows[3]!;
  const kinds = rackB.map((cell) => cell.kind).join();
  check('mini-strip: rack B is the red root, three drivers (POD 02 hurt), then 32 free blocks; racks C and D are the rest of that gap',
    kinds === 'hollow,driver,driver-hurt,driver,free' && rackB.at(-1)!.blocks === 32
    && [rackC, rackD].every((rack) => rack.length === 1 && rack[0]!.kind === 'free' && rack[0]!.blocks === 64 && rack[0]!.segId === rackB.at(-1)!.segId),
    rackB.map((cell) => `${cell.kind}:${cell.blocks}`).join(' '));
  check('mini-strip: POD 02 at 44% is the hurt yellow', rackB[2]!.kind === 'driver-hurt' && rackB[2]!.segId === 'driver_pod02');

  infectNow(h.store, h.soul('POD 01'));
  h.stepFor(5);
  const pod1 = miniStripRows(state())[1]!.find((cell) => cell.segId === 'driver_pod01')!;
  check('mini-strip: POD 01 infected from the left (the root\'s side), its red share = what was eaten', pod1.infected === 'left'
    && pod1.eatenPct !== null && near(pod1.eatenPct, 100 - h.soul('POD 01').integrity) && pod1.eatenPct > 5 && !pod1.healing, JSON.stringify(pod1));
  const cargo = mem().find((seg) => seg.name === 'Cargo Ctrl')!;
  infectNow(h.store, cargo);
  const cargoCell = miniStripRows(state())[0]!.find((cell) => cell.segId === cargo.id)!;
  check('mini-strip: an infected, unscanned ship file shows no share (the hatch: its health is not known)',
    cargoCell.infected !== null && cargoCell.eatenPct === null, JSON.stringify(cargoCell));
}

// --- The chew and the tug ------------------------------------------------------------------------------------------
{
  fresh();
  check('chew: silent with nothing infected', chewLevel(state()) === 0);
  infectNow(h.store, h.soul('POD 01'));
  h.step();
  check('chew: one file at rest chews at drain 2 / CHEW_FULL_DRAIN', near(chewLevel(state()), 2 / CHEW_FULL_DRAIN), `${chewLevel(state())}`);
  check('tug: no repair, no beating tones', tugTone(state()) === null);
  h.keyDown('Space');
  h.stepFor(0.5);
  const burning = isThrustOn(state());
  check('chew: full while the engine delivers thrust (P1: ×2)', burning && chewLevel(state()) === 1, `thrust ${burning}, chew ${chewLevel(state())}`);
  h.keyUp('Space');
  h.step();

  check('the repair starts on POD 01', actionRepair(h.store, h.soul('POD 01')) === null);
  h.step();
  const tone = tugTone(state());
  const pod1 = h.soul('POD 01');
  const heal = repairRatePerSec(pod1.size, 1);
  check('tug: led by POD 01, winning, beating at (heal 18.5 − drain 2) %/s × TUG_BEAT_PER_PCT (8.26 Hz)', tone !== null && tone.segId === pod1.id && tone.winning
    && near(tone.beatHz, (heal - 2) * TUG_BEAT_PER_PCT, 1e-6), JSON.stringify(tone));
  check('tug: its pitch follows POD 01\'s integrity', tone !== null
    && near(tone.pitchHz, TUG_PITCH_LOW_HZ + (TUG_PITCH_HIGH_HZ - TUG_PITCH_LOW_HZ) * pod1.integrity / 100, 1e-6), JSON.stringify(tone));
  const winning = miniStripRows(state())[1]!.find((cell) => cell.segId === 'driver_pod01')!;
  check('mini-strip: green while the repair fights', winning.healing);
  h.keyDown('Space');
  h.step();
  const harder = tugTone(state());
  check('tug: a burn doubling the drain slows the beat (18.5 − 4 %/s → 7.26 Hz)', isThrustOn(state()) && harder !== null
    && near(harder.beatHz, (heal - 4) * TUG_BEAT_PER_PCT, 1e-6), JSON.stringify(harder));
  h.keyUp('Space');
  setPaused(h.store, true);
  check('paused: the chew and the tug fall silent', chewLevel(state()) === 0 && tugTone(state()) === null);
  setPaused(h.store, false);
  h.stepFor(3);
  check('cured: the tug is over', tugTone(state()) === null && !h.soul('POD 01').infected);
}

// --- HALCYON's rack C: NEXT BITE m:ss, GAP 2 / GAP 1, an eaten block bites on ------------------------------------
{
  fresh();
  const ares = CLASSIC_FIVE[0]!;
  const cfg: HollowDef = { wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, landMult: 1.5, seed: null, verbs: null, deal: false, story: 'none' };
  const halcyon: ShipDef = {
    ...ares,
    id: 'halcyon-hud-test',
    memory: {
      ...ares.memory,
      // HALCYON's pod racks with one pod more on each side of the root: POD 05 | GAP 2 | root | GAP 1 | POD 06, POD 07.
      podRacks: { B: 'P P P _40', C: 'P P _2 S _1 P P _29', D: '_64' },
      drivers: { familiesSeedStream: 'families', damage: 'scripted', hurt: [{ pod: 1, integrity: 90 }], lead: 5, firstRun: null },
    },
  };
  const memory = buildShipMemory(halcyon, null, childRng(7, 1, 'families'), false, UNNAMED_HOLLOW, { blocks: ROOT_BLOCKS });
  // A quiet closed orbit (never locks, never crashes), as acceptance 4 flies it.
  const rp = 5500;
  const ra = 11000;
  const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, 0, state().level.planet.mu);
  const wakeAt = state().clock.aiSec + 12;
  h.store.update((d) => {
    d.memory = memory;
    // The landing slice follows the memory (one record per driver: HOLLOW records an eaten driver on its pod).
    d.landing = createLandingState({ ...halcyon.landing, lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 7 }] }, memory,
      { finalShip: false, lead: 5, hurt: halcyon.memory.drivers.hurt, planetR: d.level.planet.R });
    d.hollow = createHollowState(cfg);
    d.hollow.cfg.wake = { afterAiSec: wakeAt, coastLeadSec: null };
    d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
    d.ui.memoryRev++;
  });
  const asleep = biteClock(state());
  check('HALCYON asleep: NEXT BITE 0:12 counts down to the wake (its first bite)', asleep.secLeft !== null && near(asleep.secLeft, 12) && asleep.text === 'NEXT BITE 0:12' && !asleep.urgent,
    JSON.stringify(asleep));
  const marks = reachMarks(state());
  const gapKinds = marks.gaps.map((gap) => `${gap.kind} ${gap.blocks} ${gap.hollowEdge} ${gap.label}`).join(' | ');
  check('HALCYON: GAP 2 left of the root (its right edge on the root) and GAP 1 right of it, both red',
    gapKinds === 'gap 2 right GAP 2 | gap 1 left GAP 1', gapKinds);
  const targets = marks.bites.map((bite) => `${bite.targetId}@${bite.edge}`).join(' ');
  check('HALCYON: the arrows point at POD 05 (right edge) and POD 06 (left edge)', targets === 'driver_pod05@right driver_pod06@left', targets);
  h.stepFor(12 - HOLLOW_BITE_URGENT_SEC + 0.2);
  check('NEXT BITE is urgent in its last seconds', biteClock(state()).urgent);
  h.stepUntil(() => state().hollow.phase === 'awake', 6);
  const awake = biteClock(state());
  check('woken: both bitten, NEXT BITE restarts at the spread timer (0:25)', awake.text === 'NEXT BITE 0:25' && h.soul('POD 05').infected !== undefined && h.soul('POD 06').infected !== undefined,
    JSON.stringify(awake));
  const bitten = reachMarks(state());
  check('bitten: no arrows (both are being eaten), the two gaps stay red', bitten.bites.length === 0 && bitten.gaps.filter((gap) => gap.kind === 'gap').length === 2);
  // Nobody helps: POD 06 (3.5 %/s) is eaten in about 29 s; the eaten block then reaches POD 07 at once.
  h.stepUntil(() => h.maybeSoul('POD 06') === null, 40);
  const after = reachMarks(state());
  const pod7 = after.bites.find((bite) => bite.targetId === 'driver_pod07');
  check('POD 06 eaten: its block bites on (an arrow to POD 07\'s left edge), and the root\'s 1-block gap to it is no longer labelled (no food)',
    pod7 !== undefined && pod7.edge === 'left' && pod7.gapBlocks === 0 && !after.gaps.some((gap) => gap.blocks === 1),
    `${JSON.stringify(after.bites)} ${JSON.stringify(after.gaps.map((gap) => gap.label))}`);
  h.checkMemory();
}

finish();
