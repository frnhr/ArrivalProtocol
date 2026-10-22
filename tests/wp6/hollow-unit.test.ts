// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// WP8 acceptance 3 is added here: FIREWALL.sys blocks the spread on its side (next to the root, and inside a
// GAP), it can't be infected or eaten, and an upgrade file is food.
// WP6 acceptance 2: stepHollow, pure (no store, no clock), on hand-built memory.
// • a 3-block gap lets the infection through; a 4-block gap is a WALL (wall-held, nothing bitten);
// • drain 2/s eats a 100% file in 50 ± 0.1 s, and in 25 s while the engine fires (burnMult 2);
// • an eaten file turns hollow in place (same size, same address) and bites on the NEXT interval;
// • a cure (the repair's cureInfection) grants 10 s of recoil: bites skip it, then recoil-end, then
//   the next bite takes it;
// • REPAIR CHARGE (and other hollow) blocks the spread on that side;
// • a Core at 0 emits core-zero once and is never turned into hollow.
// Plus the edge cases §9 WP6 lists that are pure: integrity clamps at 0, the spread ignores racks,
// an unscanned ship file is bitten like any file, ship 1's scripted bite takes the cluster next to
// the root by address (C12 moved away: the one now adjacent), and the reach reads as the painter
// will draw it (GAP 3 vs WALL 4, edge, blocked, recoiling).
import { check, finish } from '../wp1/harness';
import { stepHollow, hollowReach, type HollowEvent, type HollowStepCtx } from '@systems/hollow';
import { cureInfection } from '@state/actions';
import { freeSegment } from '@systems/memory-ops';
import { createRng } from '@systems/rng';
import { validateHollowDef, SHIPS, type HollowDef } from '@data/ships';
import type { HollowState } from '@state/schema';
import type {
  Segment, HollowSegment, SoulSegment, CoreSegment, RedundancySegment, ShipSegment, FirewallSegment, UpgradeSegment,
} from '@/types/segment';
import { isInfectable } from '@state/selectors';
import { HOLLOW_RECOIL_SEC, WALL_MIN_BLOCKS, HOLLOW_SCRIPTED_BITE_DELAY_SEC } from '@data/tuning';
import { createDealState, createHollowState } from '@state/initial';

const DT = 0.05;

const SPREAD: HollowDef = {
  wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: 20, drainPerSec: 2, burnMult: 2, printMult: 1, seed: null, verbs: null, deal: false, story: 'none',
};
const NO_SPREAD: HollowDef = { ...SPREAD, spreadEverySec: null };
const SHIP1 = SHIPS[0]!.hollow;

const root = (id = 'root'): HollowSegment => ({ id, name: '???', type: 'hollow', size: 8, root: true, locked: true, owner: '???' });
const soul = (code: string, integrity = 100): SoulSegment => ({
  id: `soul_${code}`, name: `${code} · TEST`, type: 'soul', size: 8, integrity, cluster: code, family: 'Test', souls: 200, featured: [], sealed: false,
});
const core = (integrity = 100): CoreSegment => ({ id: 'core', name: 'AI Core', type: 'core', size: 16, integrity, scanned: true, capacity: 2 });
const charge = (): RedundancySegment => ({ id: 'redund', name: 'Repair Charge', type: 'redundancy', size: 36, used: 36, capacity: 72 });
const shipFile = (): ShipSegment => ({ id: 'cargo', name: 'Cargo Ctrl', type: 'ship', size: 6, integrity: 100, scanned: false, role: 'cargo' });

interface Run {
  memory: Segment[];
  hollow: HollowState;
  aiNow: number;
  events: { at: number; event: HollowEvent }[];
}

function newRun(memory: Segment[], cfg: HollowDef, phase: HollowState['phase'] = 'asleep'): Run {
  // (WP9 review round 2: a timed wake reads the debris dodge's hold, wakeHeld / wakeHoldEndedAtAi; none here.)
  return {
    memory,
    // WP10: THE DEAL's state (none offered: no pause, no haste).
    // WP12 p3 (strict test tsc): a whole HollowState (the fields later packages added at their fresh values).
    hollow: { ...createHollowState(SHIPS[0]!), cfg, phase, story: 'none', biteInSec: phase === 'awake' ? cfg.spreadEverySec : null, wakeAtAi: null, wakeHeld: false, wakeHoldEndedAtAi: null, deal: createDealState() },
    aiNow: 0,
    events: [],
  };
}

// Steps `run` for `seconds` (or until `until` holds), DT at a time, like the AI tick.
function step(run: Run, seconds: number, opts: Partial<Pick<HollowStepCtx, 'thrustDelivered' | 'printingActive' | 'loopClosed'>> = {}, until?: () => boolean): void {
  const end = run.aiNow + seconds;
  while (run.aiNow < end - 1e-9) {
    run.aiNow += DT;
    const events = stepHollow(run.memory, DT, run.hollow.cfg, {
      thrustDelivered: opts.thrustDelivered ?? false,
      printingActive: opts.printingActive ?? false,
      aiNow: run.aiNow,
      rng: createRng(1),
      hollow: run.hollow,
      loopClosed: opts.loopClosed ?? false,
      owner: '???',
      // No coast, no dodge, no busy flight (the later packages' wake and seed holds).
      coastAtAi: null, wakeHeld: false, firstSeedHeld: false,
    });
    events.forEach((event) => run.events.push({ at: run.aiNow, event }));
    if (until?.()) return;
  }
}

const find = (run: Run, id: string): Segment | undefined => run.memory.find((seg) => seg.id === id);
const infectedAt = (run: Run, id: string): number | null => run.events.find(({ event }) => event.kind === 'infect' && event.segId === id)?.at ?? null;

// --- The WALL rule: 3 lets it through, 4 holds ------------------------------------------------------
{
  const three = newRun([root(), freeSegment(WALL_MIN_BLOCKS - 1), soul('C01'), freeSegment(40)], SPREAD);
  step(three, DT);
  check('a 3-block gap lets the infection through (bitten at the wake, from the left)',
    (find(three, 'soul_C01') as SoulSegment).infected?.side === 'left', JSON.stringify(three.events.map((entry) => entry.event.kind)));
  const four = newRun([root(), freeSegment(WALL_MIN_BLOCKS), soul('C01'), freeSegment(40)], SPREAD);
  step(four, DT);
  check('a 4-block gap is a WALL: nothing bitten, the bite fizzles (wall-held, gap 4)',
    !(find(four, 'soul_C01') as SoulSegment).infected
      && four.events.some(({ event }) => event.kind === 'wall-held' && event.side === 'right' && event.gapBlocks === WALL_MIN_BLOCKS));
  const reach = hollowReach(three.memory, 0);
  check('reach: left is the edge of memory, right a 3-block GAP to C01 (already infected now)',
    reach.length === 2 && reach[0]!.verdict === 'edge' && reach[1]!.gapBlocks === 3 && reach[1]!.verdict === 'infected', JSON.stringify(reach));
  const wallReach = hollowReach(four.memory, 0);
  check('reach: the 4-block gap reads WALL (the painter\'s green bracket)', wallReach[1]!.verdict === 'wall' && wallReach[1]!.gapIds.length === 1);
}

// --- The drain: 50 s idle, 25 s while firing ---------------------------------------------------------
for (const firing of [false, true]) {
  const target = soul('C12');
  target.infected = { side: 'right' };
  const run = newRun([soul('C11'), target, root(), freeSegment(40)], NO_SPREAD, 'awake');
  step(run, 120, { thrustDelivered: firing }, () => !find(run, 'soul_C12'));
  const eaten = run.events.find(({ event }) => event.kind === 'consume');
  const expected = firing ? 25 : 50;
  check(`drain 2/s${firing ? ' ×2 while firing' : ''}: a 100% cluster is eaten in ${expected} ± 0.1 s`,
    eaten !== undefined && Math.abs(eaten.at - expected) <= 0.1, `${eaten?.at.toFixed(3)} s`);
  const block = run.memory[1]!;
  check(`…and turns hollow in place: same blocks, not the root, unlocked, remembers what it ate${firing ? ' (firing)' : ''}`,
    block.type === 'hollow' && block.size === 8 && !block.root && !block.locked && block.ate === 'C12 · TEST' && run.memory.length === 4);
  check(`…integrity clamps at 0 (the eaten soul object reads 0, never negative)${firing ? ' (firing)' : ''}`,
    eaten?.event.kind === 'consume' && eaten.event.eaten.integrity === 0);
}

// --- An eaten file bites on the next interval -----------------------------------------------------------
{
  const run = newRun([root(), freeSegment(1), soul('C01'), soul('C02'), freeSegment(60)], SPREAD);
  step(run, 75);
  const eatenAt = run.events.find(({ event }) => event.kind === 'consume')?.at ?? null;
  const c02At = infectedAt(run, 'soul_C02');
  check('C01 (gap 1) is bitten at the wake and eaten at 50 s', infectedAt(run, 'soul_C01') !== null && eatenAt !== null && Math.abs(eatenAt - 50) < 0.1, `${eatenAt}`);
  check('the new hollow block bites C02 on the NEXT interval (60 s), not before', c02At !== null && Math.abs(c02At - 60) < DT + 1e-9, `${c02At}`);
  const bites = run.events.filter(({ event }) => event.kind === 'bite').map(({ at }) => Math.round(at));
  check('one global timer: bites at 0, 20, 40, 60 (NEXT BITE)', bites.join() === '0,20,40,60', bites.join());
}
{
  // The root ends rack A (blocks 56–63), C01 starts rack B (64): racks are places, not walls.
  const run = newRun([freeSegment(56), root(), soul('C01'), freeSegment(312)], SPREAD);
  step(run, DT);
  check('the spread crosses rack boundaries: a root at the end of rack A bites C01 at the start of rack B',
    (find(run, 'soul_C01') as SoulSegment).infected?.side === 'left');
}

// --- A cure grants 10 s of recoil -------------------------------------------------------------------------
{
  const target = soul('C01', 60);
  target.infected = { side: 'left' };
  const run = newRun([root(), freeSegment(3), target, freeSegment(40)], { ...SPREAD, spreadEverySec: 4 }, 'awake');
  step(run, 1);
  target.integrity = 100;
  cureInfection(target, run.aiNow);
  const curedAt = run.aiNow;
  check('cureInfection: the infection clears and the file recoils for HOLLOW_RECOIL_SEC',
    !target.infected && target.recoilUntilAi !== undefined && Math.abs(target.recoilUntilAi - (curedAt + HOLLOW_RECOIL_SEC)) < 1e-9);
  step(run, HOLLOW_RECOIL_SEC - 0.5);
  check('bites skip a recoiling file (reach: recoiling) for the whole recoil', !target.infected
    && hollowReach(run.memory, run.aiNow)[1]!.verdict === 'recoiling' && run.events.filter(({ event }) => event.kind === 'bite').length >= 2);
  step(run, 6);
  const endAt = run.events.find(({ event }) => event.kind === 'recoil-end')?.at ?? null;
  const rebiteAt = run.events.filter(({ event }) => event.kind === 'infect' && event.segId === target.id).at(-1)?.at ?? null;
  check('recoil-end fires 10 s after the cure, and the next bite after it takes the file again',
    endAt !== null && Math.abs(endAt - (curedAt + HOLLOW_RECOIL_SEC)) < DT + 1e-9 && rebiteAt !== null && rebiteAt > endAt && rebiteAt - endAt <= 4 + DT,
    `cured ${curedAt.toFixed(2)}, recoil-end ${endAt?.toFixed(2)}, re-bitten ${rebiteAt?.toFixed(2)}`);
}

// --- Blockers: REPAIR CHARGE and other hollow ---------------------------------------------------------------
{
  const run = newRun([soul('C01'), charge(), root(), root('root2'), soul('C02'), freeSegment(40)], SPREAD);
  step(run, 30);
  const reach = hollowReach(run.memory, run.aiNow);
  check('REPAIR CHARGE blocks the spread: C01 behind it is never bitten (reach: blocked)',
    !(find(run, 'soul_C01') as SoulSegment).infected && reach.find((entry) => entry.hollowId === 'root' && entry.side === 'left')?.verdict === 'blocked');
  check('other hollow is no food either: the two roots never infect each other, but root2 bites C02',
    reach.find((entry) => entry.hollowId === 'root' && entry.side === 'right')?.verdict === 'blocked'
      && infectedAt(run, 'soul_C02') !== null);
}

// --- WP8 acceptance 3: FIREWALL.sys is a non-infectable blocker; upgrade files are food ----------------------
// (§6.6: FIREWALL joins REPAIR CHARGE and other hollow as a blocker; §9 WP8 edge case "FIREWALL moved next to
// the root (blocks that side)".)
{
  const firewall = (id = 'fw'): FirewallSegment => ({ id, name: 'Firewall.sys', type: 'firewall', size: 2 });
  const trim = (): UpgradeSegment => ({ id: 'trim', name: 'Fuel Trim', type: 'upgrade', upgrade: 'fuel-trim', size: 2, integrity: 100, scanned: true });
  check('a FIREWALL can\'t be infected (isInfectable false: it has no health to eat)', !isInfectable(firewall()));
  // Right against the root, with a cluster behind it and a GAP of 1 on the other side.
  const run = newRun([soul('C01'), firewall(), root(), freeSegment(1), soul('C02'), freeSegment(40)], SPREAD);
  step(run, 45);
  const reach = hollowReach(run.memory, run.aiNow);
  const left = reach.find((entry) => entry.hollowId === 'root' && entry.side === 'left');
  check('a FIREWALL next to the root blocks that side: the cluster behind it is never bitten in 45 s (two bites)',
    !(find(run, 'soul_C01') as SoulSegment).infected && left?.verdict === 'blocked' && left.neighbourId === 'fw'
      && find(run, 'fw')?.type === 'firewall', JSON.stringify(left));
  check('…while the open side bites on: C02 across GAP 1 is infected at the wake', infectedAt(run, 'soul_C02') !== null);
  check('…and the FIREWALL is never bitten or consumed (no event names it)',
    run.events.every(({ event }) => !('segId' in event) || event.segId !== 'fw') && run.events.every(({ event }) => event.kind !== 'consume' || event.eaten.id !== 'fw'));
  // A FIREWALL in the middle of a GAP: HOLLOW meets it first (the first occupied segment) and stops there.
  const gapped = newRun([root(), freeSegment(1), firewall('fw2'), freeSegment(1), soul('C03'), freeSegment(40)], SPREAD);
  step(gapped, 25);
  check('a FIREWALL placed inside a GAP stops the bite: the cluster past it stays clean (HOLLOW can\'t bite past it)',
    !(find(gapped, 'soul_C03') as SoulSegment).infected
      && hollowReach(gapped.memory, gapped.aiNow).find((entry) => entry.side === 'right')?.verdict === 'blocked');
  // An upgrade file is food (§6.6 INFECTABLE: upgrade), like the AI's own files.
  const food = newRun([root(), freeSegment(2), trim(), freeSegment(40)], SPREAD);
  step(food, DT);
  check('an upgrade file (FUEL TRIM) is food: bitten across a GAP from the left', (find(food, 'trim') as UpgradeSegment).infected?.side === 'left');
  step(food, 100 / SPREAD.drainPerSec + 1);
  check('…and eaten into HOLLOW in place (its effect goes with it)', food.memory[2]?.type === 'hollow' && food.memory[2]?.size === 2);
}

// --- The Core never turns ---------------------------------------------------------------------------------
{
  const theCore = core(0.5);
  theCore.infected = { side: 'left' };
  const run = newRun([root(), theCore, freeSegment(360)], NO_SPREAD, 'awake');
  step(run, 3);
  const zero = run.events.filter(({ event }) => event.kind === 'core-zero');
  check('a Core at 0 emits core-zero once and is not converted (still the Core, integrity 0)',
    zero.length === 1 && find(run, 'core')?.type === 'core' && theCore.integrity === 0 && run.events.every(({ event }) => event.kind !== 'consume'),
    `${zero.length} core-zero, ${run.memory[1]!.type}`);
}

// --- An unscanned ship file is bitten like any file ------------------------------------------------------------
{
  const file = shipFile();
  const run = newRun([root(), file, freeSegment(40)], SPREAD);
  step(run, DT);
  check('an unscanned ship file is food: bitten from the left (its health stays hidden: the hatch)', file.infected?.side === 'left' && !file.scanned);
}

// --- Ship 1's scripted bite --------------------------------------------------------------------------------------
{
  const run = newRun([soul('C11'), soul('C12'), root(), freeSegment(72)], SHIP1);
  step(run, 2, { loopClosed: false });
  check('ship 1 sleeps until the loop closes (no bite, no drain)', run.hollow.phase === 'asleep' && run.events.length === 0);
  const closedAt = run.aiNow + DT;
  step(run, HOLLOW_SCRIPTED_BITE_DELAY_SEC - DT, { loopClosed: true });
  check(`the loop closes: nothing yet for ${HOLLOW_SCRIPTED_BITE_DELAY_SEC} s (CAPTURED has its moment first)`,
    run.hollow.phase === 'asleep' && run.events.length === 0 && !(find(run, 'soul_C12') as SoulSegment).infected);
  // (+1 tick: the AI clock adds up 0.05 s steps, so the moment can fall one tick late.)
  step(run, 3 * DT, { loopClosed: true });
  const c12 = find(run, 'soul_C12') as SoulSegment;
  const bitAt = infectedAt(run, 'soul_C12');
  check(`…then C12 (next to the root) is bitten from the right, once, ${HOLLOW_SCRIPTED_BITE_DELAY_SEC} s after the loop closed; the WALL on the right stays silent`,
    c12.infected?.side === 'right' && run.events.filter(({ event }) => event.kind === 'infect').length === 1
      && bitAt !== null && Math.abs(bitAt - closedAt - HOLLOW_SCRIPTED_BITE_DELAY_SEC) < DT + 1e-9
      && !run.events.some(({ event }) => event.kind === 'wall-held') && run.hollow.biteInSec === null,
    `closed ${closedAt.toFixed(2)}, bitten ${bitAt?.toFixed(2)}`);
  step(run, 10, { loopClosed: true });
  check('ship 1 never spreads (C11 stays clean), NEXT BITE — (no timer)', !(find(run, 'soul_C11') as SoulSegment).infected && run.hollow.biteInSec === null);
}
{
  // The bite lands HOLLOW_SCRIPTED_BITE_DELAY_SEC after the FIRST close, even if the path opens again
  // meanwhile: the capture closed the loop, and HOLLOW has noticed.
  const run = newRun([soul('C11'), soul('C12'), root(), freeSegment(72)], SHIP1);
  step(run, DT, { loopClosed: true });
  step(run, HOLLOW_SCRIPTED_BITE_DELAY_SEC, { loopClosed: false });
  check('the bite still lands when the path opened again after closing', (find(run, 'soul_C12') as SoulSegment).infected?.side === 'right');
}
{
  // C12 moved away before the bite: the cluster now next to the root (C11, 2 free blocks between) is bitten.
  const run = newRun([soul('C11'), freeSegment(2), root(), freeSegment(72), soul('C12')], SHIP1);
  step(run, HOLLOW_SCRIPTED_BITE_DELAY_SEC + DT, { loopClosed: true });
  check('C12 moved away: the bite targets whichever cluster is adjacent by address (C11 across a 2-block gap)',
    (find(run, 'soul_C11') as SoulSegment).infected?.side === 'right' && !(find(run, 'soul_C12') as SoulSegment).infected);
}

// --- The design rule (§6.6) ---------------------------------------------------------------------------------------
{
  const throws = (cfg: HollowDef): string | null => { try { validateHollowDef('test', cfg); return null; } catch (error) { return (error as Error).message; } };
  check('every ship passes the heal rule: heal(8) = 18.5%/s > 1.5 × drain × max(burn, print)', SHIPS.every((ship) => throws(ship.hollow) === null));
  check('a drain the heal cannot beat by 1.5× throws (drain 6.5, burn ×2)', throws({ ...SPREAD, drainPerSec: 6.5 }) !== null, throws({ ...SPREAD, drainPerSec: 6.5 }) ?? '');
  check('the ship-2 config of the sim passes (drain 3.5, print ×1.5)', throws({ ...SPREAD, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, printMult: 1.5 }) === null);
  // WP12 p3 (strict test tsc): this check was written before WP9 built seeds, and it passed only because its seed had no
  // firstAfterSec (undefined ≥ 0 is false). Seeds exist now; what it exercises is that a bad first-seed time throws.
  check('a seed with a bad first-seed time throws loudly instead of being ignored', throws({ ...SPREAD, seed: { everySec: 50, firstAfterSec: -1, target: 'walls' } }) !== null);
}

finish();
