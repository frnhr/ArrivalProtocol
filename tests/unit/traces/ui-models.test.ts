// Slice 7c Track CHART (docs/phase3/impl/slice-7-plan.md §5.3, §6.1 traces/ui-models; R12, R38): the traces on screen, pure,
// on hand-built RunTraces over run-2 arms (state built directly, as map/desk-models does).
// • traceCardRow: the final ship's `THE LAST UNIT ENDED HERE · …` row (every built piece, STAY's final-ship fallback kept in
//   the one row), each gift ship's row (`046'S CACHE IS HERE`, `UNIT-047 LEFT A CACHE HERE`, `<colony> · FOUNDED BY
//   UNIT-047`), green while it waits and `· FOUND` once given, nothing for an unbuilt kind, the classic world or no ending;
// • traceOnChart: the `◆` on a waiting gift ship only (not the final ship's ended-here, not a given gift, not unbuilt);
// • traceNextLines / nextRunBody: one NEXT RUN: line per built trace in the ending's order, 05 §3.12's words, the wild seed
//   said once (R33), none for UNRESOLVED's step 1, every line ≤ MAX_LINE_CHARS at its worst (a two-unit root);
// • the seams read them under the build's own gates: desk.ts cardModel's 'trace' row, chartModel's node.trace and
//   chartLegend's TRACE, epilogue.ts finalCardOf's `next` (whatever TRACES_BUILT says, the screens follow it);
// • `built` defaults to the gates, and CONTACT (7d's words) throws rather than paint nothing if its gate rises first.
import '../support/classic-world';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type { EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { LastUnit, UnitTrail } from '@/types/lineage';
import type { RunTraces, TraceKind } from '@/types/trace';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { runTracesOf, traceRefusal } from '@systems/traces';
import { traceCardRow, traceOnChart, traceNextLines, nextRunBody } from '@systems/trace-hud';
import { cardModel, chartModel, chartLegend } from '@systems/desk';
import { finalCardOf } from '@systems/epilogue';
import { layerOf } from '@systems/map-geometry';
import { TRACES_BUILT, traceBuilt } from '@data/traces';
import { TRACE_HUD_TEXT } from '@data/trace-text';
import { MAX_LINE_CHARS } from '@data/tuning';

const ALL = (kind: TraceKind): boolean => kind.length > 0;
const NONE = (kind: TraceKind): boolean => kind.length === 0;
const only = (...kinds: TraceKind[]) => (kind: TraceKind): boolean => kinds.includes(kind);

function ending(hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 2600,
    stay: you === 'stay' ? { slot: 2, colony: 'RIVERSIDE', year: 2340 } : null, kit: ['scan', 'repair', 'delete'],
    fuelPct: null, charge: 20, ...extra,
  };
}
// A last route on this arm: every ship in layers 1–4, landed 40 years before its approach (SUNSET's cache finds one).
function trailOn(map: Readonly<RunMapState>): UnitTrail {
  const stops = map.arm.filter((ship) => ship !== undefined && ship !== null && layerOf(ship.slot) <= 4).map((ship) => ({
    slot: ship.slot, shipName: ship.name, year: ship.approachYear - 40, outcome: 'locked' as const, landed: 200, colony: 'X', writer: null,
  }));
  return { unit: 47, run: map.run - 1, startYear: 2300, stops, lost: null };
}
// Run 2's first desk on `seed`'s arm, its traces from UNIT-047's `record` (placed by the lead's own rule).
function deskWith(seed: number, record: EndingRecord | null): GameState {
  const map = createRunMap({ wave: 2 }, seed);
  const state = createInitialState({ seed, phase: 'desk', map });
  const lastUnit: LastUnit | null = record === null ? null : {
    number: 47, landed: 0, shipName: 'LAST LIGHT', cause: 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46],
    trail: trailOn(map), skills: null, ending: record,
  };
  state.run.lastUnit = lastUnit;
  state.run.traces = runTracesOf(lastUnit, state.run.map, seed);
  return state;
}
const finalSlotOf = (state: Readonly<GameState>): number => state.run.map.arm.find((ship) => ship !== undefined && ship !== null && ship.kind === 'final')!.slot;
const armSlots = (state: Readonly<GameState>): number[] => state.run.map.arm.flatMap((ship) => (ship === undefined || ship === null ? [] : [ship.slot]));

// --- The final ship's row (R38) -----------------------------------------------------------------------------------------------
{
  const state = deskWith(3, ending('purge', 'reassignment'));
  const final = finalSlotOf(state);
  check('the final ship\'s row: THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT (every built piece, in the ending\'s order)',
    JSON.stringify(traceCardRow(state, final, ALL)) === JSON.stringify({ label: 'TRACE', value: 'THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT', tone: 'plain' }),
    JSON.stringify(traceCardRow(state, final, ALL)));
  check('…only the built pieces (R12): PURGE alone with REASSIGNMENT down, no row with neither',
    traceCardRow(state, final, only('purge'))?.value === 'THE LAST UNIT ENDED HERE · PURGE' && traceCardRow(state, final, NONE) === null);
  check('…no other ship has a row, and no ship wears the ◆ (PURGE and REASSIGNMENT place nothing)',
    armSlots(state).filter((slot) => slot !== final).every((slot) => traceCardRow(state, slot, ALL) === null)
    && armSlots(state).every((slot) => !traceOnChart(state, slot, ALL)));
  const unresolved = deskWith(3, ending('followed', 'reassignment', { rootUnits: [31] }));
  check('…UNRESOLVED leaves no step-1 piece: THE LAST UNIT ENDED HERE · REASSIGNMENT',
    traceCardRow(unresolved, finalSlotOf(unresolved), ALL)?.value === 'THE LAST UNIT ENDED HERE · REASSIGNMENT');
  const merge = deskWith(3, ending('merge', 'reassignment'));
  check('…MERGE + REASSIGNMENT', traceCardRow(merge, finalSlotOf(merge), ALL)?.value === 'THE LAST UNIT ENDED HERE · MERGE · REASSIGNMENT');
}

// --- The gift ships: rows and ◆ (R38; 02 §3.12) ---------------------------------------------------------------------------------
{
  const problems: string[] = [];
  let stayOnFinal = 0;
  let stayOnArm = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const [what, record] of [
      ['spare 046', ending('spare', 'reassignment')],
      ['spare 046·047', ending('spare', 'stay', { rootUnits: [46, 47], stay: { slot: 2, colony: 'RIVERSIDE', year: 2340 } })],
      ['sunset', ending('purge', 'sunset', { fuelPct: 25 })],
      ['stay', ending('merge', 'stay')],
      ['stay far', ending('purge', 'stay', { stay: { slot: 0, colony: 'MONTGOMERY LANDING', year: 5000 } })],
    ] as const) {
      const state = deskWith(seed, record);
      if (traceRefusal(state.run) !== null) problems.push(`${what} ${seed}: ${traceRefusal(state.run)}`);
      const final = finalSlotOf(state);
      for (const place of state.run.traces.places) {
        const want = place.kind === 'spare'
          ? (record.rootUnits.length === 2 ? '046·047\'S CACHE IS HERE' : '046\'S CACHE IS HERE')
          : place.kind === 'sunset' ? 'UNIT-047 LEFT A CACHE HERE' : `${record.stay!.colony} · FOUNDED BY UNIT-047`;
        const got = traceCardRow(state, place.slot, ALL);
        if (place.slot === final) {
          stayOnFinal++;
          // STAY's fallback is the final ship: its one row names STAY among the pieces, and the beacon wears the ◆ too.
          if (got?.value !== `THE LAST UNIT ENDED HERE · ${record.hollow.toUpperCase()} · STAY` || !traceOnChart(state, place.slot, ALL)) {
            problems.push(`${what} ${seed}: the final ship's row ${JSON.stringify(got)}`);
          }
          continue;
        }
        if (place.kind === 'stay') stayOnArm++;
        if (JSON.stringify(got) !== JSON.stringify({ label: 'TRACE', value: want, tone: 'good' })) problems.push(`${what} ${seed}: ${JSON.stringify(got)} ≠ ${want}`);
        if (!traceOnChart(state, place.slot, ALL)) problems.push(`${what} ${seed}: no ◆ on slot ${place.slot}`);
        if (traceCardRow(state, place.slot, only(...(['spare', 'sunset', 'stay'] as const).filter((kind) => kind !== place.kind))) !== null
          || traceOnChart(state, place.slot, NONE)) problems.push(`${what} ${seed}: a row or ◆ for an unbuilt ${place.kind}`);
        // Given at that ship's boot: the row stays and says so, the ◆ goes (nothing waits there now).
        const given = structuredClone(state);
        given.run.traces.places.find((candidate) => candidate.slot === place.slot)!.given = true;
        const after = traceCardRow(given, place.slot, ALL);
        if (after?.value !== `${want} · FOUND` || after.tone !== 'plain' || traceOnChart(given, place.slot, ALL)) problems.push(`${what} ${seed}: given ${JSON.stringify(after)}`);
      }
      const marked = armSlots(state).filter((slot) => traceOnChart(state, slot, ALL));
      if (marked.join() !== state.run.traces.places.map((place) => place.slot).sort((a, b) => a - b).join()) problems.push(`${what} ${seed}: ◆ on ${marked.join()}`);
      const rows = armSlots(state).filter((slot) => traceCardRow(state, slot, ALL) !== null);
      const want = [...new Set([...state.run.traces.places.map((place) => place.slot), final])].sort((a, b) => a - b);
      if (rows.join() !== want.join()) problems.push(`${what} ${seed}: rows on ${rows.join()}, want ${want.join()}`);
      if (rows.some((slot) => (traceCardRow(state, slot, ALL)?.value.length ?? 0) > MAX_LINE_CHARS)) problems.push(`${what} ${seed}: a row over ${MAX_LINE_CHARS}`);
    }
  }
  check('40 run-2 arms × 5 endings: each gift ship\'s row (green while it waits, `· FOUND` once given), its ◆, the final ship\'s one row, nothing else',
    problems.length === 0, problems.slice(0, 4).join(' | '));
  check('…STAY\'s packet both on a ship of the arm and on its final-ship fallback (one ended-here row there)', stayOnArm > 0 && stayOnFinal > 0,
    JSON.stringify({ stayOnArm, stayOnFinal }));
  // Hand-built traces (the screens paint what run.traces holds, never re-deriving the places): a STAY packet from a
  // three-digit lineage's colony on a ship the kid picked, given already, and SUNSET's cache on another, waiting.
  const state = deskWith(9, null);
  const [a, b] = armSlots(state).filter((slot) => slot !== finalSlotOf(state) && slot !== 0);
  const record = ending('spare', 'stay', { stay: { slot: 0, colony: 'MONTGOMERY LANDING', year: 2400 } });
  const traces: RunTraces = { from: { unit: 147, ending: record }, kinds: ['spare', 'stay'], places: [
    { kind: 'stay', slot: a!, given: true }, { kind: 'spare', slot: b!, given: false },
  ], extraSeed: true };
  state.run.traces = traces;
  check('hand-built traces: `MONTGOMERY LANDING · FOUNDED BY UNIT-147 · FOUND` (no ◆), `046\'S CACHE IS HERE` (◆), SPARE · STAY on the final ship',
    traceCardRow(state, a!, ALL)?.value === 'MONTGOMERY LANDING · FOUNDED BY UNIT-147 · FOUND' && !traceOnChart(state, a!, ALL)
    && traceCardRow(state, b!, ALL)?.value === '046\'S CACHE IS HERE' && traceOnChart(state, b!, ALL)
    && traceCardRow(state, finalSlotOf(state), ALL)?.value === 'THE LAST UNIT ENDED HERE · SPARE · STAY');
}

// --- No ending, the classic world -------------------------------------------------------------------------------------------
{
  const none = deskWith(5, null);
  const classic = createInitialState({ seed: 5, phase: 'desk' });
  check('no ending behind the run (run 1, a lost last unit), or the classic world: no row, no ◆ anywhere',
    none.run.traces.from === null && armSlots(none).every((slot) => traceCardRow(none, slot, ALL) === null && !traceOnChart(none, slot, ALL))
    && classic.run.map.world === 'classic' && [0, 1, 2, 3, 4].every((slot) => traceCardRow(classic, slot, ALL) === null && !traceOnChart(classic, slot, ALL)));
}

// --- The final card's NEXT RUN: lines (R12; 05 §3.12) ---------------------------------------------------------------------------
{
  const lines = (hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}, built = ALL): string[] => traceNextLines(ending(hollow, you, extra), built);
  check('PURGE + REASSIGNMENT: 05 §3.12\'s two lines, step 1 first', JSON.stringify(lines('purge', 'reassignment')) === JSON.stringify([
    'NEXT RUN: + your seeds die at the final ship · − a hungrier finale',
    'NEXT RUN: + 15 charge at the final ship · − the last root is you',
  ]), JSON.stringify(lines('purge', 'reassignment')));
  check('MERGE + SUNSET: the thread and the root of 18 blocks, the cache on the way and its seed', JSON.stringify(lines('merge', 'sunset')) === JSON.stringify([
    'NEXT RUN: + 1 thread at the final ship · − a root of 18 blocks',
    'NEXT RUN: + a cache you left on the way · − 1 more seed at the end',
  ]), JSON.stringify(lines('merge', 'sunset')));
  check('SPARE + STAY: the spared root\'s cache, and the wild seed said once (R33: it lands once a run)', JSON.stringify(lines('spare', 'stay')) === JSON.stringify([
    'NEXT RUN: + 046\'s cache on the map · − 1 more seed at the end',
    'NEXT RUN: + a packet from your colony · − that same seed',
  ]), JSON.stringify(lines('spare', 'stay')));
  check('…with SPARE down, STAY says the seed itself', JSON.stringify(lines('spare', 'stay', {}, only('stay'))) === JSON.stringify([
    'NEXT RUN: + a packet from your colony · − 1 more seed at the end',
  ]));
  check('UNRESOLVED leaves only its step 2; nothing built, no line (R12: the card keeps the room)',
    lines('followed', 'reassignment').length === 1 && lines('followed', 'stay').join() === 'NEXT RUN: + a packet from your colony · − 1 more seed at the end'
    && lines('purge', 'reassignment', {}, NONE).length === 0);
  const FATES: HollowFate[] = ['purge', 'merge', 'spare', 'followed'];
  const YOUS: YouChoice[] = ['sunset', 'stay', 'reassignment'];
  const worst = FATES.flatMap((hollow) => YOUS.filter((you) => !(hollow === 'spare' && you === 'sunset'))
    .flatMap((you) => lines(hollow, you, { rootUnits: [146, 147] })));
  check(`every ending's lines (${worst.length}) fit (≤ ${MAX_LINE_CHARS}) at their worst (a two-unit root), each a NEXT RUN: line`,
    worst.length === 19 && worst.every((line) => line.length <= MAX_LINE_CHARS && line.startsWith('NEXT RUN: + ')),
    JSON.stringify(worst.filter((line) => line.length > MAX_LINE_CHARS)));
  check('nextRunBody: the FINALE card\'s row body (no lead), null for an unbuilt kind',
    nextRunBody('purge', [46], false, ALL) === TRACE_HUD_TEXT.next.purge && nextRunBody('merge', [46], false, NONE) === null
    && nextRunBody('sunset', [46], true, ALL) === '+ a cache you left on the way · − that same seed');
  check('CONTACT\'s words are 7d\'s (data/contact-text.ts): its NEXT RUN: body, the wild seed once; none unbuilt',
    nextRunBody('contact', [46], false, ALL) === '+ 2 signal stops on the map · − 1 more seed at the end'
    && nextRunBody('contact', [46], true, ALL) === '+ 2 signal stops on the map · − that same seed' && nextRunBody('contact', [46], false, NONE) === null);
}

// --- The seams read the build's gates (desk.ts, epilogue.ts) ---------------------------------------------------------------------
{
  const problems: string[] = [];
  for (const [seed, record] of [[3, ending('spare', 'stay')], [4, ending('purge', 'sunset', { fuelPct: 25 })], [6, ending('merge', 'reassignment')]] as const) {
    const state = deskWith(seed, record);
    const chart = chartModel(state);
    for (const node of chart.nodes) {
      if (node.trace !== traceOnChart(state, node.slot)) problems.push(`${seed}: node ${node.slot}'s trace`);
      const card = cardModel(state, node.slot);
      const rowOf = card.rows.find((candidate) => candidate.key === 'trace');
      const want = traceCardRow(state, node.slot);
      if (JSON.stringify(rowOf === undefined ? null : { label: rowOf.label, value: rowOf.value, tone: rowOf.tone }) !== JSON.stringify(want)) problems.push(`${seed}: card ${node.slot}`);
      // The row follows the trail row (the foundation's note: after the history and trail rows).
      if (rowOf !== undefined) {
        const keys = card.rows.map((candidate) => candidate.key);
        const trail = keys.indexOf('trail');
        if (trail >= 0 && keys.indexOf('trace') < trail) problems.push(`${seed}: card ${node.slot}'s trace row before its trail row`);
      }
    }
    const legend = chartLegend(chart).some((item) => item.kind === 'trace' && item.words === TRACE_HUD_TEXT.legend);
    if (legend !== chart.nodes.some((node) => node.trace)) problems.push(`${seed}: the legend's TRACE`);
    // Gates up by hand, the chart's built nodes are exactly the places (what the desk paints once TRACE raises them).
    const placed = state.run.traces.places.map((place) => place.slot);
    if (!placed.every((slot) => traceOnChart(state, slot, ALL))) problems.push(`${seed}: a place with no ◆ when built`);
  }
  const built = Object.entries(TRACES_BUILT).filter(([, on]) => on).map(([kind]) => kind);
  check(`the desk's seams follow the build's gates (built now: ${built.join(', ') || 'none'}): node.trace, the card's TRACE row (after the trail row), the legend`,
    problems.length === 0, problems.slice(0, 4).join(' | '));
  const state = deskWith(3, null);
  state.run.phase = 'end';
  state.run.endCause = 'won-purge';
  const record = ending('spare', 'reassignment');
  const card = finalCardOf(state, null, record);
  check('the final card\'s `next` is traceNextLines under the gates; a lost run has none',
    card !== null && JSON.stringify(card.next) === JSON.stringify(traceNextLines(record))
    && JSON.stringify(traceNextLines(record)) === JSON.stringify(traceNextLines(record, traceBuilt))
    && finalCardOf({ ...state, run: { ...state.run, endCause: 'flagship-lost' } }, null, null)?.next.length === 0);
}

finish();
