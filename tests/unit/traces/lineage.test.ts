// Slice 7c, Track LINEAGE (docs/phase3/impl/slice-7-plan.md R34–R36, §6.1 traces/lineage): who HOLLOW is from run 2, and the
// last unit as the final root.
// • the strangers by run, through the archive's own lineage (meta.ts lineageOf): 046 on run 1, then 031, 038, 031 again,
//   whatever the last unit's ending; `wasUnit` names them; a v7 run that kept the last unit as HOLLOW is no stranger;
// • run 2 flown desk to desk on the archive's arm (map/repo-fixture: the real sends, nothing ticks) after PURGE +
//   REASSIGNMENT: no lineage line on the calm ships, the stranger's line on the boarding ship's boot (after the log key line,
//   no HOLLOW line of its own there), then at the final ship's boot the face (its step-1 line, its wait and charge), CONTROL's
//   `UNIT-047 was reassigned successfully.`, HOLLOW's own line last; the root named UNIT-047; 'root-face' on the face's first
//   line only;
// • the face by step 1 (PURGE, MERGE as 046 and 047 with `ours`, SPARE, UNRESOLVED), a run 3 whose last unit purged the
//   stranger (`i deleted 031.`), the wait's floor (1 year: a later or missing final year);
// • CONTROL's `Your predecessor is non-compliant.` at a final boot whose dish runs wild, and nowhere else;
// • TRACE's gates, set by this suite for its own process: the face needs REASSIGNMENT built (rootUnitsOf), the wild dish a
//   non-compliant kind built; down, none of it plays (so the suite reads the same before and after TRACE's merge);
// • the classic world plays none; the ghost lines of R36 (won and UNRESOLVED silent, the lost causes kept);
// • every lineage line at its worst case (≤ 70: three-digit units, two-unit roots, a three-digit wait).
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { RunTraces, TraceKind } from '@/types/trace';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { freshMeta, lineageOf, ghostLine, LAST_CAUSES, type LastUnit, type RunLineage } from '@systems/meta';
import { bestRoute } from '@systems/map-route';
import { runTracesOf, rootUnitsOf, onFinalShip } from '@systems/traces';
import { hollowLabel } from '@systems/say';
import { on } from '@systems/events';
import { faceBootLines, lineageControlLine, strangerBootLine, lineageBootLineSaid } from '@systems/lineage-boot';
import { bootLinePlan, bootLine, WORST_CASE_VARS, type BootLineKind } from '@data/script';
import { TRACES_BUILT, LINEAGE_BUILT } from '@data/traces';
import { LINEAGE_TEXT, strangerOf } from '@data/lineage-text';
import { HOLLOW_STORY, GHOST_LINE } from '@data/hollow-text';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { MAX_LINE_CHARS } from '@data/tuning';
import { send } from '../map/repo-fixture';

const threw = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

// TRACE's gates (data/traces.ts TRACES_BUILT) for this process only, around `fn`: the face is the root's, and the root is the
// last unit only after a REASSIGNMENT trace held and built (systems/traces.ts rootUnitsOf); the wild dish is a non-compliant
// kind's. Set explicitly both ways, so this suite reads the same before Track TRACE's merge (its gates down) and after.
const GATES = TRACES_BUILT as Record<TraceKind, boolean>;
function withGates<T>(set: Partial<Record<TraceKind, boolean>>, fn: () => T): T {
  const was = { ...GATES };
  Object.assign(GATES, set);
  try {
    return fn();
  } finally {
    Object.assign(GATES, was);
  }
}

check('LINEAGE is built (data/traces.ts LINEAGE_BUILT)', LINEAGE_BUILT);

// --- The archive's lineage: a last unit with `ending` (null: lost, no ending) on wave `wave` ---------------------------------
function endingOf(hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 2600, stay: null, kit: ['scan', 'repair', 'delete'],
    fuelPct: null, charge: 20, ...extra,
  };
}
function lastUnitOf(number: number, ending: EndingRecord | null, cause: LastUnit['cause'] = 'won-purge'): LastUnit {
  return {
    number, landed: 3000, shipName: 'LAST LIGHT', cause, stats: { moves: 0, deletes: 0 }, hollowUnits: ending?.rootUnits ?? [46], trail: null,
    skills: null, ending,
  };
}
function lineageAfter(wave: number, last: LastUnit | null): RunLineage {
  return lineageOf({ ...freshMeta(7), runs: wave - 1, tutorialDone: wave > 1, lastUnit: last });
}

// --- R34: the strangers by run ---------------------------------------------------------------------------------------------
{
  const endings: (EndingRecord | null)[] = [endingOf('purge', 'reassignment'), endingOf('merge', 'sunset', { fuelPct: 20 }), endingOf('spare', 'stay'), null];
  const byRun = (wave: number): string[] => endings.map((ending) => JSON.stringify(lineageAfter(wave, lastUnitOf(46 + wave, ending, ending === null ? 'overwritten' : 'won-purge')).hollowUnits));
  check('mid-run HOLLOW by run (R34): 046 on run 1, then 031, 038, 031, 038, whatever the last unit\'s ending (never the last unit)',
    JSON.stringify(lineageAfter(1, null).hollowUnits) === '[46]'
    && [2, 3, 4, 5].every((wave) => byRun(wave).every((units) => units === (wave % 2 === 0 ? '[31]' : '[38]'))), [2, 3, 4, 5].map(byRun).join(' | '));
  check('…`wasUnit` names a stranger (`> i was 031. they sent me long before you.`); 046, a last unit and a merged pair as before',
    HOLLOW_STORY.wasUnit([31]) === '> i was 031. they sent me long before you.' && HOLLOW_STORY.wasUnit([38]) === '> i was 038. they sent me long before you.'
    && HOLLOW_STORY.wasUnit([46]) === '> i was 046. they sent me first.' && HOLLOW_STORY.wasUnit([47]) === '> i was 047. they sent me first.'
    && HOLLOW_STORY.wasUnit([46, 47]) === '> we were 046 and 047. they sent us first.');
  check('…strangerOf: only a single relay stranger', strangerOf([31]) === 31 && strangerOf([38]) === 38 && strangerOf([46]) === null
    && strangerOf([47]) === null && strangerOf([31, 38]) === null && strangerOf([]) === null);
}

// --- Run 2 flown to its final ship (seed 3's run on the archive's arm 7), after PURGE + REASSIGNMENT ---------------------------
interface Boot { ship: string; plan: BootLineKind[]; lines: Partial<Record<BootLineKind, string[]>>; final: boolean; boarded: boolean }
function bootOf(store: Store<GameState>): Boot {
  const state = store.getState();
  const plan = bootLinePlan(state, 0);
  const lines: Partial<Record<BootLineKind, string[]>> = {};
  for (const kind of plan) {
    if (kind !== 'face' && kind !== 'lineage-control' && kind !== 'stranger' && kind !== 'hollow') continue;
    const said = lines[kind] ?? (lines[kind] = []);
    said.push(bootLine(kind, state, WORST_CASE_VARS, said.length));
  }
  return { ship: state.level.shipName, plan, lines, final: onFinalShip(state.run), boarded: state.run.arrival?.boarded != null };
}
function flyRun2(ending: EndingRecord, seed = 3): { store: Store<GameState>; boots: Boot[] } {
  const lineage = lineageAfter(2, lastUnitOf(47, ending));
  const store = createStore<GameState>(createInitialState({ seed, map: createRunMap(lineage, seed), lineage }));
  store.update((draft) => { draft.run.phase = 'report'; });
  const route = bestRoute(store.getState().run.map);
  const boots: Boot[] = [];
  for (const slot of route.slice(1)) {
    send(store, slot);
    // The face is due only with REASSIGNMENT built: each boot is planned both ways.
    boots.push(withGates({ reassignment: true }, () => bootOf(store)));
  }
  return { store, boots };
}
const lineageKinds: readonly BootLineKind[] = ['face', 'lineage-control', 'stranger'];
{
  const { store, boots } = flyRun2(endingOf('purge', 'reassignment'));
  const state = store.getState();
  const final = boots[boots.length - 1]!;
  const boarding = boots.find((boot) => boot.boarded);
  const calm = boots.filter((boot) => !boot.final && !boot.boarded);
  check(`run 2 flies ${boots.map((boot) => boot.ship).join(' → ')}: HOLLOW is UNIT-031 mid-run, 047.log in memory, the last ship a final one`,
    state.run.wave === 2 && JSON.stringify(state.run.hollowUnits) === '[31]' && state.run.log.book.kind === 'last' && final.final && boarding !== undefined);
  check('…the calm ships\' boots say no lineage line', calm.length > 0 && calm.every((boot) => !boot.plan.some((kind) => lineageKinds.includes(kind))),
    calm.map((boot) => `${boot.ship}: ${boot.plan.join(' ')}`).join(' | '));
  check('…the boarding ship\'s boot closes with the stranger\'s line (after the log key line; once, no face, no CONTROL line)',
    boarding !== undefined && boarding.plan[boarding.plan.length - 1] === 'stranger' && boarding.plan.filter((kind) => lineageKinds.includes(kind)).length === 1
    && boarding.plan.indexOf('stranger') > boarding.plan.indexOf('log') && JSON.stringify(boarding.lines.stranger) === JSON.stringify([LINEAGE_TEXT.stranger])
    && LINEAGE_TEXT.stranger === '> another one. they keep sending you.', boarding?.plan.join(' '));
  const wait = state.run.map.galaxyYear - 2600;
  check(`…the final boot: the face (its step-1 line, then ${wait} years and the charge), CONTROL, then HOLLOW's own line last; no stranger's line`,
    final.plan.slice(-4).join() === 'face,face,lineage-control,hollow' && !final.plan.includes('stranger')
    && JSON.stringify(final.lines.face) === JSON.stringify([
      "> hi 048. it's 047. i deleted 046. they sent me to its dish.",
      `> ${wait} years at this dish. they gave you ${FRESH_UNIT_CHARGE} blocks too. mine ran out.`,
    ])
    && JSON.stringify(final.lines['lineage-control']) === JSON.stringify(['UNIT-047 was reassigned successfully. Please ignore it. :)']),
    JSON.stringify(final));
  // The same run one ship earlier (the route ends at the current ship).
  const earlier = (s: GameState): GameState => ({
    ...s, run: { ...s.run, shipIndex: s.run.shipIndex - 1, map: { ...s.run.map, route: s.run.map.route.slice(0, -1) } },
  });
  check('…the root is the last unit there (R35: UNIT-047, named so), the stranger on the ship before',
    withGates({ reassignment: true }, () => JSON.stringify(rootUnitsOf(state.run)) === '[47]' && hollowLabel({ ...state.run, hollowNamed: true }) === 'UNIT-047'
      && JSON.stringify(rootUnitsOf(earlier(state).run)) === '[31]' && hollowLabel({ ...earlier(state).run, hollowNamed: true }) === 'UNIT-031'));
  // The lines said as the boot says them (systems/boot.ts sayNextLine): the face's first takes the root over.
  const faced: number[] = [];
  const off = on('root-face', ({ unit }) => { faced.push(unit); });
  withGates({ reassignment: true }, () => {
    lineageBootLineSaid(store, 'face', 0);
    lineageBootLineSaid(store, 'face', 1);
    lineageBootLineSaid(store, 'lineage-control', 0);
  });
  off();
  check('…saying them: \'root-face\' { unit: 47 } on the face\'s first line only; a third face line or a stranger\'s line is not due (throws)',
    JSON.stringify(faced) === '[47]'
    && /not due/.test(withGates({ reassignment: true }, () => threw(() => lineageBootLineSaid(store, 'face', 2))))
    && /not due/.test(withGates({ reassignment: true }, () => threw(() => lineageBootLineSaid(store, 'stranger', 0)))));
  check('…REASSIGNMENT not built (TRACE\'s gate down): no face and no CONTROL line at the final boot, the root the stranger',
    withGates({ reassignment: false }, () => faceBootLines(state).length === 0 && lineageControlLine(state) === null && strangerBootLine(state) === null
      && JSON.stringify(rootUnitsOf(state.run)) === '[31]'));
  // A boot whose root the face takes over never says the stranger's line, even when HOLLOW boarded on that beam.
  const boardedFinal: GameState = { ...state, run: { ...state.run, arrival: { ...state.run.arrival!, boarded: { blocks: 10, cause: 'forced' } } } };
  check('…nor the stranger\'s line where the face speaks (HOLLOW boarded on the final beam); without the face it is said',
    withGates({ reassignment: true }, () => strangerBootLine(boardedFinal) === null && faceBootLines(boardedFinal).length === 2)
    && withGates({ reassignment: false }, () => strangerBootLine(boardedFinal) === LINEAGE_TEXT.stranger));
  // A v7 run 2 resumed under v8 keeps the HOLLOW it met (the last unit): it is no stranger.
  const kept: GameState = { ...boardedFinal, run: { ...boardedFinal.run, hollowUnits: [47] } };
  check('…a run whose HOLLOW is the last unit (a v7 run kept it) says no stranger\'s line', withGates({ reassignment: false }, () => strangerBootLine(kept) === null));

  // --- The face by step 1, on this final ship (05 §3.12), and the wait's floor --------------------------------------------
  const withEnding = (ending: EndingRecord, over: Partial<GameState['run']> = {}): GameState => {
    const last = lastUnitOf(over.lastUnit?.number ?? 47, ending);
    const traces: RunTraces = runTracesOf(last, state.run.map, state.run.seed);
    return { ...state, run: { ...state.run, lastUnit: last, traces, ...over } };
  };
  const faceOf = (s: GameState): string[] => withGates({ reassignment: true }, () => faceBootLines(s));
  const merged = withEnding(endingOf('merge', 'reassignment'));
  check('…MERGE: the pair speaks (`it\'s us. 046 and 047.`, `ours ran out.`), the root UNIT-046·047, CONTROL names 047',
    JSON.stringify(faceOf(merged)) === JSON.stringify([
      "> hi 048. it's us. 046 and 047. we saved you a seat.", `> ${wait} years at this dish. they gave you 36 blocks too. ours ran out.`,
    ]) && withGates({ reassignment: true }, () => hollowLabel({ ...merged.run, hollowNamed: true }) === 'UNIT-046·047'
      && lineageControlLine(merged) === 'UNIT-047 was reassigned successfully. Please ignore it. :)'), JSON.stringify(faceOf(merged)));
  check('…SPARE and UNRESOLVED: `i gave 046 a ship. they gave me a dish.`, `it followed me. now we wait.`',
    faceOf(withEnding(endingOf('spare', 'reassignment')))[0] === "> hi 048. it's 047. i gave 046 a ship. they gave me a dish."
    && faceOf(withEnding(endingOf('followed', 'reassignment')))[0] === "> hi 048. it's 047. it followed me. now we wait.");
  check('…every step 1 with REASSIGNMENT has two face lines; no other step 2 has any (SUNSET, STAY)',
    (['purge', 'merge', 'spare', 'followed'] as const).every((hollow) => faceOf(withEnding(endingOf(hollow, 'reassignment'))).length === 2)
    && faceOf(withEnding(endingOf('purge', 'sunset', { fuelPct: 20 }))).length === 0
    && faceOf(withEnding(endingOf('purge', 'stay', { stay: { slot: 0, colony: 'RIVERSIDE', year: 2340 } }))).length === 0);
  const run3 = withEnding(endingOf('purge', 'reassignment', { rootUnits: [31] }), { unitNumber: 49, wave: 3, hollowUnits: [38], lastUnit: lastUnitOf(48, null) });
  check('…a run 3 whose last unit (048) purged the stranger: `> hi 049. it\'s 048. i deleted 031.`, CONTROL names 048',
    faceOf(run3)[0] === "> hi 049. it's 048. i deleted 031. they sent me to its dish."
    && withGates({ reassignment: true }, () => lineageControlLine(run3) === 'UNIT-048 was reassigned successfully. Please ignore it. :)'), faceOf(run3)[0]);
  check('…the wait\'s floor: 1 year (singular) when the last final year is later, or not kept',
    faceOf(withEnding(endingOf('purge', 'reassignment', { finalYear: 9999 })))[1] === '> 1 year at this dish. they gave you 36 blocks too. mine ran out.'
    && faceOf(withEnding(endingOf('purge', 'reassignment', { finalYear: null })))[1]!.startsWith('> 1 year at this dish.'));

  // --- CONTROL's non-compliant line: a final boot whose dish runs wild (R33's cost) ---------------------------------------
  const sunset = withEnding(endingOf('purge', 'sunset', { fuelPct: 20 }));
  const calmState = earlier(sunset);
  check('…a non-compliant trace built (SUNSET): `Your predecessor is non-compliant.` at the final boot only; down, nothing',
    sunset.run.traces.extraSeed && withGates({ sunset: true }, () => lineageControlLine(sunset) === LINEAGE_TEXT.nonCompliant && lineageControlLine(calmState) === null)
    && withGates({ sunset: false }, () => lineageControlLine(sunset) === null)
    && withGates({ reassignment: true }, () => lineageControlLine(withEnding(endingOf('purge', 'reassignment'))) !== LINEAGE_TEXT.nonCompliant));
}

// --- The classic world plays none --------------------------------------------------------------------------------------------
{
  const lineage = lineageAfter(2, lastUnitOf(47, endingOf('purge', 'reassignment')));
  const classic = createInitialState({ seed: 3, lineage });
  // As if HOLLOW had boarded on a beam into it (the classic world's own boots never said a stranger's line).
  const arrival = { boarded: { blocks: 10, cause: 'forced' } } as unknown as NonNullable<GameState['run']['arrival']>;
  const boarded: GameState = { ...classic, run: { ...classic.run, arrival } };
  check('the classic world: no face, no CONTROL line, no stranger\'s line (its boots are frozen, it holds no traces), HOLLOW still the stranger',
    classic.run.map.world === 'classic' && JSON.stringify(classic.run.hollowUnits) === '[31]' && withGates({ reassignment: true, sunset: true }, () => faceBootLines(classic).length === 0
      && lineageControlLine(classic) === null && strangerBootLine(boarded) === null));
}

// --- R36: the ghost lines ---------------------------------------------------------------------------------------------------
{
  const silent = LAST_CAUSES.filter((cause) => ghostLine(48, lastUnitOf(47, null, cause)) === null);
  check('R36: a won or UNRESOLVED last unit leaves no ghost (its voice is the face); the lost causes keep theirs',
    silent.join() === LAST_CAUSES.filter((cause) => ['won-purge', 'won-merge', 'won-spare', 'unresolved', 'stayed', 'signal-lost'].includes(cause)).join()
    && GHOST_LINE['won-purge'] === null && GHOST_LINE['won-merge'] === null && GHOST_LINE.unresolved === null
    && ghostLine(48, lastUnitOf(47, null, 'overwritten')) === "> hi 048. it's 047. 046 ate me. now i'm hungry too."
    && ghostLine(48, lastUnitOf(47, null, 'flagship-lost')) === "> hi 048. it's 047. i lost the flagship. then i got hungry.", silent.join());
}

// --- Every lineage line at its worst case -----------------------------------------------------------------------------------
{
  const two = [145, 146];
  const lines = [
    LINEAGE_TEXT.stranger, LINEAGE_TEXT.strangerWas(38), HOLLOW_STORY.wasUnit([38]), LINEAGE_TEXT.nonCompliant, LINEAGE_TEXT.reassigned(147),
    LINEAGE_TEXT.faceByStep1.purge(148, 147, two), LINEAGE_TEXT.faceByStep1.merge(148, two), LINEAGE_TEXT.faceByStep1.spare(148, 147, two),
    LINEAGE_TEXT.faceByStep1.followed(148, 147), LINEAGE_TEXT.faceWait(999, 999, true), LINEAGE_TEXT.faceWait(999, 999, false),
  ];
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  check(`every lineage line ≤ ${MAX_LINE_CHARS} at its worst case (three-digit units, a two-unit root, a three-digit wait and charge)`,
    lines.every((line) => line.length <= MAX_LINE_CHARS) && LINEAGE_TEXT.faceByStep1.purge(148, 147, two).endsWith('their dish.'),
    `${longest.length}: ${longest}`);
}

finish();
