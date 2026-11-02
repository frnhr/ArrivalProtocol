// Slice 3c Track WORLD: the world update's rules one by one (slice-3c-plan §6.1 `world/update-rules`; 02 §3.12 steps 1–6,
// §3.4, §3.5; docs/phase3/map-sim/arm_sim.py update_arm). Each rule on run 1's arm with the dice it needs scripted over the
// seeded ones: a gap over the drift limit clears the arm, a gap of exactly 10 keeps it; the 3rd run; authored ships never
// resolve and are gone by run 4; the first ship always leaves; an unvisited final ship waits and a new one sits on its floor;
// the ark pattern kept, tied, off-pattern and making room; the time valve; the repairs from the 5th attempt; the throw
// after 50; determinism; then a 60-run chain for the light share and its late-layer cap, the quotas, names, ARES and the
// final ships by serial, every ShipDef; ARES past run 81; the gap table over 10,000 rolls. Pure (~2 s).
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import type { ArmShip } from '@/types/map';
import type { ArmState, LeaveReason } from '@/types/lineage';
import { updateArm, seededDice, freshArmState, rollLaunchGap, type UpdateDice, type UpdatePass, type ArmUpdate } from '@systems/map-update';
import { armChecks, armReach } from '@systems/map-generator';
import { layerOf } from '@systems/map-geometry';
import { shipDefOf, validateShipDef } from '@data/ships';
import { aresName, finalShipNameOfSerial, UPDATE_SHIP_NAMES } from '@data/ship-names';
import { slotsInLayer, END_SLOTS } from '@data/arm';
import { createRng, hashSeed } from '@systems/rng';
import { LAUNCH_GAP_TABLE, LATE_TIGHT_FROM_LAYER, MAX_LATE_TIGHT_PER_LAYER, NAME_MAX_CHARS, VALVE_YEARS, GEN_MAX_ATTEMPTS } from '@data/tuning';
import { run2Dice, RUN1_RESULTS } from './run2-fixture';
import { chain } from './chain';

const SEED = 1;
const run1 = freshArmState(SEED, 1, 2300, null);
const WORKED = RUN1_RESULTS.map((result) => ({ slot: result.slot, colony: true }));
const visits = (...slots: number[]) => slots.map((slot) => ({ slot, colony: true }));
// The seeded dice with some rolls scripted over them.
const over = (from: Readonly<ArmState>, rolls: Partial<UpdateDice>) => (pass: UpdatePass): UpdateDice => ({ ...seededDice(from.armSeed, from.run + 1, pass), ...rolls });
const throws = (fn: () => unknown): string | null => { try { fn(); return null; } catch (error) { return String(error); } };
const reasonsOf = (update: ArmUpdate, slots: readonly number[]): (LeaveReason | undefined)[] =>
  slots.map((slot) => update.next.departures.find((departure) => departure.slot === slot)?.reason);
const at = (arm: Readonly<ArmState>, name: string): ArmShip | undefined => arm.ships.find((ship) => ship.name === name);

// --- The drift limit ------------------------------------------------------------------------------------------------------
{
  const update = updateArm({ from: run1, visited: visits(0) }, over(run1, { gap: () => 20 }));
  const drifted = update.next.departures.filter((departure) => departure.reason === 'drifted');
  check('a gap of 20 clears the arm, the final ship included: 19 drifted, all `IT WILL COME IN ON ITS OWN`; every ship new',
    drifted.length === 19 && drifted.every((departure) => departure.words === 'own-way') && drifted.some((departure) => departure.name === 'LAST LIGHT')
    && update.next.ships.every((ship) => ship.reportedRun === 2) && update.next.startYear === 2320);
  check('…the new final ship sits at or past its floor (LAST LIGHT 3020 + the gap 20)', update.next.ships[19]!.approachYear >= 3040
    && update.next.ships[19]!.name === 'LODESTAR' && update.next.finalSerial === 1, `${update.next.ships[19]!.approachYear}`);
  const ten = updateArm({ from: run1, visited: WORKED }, over(run1, { gap: () => 10, resolve: () => null }));
  const eleven = updateArm({ from: run1, visited: WORKED }, over(run1, { gap: () => 11, resolve: () => null }));
  check('a gap of exactly 10 keeps last run\'s ships (none drifts); 11 sends every waiting one off',
    ten.reasons.drifted === 0 && ten.next.ships.filter((ship) => ship.reportedRun === 1).length === 14 - ten.reasons.unreachable - ten.reasons['made-room']
    && eleven.reasons.drifted === 14, `${JSON.stringify(ten.reasons)} / ${eleven.reasons.drifted}`);
}

// --- The 3rd run, the authored ships, the first ship ------------------------------------------------------------------------
{
  const calm = (from: Readonly<ArmState>, slots: number[]): ArmUpdate => updateArm({ from, visited: visits(...slots) }, over(from, { gap: () => 1, resolve: () => null }));
  const u2 = calm(run1, [0]);
  const u3 = calm(u2.next, [0]);
  const third = u3.next.ships.filter((ship) => ship.runsOnChart === 3);
  const u4 = calm(u3.next, [0]);
  check('a ship on its 3rd run leaves at the next update (aged, `IT WILL COME IN ON ITS OWN`), and none stays past 3',
    third.length > 0 && third.filter((ship) => !END_SLOTS.includes(ship.slot)).every((ship) => u4.next.departures.some((d) => d.slot === ship.slot && d.reason === 'aged' && d.words === 'own-way'))
    && u4.next.ships.every((ship) => ship.runsOnChart <= 3 || END_SLOTS.includes(ship.slot)), `${third.length} on their 3rd run`);
  check('…a final ship never ages out (the sim: only the drift limit moves it): LAST LIGHT on its 4th run',
    at(u4.next, 'LAST LIGHT')?.runsOnChart === 4);
  check('…authored ships not visited (HALCYON, KESTREL, VESPER) wait through runs 2 and 3, and none is left by run 4',
    ['HALCYON', 'KESTREL', 'VESPER'].every((name) => at(u3.next, name)?.runsOnChart === 3 && at(u4.next, name) === undefined));
  const asked: string[] = [];
  const all = updateArm({ from: run1, visited: visits(0) }, over(run1, { gap: () => 1, resolve: (ship) => { asked.push(ship.name); return 'core-coming'; } }));
  check('authored ships never resolve by chance: with every roll a resolve, only generated ships leave; nobody asks for HALCYON, KESTREL, VESPER or LAST LIGHT',
    ['HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'].every((name) => at(all.next, name) !== undefined && !asked.includes(name))
    && all.reasons.resolved === asked.length && asked.length === 15, `${asked.length}: ${JSON.stringify(all.reasons)}`);
  const none = updateArm({ from: run1, visited: [] }, over(run1, { gap: () => 1, resolve: () => null }));
  check('the first ship always leaves: done when visited, `first-past` (said nowhere) when not; ARES-VIII takes w0',
    isDeepStrictEqual(none.next.departures[0], { slot: 0, name: 'ARES-VII', reason: 'first-past', words: null })
    && u2.next.departures[0]?.reason === 'done' && none.next.ships[0]!.name === 'ARES-VIII' && none.next.ships[0]!.approachYear === 2301);
}

// --- The final ship ---------------------------------------------------------------------------------------------------------
{
  const short = updateArm({ from: run1, visited: visits(0, 2, 5) }, over(run1, { gap: () => 1, resolve: () => null }));
  const kept = short.next.ships[19]!;
  check('an unvisited final ship waits (LAST LIGHT, 3020, its 2nd run); the serial stays 0',
    kept.name === 'LAST LIGHT' && kept.approachYear === 3020 && kept.runsOnChart === 2 && short.next.finalSerial === 0
    && isDeepStrictEqual(short.next.lastFinal, { name: 'LAST LIGHT', year: 3020 }));
  const reached = updateArm({ from: short.next, visited: visits(0, 3, 6, 9, 11, 17, 19) }, over(short.next, { gap: () => 3 }));
  check('…once reached, a new one comes by serial (LODESTAR, serial 1), at or past its floor (3020 + the gap 3)',
    reached.next.ships[19]!.name === 'LODESTAR' && reached.next.finalSerial === 1 && reached.next.ships[19]!.approachYear >= 3023);
  const same = updateArm({ from: run1, visited: WORKED }, over(run1, { gap: () => 0 }));
  check('…a gap of 0 still floors it a year later (02 §3.4: max(gap, 1)): at or past 3021', same.next.ships[19]!.approachYear >= 3021
    && same.next.startYear === 2300, `${same.next.ships[19]!.approachYear}`);
}

// --- The ark pattern -----------------------------------------------------------------------------------------------------
{
  // Kept: §3.14 (world/update-fixture). Tied: every ark visited, so none waits; the dice say 4 and 6, whose layers are full.
  let tieAsked = false;
  const tie = updateArm({ from: run1, visited: visits(0, 6, 11, 17, 19) }, over(run1, { gap: () => 1, resolve: () => null, patternTie: () => { tieAsked = true; return [4, 6]; } }));
  const arkLayers = tie.next.ships.filter((ship) => ship.kind === 'ark').map((ship) => layerOf(ship.slot)).sort();
  check('a tie (no ark waiting) is the dice\'s: 4 and 6 get an ark each, 3, 5 and 7 none', tieAsked && arkLayers.join() === '4,6', arkLayers.join());
  const madeRoom = tie.next.departures.filter((departure) => departure.reason === 'made-room');
  check('…layers 4 and 6 had no empty slot: their oldest generated ship made room (`ANOTHER CORE IS ON ITS WAY`), the ark took its slot',
    madeRoom.length === 2 && madeRoom.every((departure) => departure.words === 'core-coming'
      && tie.next.ships[departure.slot]!.kind === 'ark' && tie.next.ships[departure.slot]!.reportedRun === 2), JSON.stringify(madeRoom));
  // Off-pattern: a waiting ark in layer 4 while VESPER (authored, layer 5) forces 3, 5, 7.
  const odd: ArmState = { ...run1, ships: run1.ships.map((ship) => (ship.name === 'CURLEW' ? { ...ship, kind: 'ark' as const } : ship)) };
  const off = updateArm({ from: odd, visited: visits(0, 2, 5) }, over(odd, { gap: () => 1, resolve: () => null }));
  check('an ark off the pattern an authored ark forces leaves (`ANOTHER CORE IS ON ITS WAY`); VESPER keeps 3, 5, 7',
    isDeepStrictEqual(off.next.departures.find((departure) => departure.name === 'CURLEW'), { slot: 7, name: 'CURLEW', reason: 'off-pattern-ark', words: 'core-coming' })
    && off.next.ships.filter((ship) => ship.kind === 'ark').every((ship) => [3, 5, 7].includes(layerOf(ship.slot))));
}

// --- The time valve -------------------------------------------------------------------------------------------------------
{
  const passes: UpdatePass[] = [];
  const forced = updateArm({ from: run1, visited: WORKED }, (pass) => { passes.push(pass); return seededDice(run1.armSeed, 2, pass); }, { valveFloor: 70 });
  const gap = forced.next.gap;
  check('the valve (forced at 70 pods): +11 years, every waiting ship drifts off, valveYears 11, the valve\'s own dice',
    forced.valveOpened && forced.next.valveYears === VALVE_YEARS && forced.next.startYear === 2300 + gap + VALVE_YEARS
    && forced.next.ships.every((ship) => ship.reportedRun === 2 && ship.timedAgainstStart === forced.next.startYear)
    && forced.reasons.drifted === 14 && passes.join() === 'first,valve', `${passes.join()} ${JSON.stringify(forced.reasons)}`);
  check('…its new ships keyed from attempt GEN_MAX_ATTEMPTS on (no ShipKey shared with the first pass); the floor reads the whole gap',
    forced.next.ships.every((ship) => ship.attempt >= GEN_MAX_ATTEMPTS) && forced.next.ships[19]!.approachYear >= 3020 + gap + VALVE_YEARS);
  const normal = updateArm({ from: run1, visited: WORKED });
  check('…and it does not open on a normal arm (the floor 63)', !normal.valveOpened && normal.bestPods >= 63 && normal.next.valveYears === 0);
}

// --- Repairs and the throw --------------------------------------------------------------------------------------------------
{
  // §3.14's world, with PATIENCE (Tessaly, layer 2) timed so early that it reaches ALBATROSS (the waiting ark at Pell) by one
  // hop, for the first `bad` attempts.
  const early = (bad: number): (pass: UpdatePass) => UpdateDice => {
    const base = run2Dice();
    return () => ({
      ...base,
      timing: (key, years, layer) => (key.slot === 2 && key.attempt < bad ? { approachYear: 2301, late: false } : base.timing(key, years, layer)),
      name: (pool) => pool[0]!,
    });
  };
  const four = updateArm({ from: run1, visited: WORKED }, early(4));
  check('four failed attempts re-roll only the new ships: the 5th passes, ALBATROSS still waits', four.attempts === 5
    && four.reasons.unreachable === 0 && at(four.next, 'ALBATROSS')?.runsOnChart === 2, `${four.attempts} ${JSON.stringify(four.reasons)}`);
  const six = updateArm({ from: run1, visited: WORKED }, early(6));
  check('from the 5th failure a waiting ship that is part of it leaves (ALBATROSS, `IT WILL COME IN ON ITS OWN`) and a new ark takes Pell',
    six.attempts > 5 && reasonsOf(six, [6])[0] === 'unreachable' && six.next.departures.find((d) => d.slot === 6)?.words === 'own-way'
    && six.next.ships[6]!.kind === 'ark' && six.next.ships[6]!.reportedRun === 2 && armChecks(six.next.ships).length === 0,
    `${six.attempts} ${JSON.stringify(six.reasons)}`);
  const error = throws(() => updateArm({ from: run1, visited: WORKED }, over(run1, { timing: () => ({ approachYear: 1000, late: false }) })));
  check('impossible dice throw after GEN_MAX_ATTEMPTS, with the problems, the plan and the seed', error !== null
    && error.includes(`no valid arm in ${GEN_MAX_ATTEMPTS} attempts`) && error.includes('seed 1') && error.includes('plan'), error ?? '');
  const badPick = throws(() => updateArm({ from: run1, visited: visits(0, 6, 11, 17, 19) }, over(run1, { patternTie: () => [3, 5, 7], pick: () => 99 })));
  check('a scripted die that picks outside what it was offered throws', badPick !== null && badPick.includes('not one of'), badPick ?? '');
}

// --- Determinism ------------------------------------------------------------------------------------------------------------
{
  const a = updateArm({ from: run1, visited: WORKED });
  const b = updateArm({ from: run1, visited: WORKED });
  const other = freshArmState(2, 1, 2300, null);
  const c = updateArm({ from: other, visited: WORKED });
  check('the update is deterministic (same input, same arm); another arm seed rolls another', isDeepStrictEqual(a, b)
    && !isDeepStrictEqual(a.next.ships.map((ship) => ship.name), c.next.ships.map((ship) => ship.name)));
}

// --- A 60-run chain: shares, quotas, names, ShipDefs ------------------------------------------------------------------------
{
  const rows = chain(2024, 60, 'mix');
  const arms = [run1, ...rows.flatMap((row) => (row.update ? [row.update.next] : []))];
  const crowded = arms.filter((arm) => slotsInLayer(5).concat(slotsInLayer(6), slotsInLayer(7)).some((slot) =>
    slotsInLayer(layerOf(slot)).filter((x) => arm.ships[x]!.kind === 'light').length > MAX_LATE_TIGHT_PER_LAYER));
  const lights = arms.slice(1).map((arm) => arm.ships.filter((ship) => ship.kind === 'light').length);
  const meanLights = lights.reduce((sum, n) => sum + n, 0) / lights.length;
  check(`the light share is restored (mean ${meanLights.toFixed(2)} light ships per arm; sim 5.82, band 5.3–6.3), never a 3rd light ship in a layer from ${LATE_TIGHT_FROM_LAYER}`,
    meanLights >= 5.3 && meanLights <= 6.3 && crowded.length === 0, `${crowded.length} crowded`);
  const quotaBad: string[] = [];
  let exact = 0;
  for (const arm of arms) {
    const ships = arm.ships;
    const corrupted = ships.filter((ship) => ship.reserved.resident?.kind === 'corrupted');
    if (corrupted.length > 2 || corrupted.some((ship) => ship.kind === 'ark' || ship.template !== 'capture' || layerOf(ship.slot) < 4)) quotaBad.push(`run ${arm.run}: corrupted`);
    if (corrupted.some((ship) => ship.reserved.resident!.shown === 'unknown' && (ship.memoryClass === 'TIGHT' || layerOf(ship.slot) < 6))) quotaBad.push(`run ${arm.run}: hidden`);
    if (corrupted.length === 2 && (Math.abs(layerOf(corrupted[0]!.slot) - layerOf(corrupted[1]!.slot)) < 2 || armReach(ships, corrupted[0]!.slot, corrupted[1]!.slot))) quotaBad.push(`run ${arm.run}: corrupted linked`);
    if (ships.filter((ship) => ship.reserved.resident?.kind === 'sleeping').length > 1) quotaBad.push(`run ${arm.run}: two sleepers`);
    const unknown = ships.filter((ship) => ship.reserved.unknownEvent !== null);
    if (unknown.length > 3 || new Set(unknown.map((ship) => layerOf(ship.slot))).size !== unknown.length
      || new Set(unknown.map((ship) => ship.reserved.unknownEvent)).size !== unknown.length) quotaBad.push(`run ${arm.run}: the ? ships`);
    if (ships.some((ship) => (ship.kind === 'first' || ship.kind === 'final' || ship.authored === 'vesper')
      && (ship.reserved.resident !== null || ship.reserved.unknownEvent !== null))) quotaBad.push(`run ${arm.run}: a resident or ? on the first, a final ship or VESPER`);
    if (ships.filter((ship) => ship.reserved.resident?.kind === 'left').length === 5 && unknown.length === 3
      && ships.reduce((sum, ship) => sum + ship.reserved.fragments, 0) === 5) exact++;
  }
  check('02 §3.5\'s limits hold on every arm of the chain (corrupted ≤ 2, apart, never ark; one sleeper; the ? ships in distinct layers; none on the first or final ship or VESPER)',
    quotaBad.length === 0, quotaBad.slice(0, 3).join(' | '));
  console.log(`INFO  every quota exact (5 departed residents, 3 ? ships, 5 fragments) on ${exact} of ${arms.length} arms (a top-up skips a quota the waiting ships leave no slot for)`);
  const dupes = arms.filter((arm) => new Set(arm.ships.map((ship) => ship.name)).size !== arm.ships.length);
  const taken = rows.flatMap((row) => (row.update === null ? [] : row.update.next.ships.filter((ship) => ship.runsOnChart === 1 && ship.kind !== 'first' && ship.kind !== 'final'
    && !UPDATE_SHIP_NAMES.includes(ship.name))));
  const backAtOnce = rows.flatMap((row) => (row.update === null ? [] : row.update.next.ships.filter((ship) => ship.runsOnChart === 1
    && row.update!.next.departures.some((departure) => departure.name === ship.name)).map((ship) => ship.name)));
  check('names are unique on every chart, and every new generated ship is named from the update\'s pool (36 names: review M5)', dupes.length === 0 && taken.length === 0);
  check('…and never after a ship that left the chart in the same update (review M5: no PETREL in the first desk\'s box beside a new PETREL)',
    backAtOnce.length === 0, backAtOnce.slice(0, 5).join(', '));
  let serial = 0;
  const serialsOk = arms.slice(1).every((arm, i) => {
    const fresh = arm.ships[19]!.reportedRun === arm.run;
    if (fresh) serial++;
    return arm.finalSerial === serial && (!fresh || arm.ships[19]!.name === finalShipNameOfSerial(serial)) && arm.ships[0]!.name === aresName(i + 2);
  });
  check(`ARES by run (ARES-VIII … ${aresName(arms.length)}), each new final ship by the next serial (${serial} new in ${arms.length - 1} updates)`, serialsOk);
  const invalid = arms.flatMap((arm) => arm.ships.filter((ship) => { try { validateShipDef(shipDefOf(ship)); return false; } catch { return true; } }));
  check('every ShipDef on every arm of the chain is valid; no ship stays past its 3rd run', invalid.length === 0
    && arms.every((arm) => arm.ships.every((ship) => ship.runsOnChart <= 3 || END_SLOTS.includes(ship.slot))));
  const late = rows.at(-1)!.update!.next;
  const past = updateArm({ from: { ...late, run: 81 }, visited: visits(0) });
  check('ARES past run 81 in Arabic numerals (risk 6): ARES-LXXXVII on 81, ARES-88 on 82, within NAME_MAX_CHARS; the update to run 82 works',
    aresName(81) === 'ARES-LXXXVII' && aresName(82) === 'ARES-88' && aresName(999).length <= NAME_MAX_CHARS && past.next.ships[0]!.name === 'ARES-88');
}

// --- The gap table --------------------------------------------------------------------------------------------------------
{
  const rng = createRng(hashSeed('world/update-rules:gap'));
  const gaps = Array.from({ length: 10_000 }, () => rollLaunchGap(rng));
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const share = (years: number): number => gaps.filter((gap) => gap === years).length / gaps.length;
  const off = LAUNCH_GAP_TABLE.filter(([years, chance]) => Math.abs(share(years) - chance) > 0.015);
  check(`the gap table over 10,000 rolls: mean ${mean.toFixed(2)} (2.785 ± 0.15), median ${sorted[5000]}, max ${sorted.at(-1)}, each row within 1.5 points`,
    Math.abs(mean - 2.785) <= 0.15 && sorted[5000] === 2 && sorted.at(-1)! <= 35 && off.length === 0, off.map(([years]) => `${years}: ${share(years)}`).join(', '));
}

finish();
