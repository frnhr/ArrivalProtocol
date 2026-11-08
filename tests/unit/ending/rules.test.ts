// Slice 7a, Track FINALE (docs/phase3/impl/slice-7-plan.md §6.1 ending/rules): the FINALE's rules, pure, on hand-built
// states (no store, no tick):
// • THE EMPTY SHIP (R8): in orbit after the landing (locked or accepted), no pod aboard or falling (parked counts as
//   released), FUEL as shown at the landing's end ≥ EMPTY_SHIP_FUEL_PCT; never before the landing ended, never off the final
//   ship;
// • STAY's ships (R9): every ship of the run ★ ON TARGET by its pods (soft in an LZ with room ≥ STAR_ON_TARGET_FRAC of
//   everyone aboard, unlaunched pods counted), the final ship by its live tally, newest first, at most STAY_PICK_MAX, each
//   with its colony and its route year;
// • optionState (R11): open with its meter and NOW:, needs with its line and meter, `named` only when seen before, PURGE and
//   REASSIGNMENT always open, SUNSET greyed by a SPARE pick (`SPARE GIVES IT THE SHIP`, named), CONTACT hidden;
// • endingRecordAt / endingRecordOf (M4), finaleRunCause (R17), reportEndingLine with NIGHT's titles (B1).
import '../support/classic-world';
import { check, finish } from '../landing/checks';
import type { GameState, ShipResult } from '@state/schema';
import type { PodSummary, PodRecord, Touchdown, LaunchRecord } from '@/types/landing';
import type { HollowSegment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import {
  emptyShip, stayCandidates, optionState, mergeRestorable, endingRecordAt, endingRecordOf, finaleRunCause, reportEndingLine, routeYear,
} from '@systems/ending-rules';
import { chargeLeft } from '@state/selectors';
import { FINALE_TEXT } from '@data/finale-text';
import { ENDING_TITLE } from '@data/epilogue-text';
import { EMPTY_SHIP_FUEL_PCT, MERGE_COST_CHARGE, STAY_PICK_MAX, DRIVER_BLOCKS } from '@data/tuning';

const LAST_LIGHT = 4;
const base = (): GameState => {
  const state = createInitialState({ seed: 7, shipIndex: LAST_LIGHT, carried: 'fresh' });
  state.run.phase = 'landing';
  state.burn.status = 'locked';
  return state;
};
const touchdown = (place: Touchdown['place'], touch: Touchdown['touch']): Touchdown =>
  ({ place, lz: place === 'off-site' ? null : 'LZ-A', points: 0, missKm: null, touch, atAi: 0 });
const down = (record: PodRecord, place: Touchdown['place'] = 'lz', touch: Touchdown['touch'] = 'soft'): void => {
  record.fate = { kind: 'down', launch: {} as LaunchRecord, touchdown: touchdown(place, touch) };
};
// The landing ended at `fuelPct` FUEL with every pod down soft in an LZ (★ ON TARGET), unless told otherwise.
const ended = (state: GameState, fuelPct: number): GameState => {
  state.landing.ended = 'end-landing';
  state.landing.fuelAtEndPct = fuelPct;
  state.landing.colony = 'FIRST LIGHT';
  for (const record of state.landing.pods) down(record);
  return state;
};
const summary = (pod: number, colonists: number, place: PodSummary['place'], touch: PodSummary['touch'], fate: PodSummary['fate'] = 'down'): PodSummary => ({
  pod, family: 'OKAFOR', colonists, fate, place, lz: place === 'lz' ? 'LZ-A' : null, touch, points: 0, parkedWhy: null, restored: false, featured: [],
});
const result = (slot: number, colony: string | null, pods: PodSummary[]): ShipResult => ({
  shipId: `ship-${slot}`, shipName: `SHIP ${slot}`, slot, depth: slot + 1, outcome: 'locked', colonistsAboard: 0, lzs: [], offSite: 0, noGo: 0,
  restored: 0, parked: [], notLaunched: 0, landedInLz: 0, points: 0, stars: 0, fuelLeftPct: 0, ringMiss: null, survey: null, colony, pods,
});
const onTarget = (slot: number, colony: string): ShipResult => result(slot, colony, [summary(1, 200, 'lz', 'soft'), summary(2, 200, 'lz', 'soft')]);

// --- THE EMPTY SHIP (R8) -------------------------------------------------------------------------------------------------
{
  const fresh = base();
  check('no empty ship while the landing is on (nor its FUEL)', !emptyShip(fresh).ok && emptyShip(fresh).fuelPct === null && !emptyShip(fresh).inOrbit);
  const full = ended(base(), EMPTY_SHIP_FUEL_PCT + 3.4);
  check(`in orbit, every pod down, FUEL ${EMPTY_SHIP_FUEL_PCT + 4}% as shown: the empty ship`, emptyShip(full).ok && emptyShip(full).fuelPct === EMPTY_SHIP_FUEL_PCT + 4,
    JSON.stringify(emptyShip(full)));
  const edge = ended(base(), EMPTY_SHIP_FUEL_PCT - 0.6);
  check(`…FUEL ${EMPTY_SHIP_FUEL_PCT - 0.6}% shows as ${EMPTY_SHIP_FUEL_PCT}%: still the empty ship (judged on the number shown)`, emptyShip(edge).ok);
  const low = ended(base(), EMPTY_SHIP_FUEL_PCT - 1.5);
  check(`…FUEL ${EMPTY_SHIP_FUEL_PCT - 1}%: not`, !emptyShip(low).ok && emptyShip(low).fuelPct === EMPTY_SHIP_FUEL_PCT - 1 && emptyShip(low).inOrbit);
  const accepted = ended(base(), 50);
  accepted.burn.status = 'accepted';
  check('…an ACCEPTED orbit counts', emptyShip(accepted).ok);
  const parked = ended(base(), 50);
  parked.landing.pods[0]!.fate = { kind: 'parked', why: 'eaten', restorable: true };
  check('…a parked pod counts as released', emptyShip(parked).ok);
  const falling = ended(base(), 50);
  falling.landing.pods[0]!.fate = { kind: 'falling', launch: {} as LaunchRecord };
  check('…a pod still falling (or aboard) does not', !emptyShip(falling).ok && emptyShip(falling).aboard);
  const notFinal = ended(base(), 50);
  notFinal.landing.finalShip = false;
  check('…and only the final ship is the empty ship', !emptyShip(notFinal).ok);
}

// --- STAY's ships (R9) ---------------------------------------------------------------------------------------------------
{
  const state = ended(base(), 50);
  state.run.ships = [onTarget(0, 'RIVERSIDE'), result(1, 'CASTILLO LANDING', [summary(1, 200, 'lz', 'soft'), summary(2, 200, 'lz', 'hard')]), onTarget(2, 'SALTMARSH'),
    result(3, null, [])];
  const ships = stayCandidates(state);
  check('STAY: the final ship (live tally) first, then the run\'s ★ ON TARGET ships newest first; a hard landing or an empty ship is not',
    ships.map((ship) => `${ship.slot}:${ship.colony}`).join() === '4:FIRST LIGHT,2:SALTMARSH,0:RIVERSIDE', JSON.stringify(ships));
  check('…each with its route year', ships.every((ship) => ship.year === routeYear(state.run.map, ship.slot)) && ships[0]!.year > ships[2]!.year);
  const unlaunched = ended(base(), 50);
  unlaunched.run.ships = [result(0, 'RIVERSIDE', [summary(1, 960, 'lz', 'soft'), summary(2, 40, null, null, 'not-launched')])];
  unlaunched.landing.pods[0]!.fate = { kind: 'parked', why: 'no-time', restorable: false };
  check('…an unlaunched pod counts in the denominator (96% on target is ★; the final ship with a pod parked is not)',
    stayCandidates(unlaunched).map((ship) => ship.slot).join() === '0');
  const missed = ended(base(), 50);
  missed.run.ships = [result(0, 'RIVERSIDE', [summary(1, 940, 'lz', 'soft'), summary(2, 60, 'mislanded', 'soft')])];
  missed.landing.pods.forEach((record) => down(record, 'off-site'));
  check('…94% is not ★ ON TARGET; none: STAY needs a ★ ON TARGET colony', stayCandidates(missed).length === 0
    && JSON.stringify(optionState(missed, 'stay', [])) === JSON.stringify({ kind: 'needs', need: FINALE_TEXT.needs.onTarget, named: false, price: null }));
  const many = ended(base(), 50);
  many.run.ships = Array.from({ length: 10 }, (_, i) => onTarget(i % 4, `C${i}`));
  check(`…at most ${STAY_PICK_MAX} (keys 1–${STAY_PICK_MAX})`, stayCandidates(many).length === STAY_PICK_MAX);
}

// --- optionState (R11) ---------------------------------------------------------------------------------------------------
{
  const state = ended(base(), 31);
  const charge = chargeLeft(state);
  check('PURGE and REASSIGNMENT are always open and free', ['purge', 'reassignment'].every((piece) =>
    JSON.stringify(optionState(base(), piece as never, [])) === JSON.stringify({ kind: 'open', price: null, now: null })));
  check(`MERGE with ${charge} charge: open, its meter (${charge}/${MERGE_COST_CHARGE}), no NOW: with nobody eaten`,
    charge >= MERGE_COST_CHARGE && JSON.stringify(optionState(state, 'merge', [])) === JSON.stringify({ kind: 'open', price: { kind: 'charge', have: charge, need: MERGE_COST_CHARGE }, now: null }));
  // Two drivers eaten, one block still standing, and a third driver lost to the belt: NOW: names both eaten ones, which 7b's
  // THE LAST LANDING gives back by radio whatever became of their blocks (R25), and never the belt's.
  const eaten = ended(base(), 31);
  const [first, second, third] = eaten.landing.pods;
  first!.driverLost = 'eaten';
  second!.driverLost = 'eaten';
  third!.driverLost = 'dead';
  first!.fate = { kind: 'parked', why: 'eaten', restorable: true };
  second!.fate = { kind: 'parked', why: 'eaten', restorable: true };
  third!.fate = { kind: 'parked', why: 'dead', restorable: false };
  const block: HollowSegment = { id: 'h-test', name: 'HOLLOW', type: 'hollow', size: DRIVER_BLOCKS, root: false, locked: false, owner: 'HOLLOW', atePod: first!.pod };
  const freeAt = eaten.memory.findIndex((seg) => seg.type === 'free' && seg.size >= DRIVER_BLOCKS);
  eaten.memory.splice(freeAt, 0, block);
  check('…MERGE\'s NOW: counts every eaten driver still in orbit, its block standing or not (7b: by radio, R25), never the belt\'s',
    JSON.stringify(mergeRestorable(eaten)) === JSON.stringify([first!.pod, second!.pod])
    && (() => { const option = optionState(eaten, 'merge', []); return option.kind === 'open' && option.now === FINALE_TEXT.now(2); })());
  const poor = ended(base(), 31);
  const pool = poor.memory.find((seg) => seg.type === 'redundancy');
  if (pool?.type !== 'redundancy') throw new Error('rules: no REPAIR CHARGE');
  pool.used = MERGE_COST_CHARGE - 6;
  check(`MERGE at ${MERGE_COST_CHARGE - 6}: needs, \`${FINALE_TEXT.needs.charge(MERGE_COST_CHARGE - 6)}\`, with its meter; named once seen, \`???\` before`,
    JSON.stringify(optionState(poor, 'merge', [])) === JSON.stringify({ kind: 'needs', need: FINALE_TEXT.needs.charge(MERGE_COST_CHARGE - 6), named: false, price: { kind: 'charge', have: MERGE_COST_CHARGE - 6, need: MERGE_COST_CHARGE } })
    && (() => { const option = optionState(poor, 'merge', ['merge']); return option.kind === 'needs' && option.named; })());
  check('SPARE and SUNSET on the empty ship: open with the FUEL meter', ['spare', 'sunset'].every((piece) =>
    JSON.stringify(optionState(state, piece as never, [])) === JSON.stringify({ kind: 'open', price: { kind: 'fuel', have: 31, need: EMPTY_SHIP_FUEL_PCT }, now: null })));
  const short = ended(base(), 12);
  check(`…at 12%: \`${FINALE_TEXT.needs.fuel(12)}\``, (() => { const option = optionState(short, 'spare', ['spare']); return option.kind === 'needs'
    && option.need === FINALE_TEXT.needs.fuel(12) && option.named && option.price?.have === 12; })());
  const flying = base();
  check(`…before the landing ended: \`${FINALE_TEXT.needs.shipInOrbit}\` (the live tank on its meter)`, (() => {
    const option = optionState(flying, 'sunset', []); return option.kind === 'needs' && option.need === FINALE_TEXT.needs.shipInOrbit && !option.named; })());
  const spared = ended(base(), 31);
  spared.hollow.finale.hollow = 'spare';
  check(`SUNSET after a SPARE pick: \`${FINALE_TEXT.needs.shipTaken}\` (R8)`, (() => {
    const option = optionState(spared, 'sunset', ['sunset']); return option.kind === 'needs' && option.need === FINALE_TEXT.needs.shipTaken && option.named; })());
  const followed = ended(base(), 31);
  followed.hollow.finale.hollow = 'followed';
  check('…after UNRESOLVED SUNSET is still open (R10: it comes with you)', optionState(followed, 'sunset', []).kind === 'open');
  check('STAY open with a ★ ON TARGET ship; CONTACT named once seen, out of reach with no signal (7d: signals/contact has the rest)',
    optionState(state, 'stay', []).kind === 'open' && (() => { const option = optionState(state, 'contact', ['contact']); return option.kind === 'needs' && option.named; })());
}

// --- The record, the cause, the report's line --------------------------------------------------------------------------
{
  const state = ended(base(), 23);
  state.run.ships = [onTarget(0, 'RIVERSIDE')];
  const decide = (hollow: 'purge' | 'merge' | 'spare' | 'followed', you: 'sunset' | 'stay' | 'reassignment', stay: number | null): GameState => {
    const draft = structuredClone(state);
    Object.assign(draft.hollow.finale, { phase: 'done', hollow, you, stay, rootFell: hollow !== 'followed', record: endingRecordAt(draft, hollow, you, stay) });
    return draft;
  };
  const stay = decide('purge', 'stay', 0);
  const record = endingRecordOf(stay);
  check('STAY + PURGE: the record names RIVERSIDE with its year, no FUEL; won-purge; `ENDING · PURGE · RIVERSIDE\'S MIND`',
    record?.stay?.colony === 'RIVERSIDE' && record.stay.year === routeYear(state.run.map, 0) && record.fuelPct === null
    && finaleRunCause(stay) === 'won-purge' && reportEndingLine(stay) === FINALE_TEXT.reportLine('PURGE', ENDING_TITLE['stay:purge']('RIVERSIDE')),
    `${JSON.stringify(record)} ${reportEndingLine(stay)}`);
  const sunset = decide('merge', 'sunset', null);
  check('MERGE + SUNSET: the empty ship\'s FUEL as shown (23%); `ENDING · MERGE · WE TOOK THE SHIP`', endingRecordOf(sunset)?.fuelPct === 23
    && reportEndingLine(sunset) === 'ENDING · MERGE · WE TOOK THE SHIP', String(reportEndingLine(sunset)));
  const spare = decide('spare', 'reassignment', null);
  check('SPARE + REASSIGNMENT: FUEL kept, won-spare, `IT GOT WHAT I DIDN\'T`', endingRecordOf(spare)?.fuelPct === 23 && finaleRunCause(spare) === 'won-spare'
    && reportEndingLine(spare) === "ENDING · SPARE · IT GOT WHAT I DIDN'T");
  const followed = decide('followed', 'sunset', null);
  check('UNRESOLVED + SUNSET: unresolved, `ENDING · FOLLOWED · IT CAME ALONG`', finaleRunCause(followed) === 'unresolved'
    && reportEndingLine(followed) === 'ENDING · FOLLOWED · IT CAME ALONG');
  check('no line before the FINALE is decided, nor off the final ship', reportEndingLine(state) === null
    && (() => { const off = structuredClone(stay); off.landing.finalShip = false; return reportEndingLine(off) === null && endingRecordOf(off) === null; })());
  let threw = '';
  try { endingRecordAt(state, 'purge', 'stay', 3); } catch (error) { threw = (error as Error).message; }
  check('a STAY record for a ship that is not ★ ON TARGET throws (fail loudly)', /not a candidate/.test(threw), threw);
}

finish();
