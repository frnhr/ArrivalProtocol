// WP8 acceptance 5 (§4.5's table, §9 WP8 item 5): every way a run can end gives the next run's ghost a line of
// at most 70 characters (with the worst-case unit numbers and ship names), or none (STAYED), and the right
// HOLLOW mid-run (slice 7c R34: a relay stranger from run 2, whatever the cause; 7d retired §4.5's hollowName with
// LINEAGE_BUILT, OPEN-DECISIONS 74). Plus the HOLLOW lines that take units (`> i was 047.`), the run-2 line after the POD 01 fight, the
// title's lineage line, and unit / wave numbering through createRunState and the mission line. And where the ghost
// speaks (ghostLineDue: in or past the layer of the last unit's grey cross, never ship 1, once a run; slice-2-plan's
// follow-up, Fran's playtest; on run 1's worked route since Track RETIRE retired the classic five's index rule).
import { check, finish } from '../wp1/harness';
import {
  ghostLine, ghostLineDue, lineageOf, freshMeta, recordRunStart, recordRunEnd, LAST_CAUSES,
  FIRST_RUN_LINEAGE,
  type LastUnit, type LastCause,
} from '@systems/meta';
import { hollowLabel } from '@systems/say';
import { lastUnitRoot } from '@systems/traces';
import { createInitialState } from '@state/initial';
import { HOLLOW_STORY, GHOST_LINE, hollowUnitName } from '@data/hollow-text';
import { lineageLine, LINES, WORST_CASE_VARS, type LineVars } from '@data/script';
import type { GameState } from '@state/schema';
import { MAX_LINE_CHARS, NAME_MAX_CHARS } from '@data/tuning';
import { createRunMap } from '@systems/map-run';
import { mapAlong, WORKED_ROUTE } from '@systems/arm-fixture';
import { RUN1_TRAIL } from '../world/run2-fixture';
import { solLy } from '@systems/map-geometry';
import { END_SLOTS } from '@data/arm';

// The line vars a title line reads (lineVars needs a mounted predictor; these lines only use the mission's unit, the
// run's start year and the final ship's distance from SOL, as lineVars reads them).
const titleVars = (state: GameState): LineVars => ({
  ...WORST_CASE_VARS, unit: state.mission.transmissionNum, wave: state.mission.wave, distanceLy: solLy(END_SLOTS[0]!), year: state.run.map.startYear,
});

// WP11: the last ship a unit was on is LAST LIGHT (the flagship) for every cause the finale or its loss ends a run with.
const last = (cause: LastCause, over: Partial<LastUnit> = {}): LastUnit => ({
  number: 47, landed: 6200, shipName: 'LAST LIGHT', cause, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, skills: null, ending: null, ...over,
});

// --- §4.5's table, run 2 after run 1 -----------------------------------------------------------------------
const expected: Record<LastCause, { line: string | null }> = {
  overwritten: { line: "> hi 048. it's 047. 046 ate me. now i'm hungry too." },
  // Slice 7c (R36): a won or UNRESOLVED last unit was not lost (no grey cross) and leaves no ghost; its voice is the face
  // line at the final ship after REASSIGNMENT (traces/lineage). Slice 7a had SPARE's already.
  'won-purge': { line: null },
  'won-merge': { line: null },
  'won-spare': { line: null },
  unresolved: { line: null },
  // WP11: LAST LIGHT is the flagship, as §4.5's line says it.
  'flagship-lost': { line: "> hi 048. it's 047. i lost the flagship. then i got hungry." },
  abandoned: { line: "> hi 048. it's 047. i blinked and the run was gone." },
  // (WP8's interim 'reassigned', the end of a fleet that stopped before LAST LIGHT, is gone with that fleet: WP11.)
  stayed: { line: null },
  // Slice 3c review fix (minor 7): a run the game could not give back (its save refused): HOLLOW is that unit, and its ghost
  // says nothing (no `i blinked`).
  'signal-lost': { line: null },
};
for (const cause of LAST_CAUSES) {
  const unit = last(cause);
  const line = ghostLine(48, unit);
  const hollow = hollowUnitName(lineageOf({ ...freshMeta(), runs: 1, lastUnit: unit }).hollowUnits);
  check(`${cause}: HOLLOW mid-run is UNIT-031 (R34, whatever the cause), ghost ${expected[cause].line === null ? 'silent' : 'says §4.5\'s line'}`,
    hollow === 'UNIT-031' && line === expected[cause].line, `${hollow} · ${line}`);
}
check('the first run: HOLLOW is UNIT-046 and there is no ghost (`> ...047?` after the POD 01 fight instead)',
  hollowUnitName(lineageOf(freshMeta()).hollowUnits) === 'UNIT-046' && ghostLine(47, null) === null && HOLLOW_STORY.noticed(47) === '> ...047?');
check('a flagship lost on LAST LIGHT is "the flagship"; a record from before it existed names its ship',
  ghostLine(48, last('flagship-lost')) === "> hi 048. it's 047. i lost the flagship. then i got hungry."
  && ghostLine(48, last('flagship-lost', { shipName: 'HALCYON' })) === "> hi 048. it's 047. i lost halcyon. then i got hungry.");

// --- Where the ghost speaks (05 §3.5: at the first boot in or past the layer where it was lost, never at ship 1) ---------
// Track RETIRE: the classic five's rule (the lost ship's index, ghostShipIndex) went with them; these are its ghostLineDue
// checks on run 1's worked route, the last unit lost at VESPER (Cinder, slot 11: layer 5). world/lineage has the cross's
// rule itself (ghostPlaceReached).
{
  const arm = createRunMap({ wave: 1 }, 1);
  const names = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'CORMORANT', 'LAST LIGHT'];
  const vesper = names.indexOf('VESPER');
  const run = (shipIndex: number, lastUnit: LastUnit | null, ghostSpoken = false) => ({
    unitNumber: 48, lastUnit, shipIndex, ghostSpoken, map: mapAlong(arm, WORKED_ROUTE.slice(0, shipIndex + 1)),
  });
  const lostOnVesper = last('overwritten', { shipName: 'VESPER', trail: { ...RUN1_TRAIL, lost: { slot: 11, year: 2625, pastLy: 0, cause: 'overwritten' } } });
  const line = ghostLine(48, lostOnVesper);
  check('ghostLineDue: lost at VESPER → nothing before VESPER, the line at VESPER and past it (a skipped VESPER still hears it)',
    names.every((_, index) => (ghostLineDue(run(index, lostOnVesper)) === (index >= vesper ? line : null))));
  check('…nothing once it has spoken this run, on any ship', names.every((_, index) => ghostLineDue(run(index, lostOnVesper, true)) === null));
  check('…nothing on a first run, nor after a unit that STAYED (it left no ghost)',
    names.every((_, index) => ghostLineDue(run(index, null)) === null && ghostLineDue(run(index, last('stayed'))) === null));
}

// --- Every line fits, at the worst case --------------------------------------------------------------------
{
  const longShip = 'W'.repeat(NAME_MAX_CHARS);
  const worst: string[] = [];
  for (const cause of LAST_CAUSES) {
    for (const hollowUnits of [[998], [997, 998]]) {
      const line = ghostLine(999, last(cause, { number: 998, shipName: longShip, hollowUnits }));
      if (line !== null) worst.push(line);
    }
  }
  const longest = worst.reduce((a, b) => (b.length > a.length ? b : a), '');
  check(`every ghost line is ≤ ${MAX_LINE_CHARS} characters with 3-digit units, a merged HOLLOW and a ${NAME_MAX_CHARS}-letter ship`,
    worst.every((line) => line.length <= MAX_LINE_CHARS), `${longest.length}: ${longest}`);
  // Slice 7a (R36): and a SPARE, which was not lost (its voice is 7c's face line); slice 7c (R36): every won or UNRESOLVED one.
  check('every cause has an entry in the ghost table (silent only for STAYED, a run the game lost: signal-lost, and every won or UNRESOLVED ending)',
    LAST_CAUSES.every((cause) => (GHOST_LINE[cause] === null)
      === (cause === 'stayed' || cause === 'signal-lost' || cause === 'won-spare' || cause === 'won-purge' || cause === 'won-merge' || cause === 'unresolved')));
  const story = [HOLLOW_STORY.remembers, HOLLOW_STORY.wasUnit([998]), HOLLOW_STORY.wasUnit([997, 998]), HOLLOW_STORY.decommissioned(hollowUnitName([997, 998])),
  ];
  check('the run-2 HOLLOW lines fit too', story.every((line) => line.length <= MAX_LINE_CHARS), story.join(' | '));
}

// --- Merges: the root keeps the two newest units (R35: after a MERGE + REASSIGNMENT the final root is the pair) ---------
{
  const pair = lastUnitRoot({ unit: 48, ending: { hollow: 'merge', you: 'reassignment', rootUnits: [46, 47], finalSlot: 19, finalShip: 'X', finalYear: 2600, stay: null, kit: [], fuelPct: null, charge: 0 } });
  check('a second MERGE keeps the two newest units (UNIT-047·048), so the name still fits a chip', hollowUnitName(pair) === 'UNIT-047·048');
}

// --- HOLLOW's own lines take its units -------------------------------------------------------------------------
check('`> i was 046. they sent me first.` on run 1; `> i was 047.` when the last unit is HOLLOW',
  HOLLOW_STORY.wasUnit([46]) === '> i was 046. they sent me first.' && HOLLOW_STORY.wasUnit([47]) === '> i was 047. they sent me first.');
// Final fix pass: a merged HOLLOW speaks as `we`, as its ghost does at the boot (`it's us`).
check('a merged HOLLOW says both, as `we`', HOLLOW_STORY.wasUnit([46, 47]) === '> we were 046 and 047. they sent us first.'
  && HOLLOW_STORY.hello(48, 36, [46, 47]) === '> hello 048. they sent us with 36 blocks of charge too.');
check('the POD 01 fight on a later run ends with `> you remember me. good.`', HOLLOW_STORY.remembers === '> you remember me. good.');

// --- Unit and wave numbering --------------------------------------------------------------------------------------
{
  const run1 = createInitialState({ seed: 1, phase: 'title' });
  // Slice 3a: the title line is 05 §3.12's `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT` (the wave is the run's, off the line).
  check('run 1: UNIT-047 · WAVE 1, `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT` on the title line; HOLLOW unnamed (???), UNIT-046 once named',
    run1.mission.unitId === 'UNIT-047' && run1.mission.wave === 1 && LINES.titleUnit(titleVars(run1)) === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT'
      && hollowLabel(run1.run) === '???' && hollowLabel({ ...run1.run, hollowNamed: true }) === 'UNIT-046');
  const meta = recordRunEnd(recordRunStart(freshMeta(), { unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null }, 0),
    { unit: 47, shipName: 'HALCYON', landed: 3100, stats: { moves: 4, deletes: 0 }, hollowUnits: [46], trail: null, cause: 'overwritten', score: 3000 });
  const run2 = createInitialState({ seed: 1, phase: 'title', lineage: lineageOf(meta) });
  // Slice 7c (R34): from run 2 mid-run HOLLOW is a relay stranger, 031 on run 2 (never the last unit).
  check('run 2: UNIT-048 · WAVE 2, the crumb\'s unit id, the last unit kept on the run, HOLLOW is UNIT-031 (the relay stranger)',
    run2.mission.unitId === 'UNIT-048' && run2.run.unitNumber === 48 && run2.run.wave === 2 && run2.mission.transmissionNum === 48
      && LINES.titleUnit(titleVars(run2)) === 'UNIT-048 · YEAR 2300 · FINAL SHIP 180 LY OUT'
      && run2.run.lastUnit?.number === 47 && hollowLabel({ ...run2.run, hollowNamed: true }) === 'UNIT-031',
    `${run2.mission.unitId} wave ${run2.run.wave}`);
  check('the first run\'s lineage is UNIT-047 on wave 1 with HOLLOW UNIT-046', FIRST_RUN_LINEAGE.unitNumber === 47 && FIRST_RUN_LINEAGE.wave === 1
    && JSON.stringify(FIRST_RUN_LINEAGE.hollowUnits) === '[46]' && FIRST_RUN_LINEAGE.lastUnit === null);
}

// --- The title's lineage line (§4.5: `last: UNIT-047 · 6,200 landed · overwritten at VESPER`) ----------------------------
{
  check('overwritten: `last: UNIT-047 · 6,200 landed · overwritten at VESPER`', lineageLine(last('overwritten', { shipName: 'VESPER' })) === 'last: UNIT-047 · 6,200 landed · overwritten at VESPER',
    lineageLine(last('overwritten')) ?? '');
  check('stayed: `UNIT-047 stayed with them.`', lineageLine(last('stayed')) === 'UNIT-047 stayed with them.');
  check('the first run has no lineage line', lineageLine(null) === null);
  const lines = LAST_CAUSES.map((cause) => lineageLine(last(cause, { number: 998, landed: 99_999, shipName: 'W'.repeat(NAME_MAX_CHARS) })) ?? '');
  check(`every lineage line is ≤ ${MAX_LINE_CHARS} characters at the worst case`, lines.every((line) => line.length > 0 && line.length <= MAX_LINE_CHARS),
    lines.reduce((a, b) => (b.length > a.length ? b : a), ''));
}

finish();
