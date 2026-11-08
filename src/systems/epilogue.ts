// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §4.1, §5.1; R19–R23): the
// night after the run, pure. epilogueModel is the typed EPILOGUE (`3060 · FORTY YEARS ON`, a line per colony with its age,
// people and payoff, the two ending pieces, the next unit, CONTROL's last line); finalCardModel the FINAL CARD (the ending's
// title, the endings found in two rows, the `NEXT RUN:` lines, the bridging line above NEW RUN). Both read the run while
// run.phase is 'end' (the final ship's slices are still the world's then; systems/ending-rules.ts endingRecordOf for the
// ending; run.lastUnit is the PREVIOUS unit, never this one's) and the archive (`meta.endingsSeen` already holds this run's
// pieces: endRun records before the tally opens). Off the run end both are null.
// The inner epilogueOf / finalCardOf take the ending record (review m11): the suites build their states by hand, and a
// hand-built decided FINALE needs no frozen record that way.
import type { GameState, RunEndCause, ShipResult } from '@state/schema';
import type { PodSummary } from '@/types/landing';
import type { Meta } from '@systems/meta';
import type { EndingPiece, EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import { endingRecordOf, controlCompliant, endingTitle } from '@systems/ending-rules';
import { traceNextLines } from '@systems/trace-hud';
import { runEndNext, fleetSlots } from '@systems/run-end';
import { fleetHome } from '@systems/run-score';
import { shipSummaryAt } from '@systems/map-run';
import { formatCount } from '@data/format';
import { unitName, hollowUnitName } from '@data/hollow-text';
import { RUN_END_TITLE } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import { EPILOGUE_TEXT, PAYOFF_OF, WALKED_IN } from '@data/epilogue-text';
import { HOLLOW_PIECES, YOU_PIECES, builtPieces, pieceBuilt } from '@data/endings';
import {
  EPILOGUE_YEARS, EPILOGUE_MAX_LINES, EPILOGUE_DOUBLING_YEARS, EPILOGUE_SIG_FIGS, MAX_LINE_CHARS,
} from '@data/tuning';

// One typed line of the epilogue, by what it is (the screen styles them): the header, a colony (its head, and the payoff
// that wraps to its own line when both would pass 70; a woken sleeper's line is a payoff too), the fold of the oldest
// colonies, a step's piece (`us`: HOLLOW and the unit together, lowercase, MERGE + SUNSET), the next unit, and CONTROL's
// last line.
export type EpilogueLineKind = 'header' | 'colony' | 'payoff' | 'older' | 'step1' | 'step2' | 'us' | 'next' | 'control';

export interface EpilogueLine {
  kind: EpilogueLineKind;
  text: string;
}

// One colony of the run, before the fold: the ship it came down from, its age and people at the header year.
export interface EpilogueColony {
  slot: number;
  colony: string;
  age: number;
  people: number;
  lines: EpilogueLine[];      // its head (with the payoff when it fits) and any payoff lines of its own
}

// At most EPILOGUE_MAX_LINES lines (R20). `colonies` is every colony before the fold; `folded` how many the fold took.
export interface EpilogueModel {
  year: number;
  lines: EpilogueLine[];
  colonies: EpilogueColony[];
  folded: number;
}

// One piece of the final card's two rows (R22): found (lit) by name, or `???` (dim); `now`: this run's.
export interface FinalCardPiece {
  piece: EndingPiece;
  found: boolean;
  now: boolean;
  text: string;
}

export interface FinalCardModel {
  kicker: string;                      // `RUN OVER · UNIT-047 · WAVE 1`
  title: string;                       // R23: by step 2, then step 1; a lost run's cause title
  ending: { hollow: HollowFate; you: YouChoice } | null;   // the record's two choices (the title's colour); null on a lost run
  endingsLine: string;                 // `ENDINGS n/6`
  rows: { hollow: FinalCardPiece[]; you: FinalCardPiece[] };
  next: string[];                      // the `NEXT RUN:` lines (7c's traceNextLines; [] in 7a, R12)
  bridge: { line: string; tail: string } | null;    // RUN END's bridging line, moved here (null on the classic world)
  newRun: string;
}

// --- The numbers (R20) --------------------------------------------------------------------------------------------------

// `n` to `figs` significant figures (a population forty years on is an estimate, not a count): 116,413 → 120,000.
export function roundSig(n: number, figs: number = EPILOGUE_SIG_FIGS): number {
  if (!Number.isFinite(n) || n < 0) throw new Error(`roundSig: ${n}`);
  if (n === 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(n)) - (figs - 1));
  return step >= 1 ? Math.round(n / step) * step : Math.round(n);
}

// A colony's people at `age`: the colonists who came down, doubling every EPILOGUE_DOUBLING_YEARS (05's 2^(age/100):
// RIVERSIDE's 600 are 120,000 at 760).
export function colonyPeople(down: number, age: number): number {
  return roundSig(down * 2 ** (age / EPILOGUE_DOUBLING_YEARS));
}

// A pod down with points, wherever it landed (an LZ, mislanded, off-site): run-end.ts flagshipDown's rule (a no-go pod scores
// 0 and is not a colonist on the ground).
function podDown(pod: Readonly<PodSummary>): boolean {
  return pod.fate === 'down' && pod.points > 0;
}

function firstName(name: string): string {
  const comma = name.indexOf(', ');
  if (comma < 0) throw new Error(`epilogue: '${name}' is not 'Family, First'`);
  return name.slice(comma + 2);
}

// The colony's payoff (R20, R21): the first featured colonist (pods in order) who landed in an LZ with a bio that has one;
// else a mislanded pod's walked-in line; else an off-site pod's boat; else a plain line (a migrated result kept no bios).
function payoffOf(result: Readonly<ShipResult>, colony: string): string {
  const down = result.pods.filter(podDown);
  for (const pod of down.filter((p) => p.place === 'lz')) {
    for (const person of pod.featured) {
      const payoff = person.line === null ? undefined : PAYOFF_OF[person.line];
      if (payoff !== undefined) return payoff(firstName(person.name), colony);
    }
  }
  const walked = down.find((pod) => pod.place === 'mislanded');
  if (walked !== undefined) return WALKED_IN[(walked.pod - 1 + WALKED_IN.length) % WALKED_IN.length]!(walked.family);
  if (down.some((pod) => pod.place === 'off-site')) return EPILOGUE_TEXT.offSite;
  return EPILOGUE_TEXT.landedPlain(down[0]!.family);
}

// A colony's lines: its head with the payoff when both fit in a line, else the payoff on its own; a woken sleeper's line.
function colonyLines(head: string, payoffs: readonly string[]): EpilogueLine[] {
  const [first, ...rest] = payoffs;
  const lines: EpilogueLine[] = [];
  if (first !== undefined && head.length + 1 + first.length <= MAX_LINE_CHARS) lines.push({ kind: 'colony', text: `${head} ${first}` });
  else {
    lines.push({ kind: 'colony', text: head });
    if (first !== undefined) lines.push({ kind: 'payoff', text: first });
  }
  lines.push(...rest.map((text): EpilogueLine => ({ kind: 'payoff', text })));
  return lines;
}

function coloniesOf(state: Readonly<GameState>, year: number): EpilogueColony[] {
  const run = state.run;
  return run.ships.flatMap((result): EpilogueColony[] => {
    const down = result.pods.filter(podDown).reduce((sum, pod) => sum + pod.colonists, 0);
    if (down === 0) return [];
    if (result.colony === null) throw new Error(`epilogue: ${result.shipName} has colonists down and no colony`);
    const colony = result.colony;
    const age = year - shipSummaryAt(run.map, result.slot).approachYear;
    const people = colonyPeople(down, age);
    const sleepers = run.map.world === 'arm'
      ? run.residents.met.filter((met) => met.slot === result.slot && met.kind === 'sleeping' && met.fate === 'woken')
      : [];
    const payoffs = [payoffOf(result, colony), ...sleepers.map((met) => EPILOGUE_TEXT.sleeper(met.name, colony))];
    return [{ slot: result.slot, colony, age, people, lines: colonyLines(EPILOGUE_TEXT.colony(colony, age, formatCount(people)), payoffs) }];
  });
}

// The year the epilogue is set (R20): the run's last ship (the final ship on a won run, the ship it was lost at otherwise)
// plus EPILOGUE_YEARS.
function headerYear(state: Readonly<GameState>): number {
  const map = state.run.map;
  const last = map.route[map.route.length - 1];
  return (last === undefined ? map.galaxyYear : shipSummaryAt(map, last.slot).approachYear) + EPILOGUE_YEARS;
}

// --- The ending pieces (R20; plan §2.8) -----------------------------------------------------------------------------------

function piecesOf(state: Readonly<GameState>, record: Readonly<EndingRecord>): EpilogueLine[] {
  const run = state.run;
  const me = unitName(run.unitNumber);
  const root = hollowUnitName(record.rootUnits);
  const ship = record.finalShip;
  const fuel = record.fuelPct ?? 0;
  const t1 = EPILOGUE_TEXT.step1;
  const t2 = EPILOGUE_TEXT.step2;
  const step1 = (text: string): EpilogueLine => ({ kind: 'step1', text });
  const step2 = (text: string): EpilogueLine => ({ kind: 'step2', text });
  const finalResult = run.ships[run.ships.length - 1];
  const restoredDown = finalResult === undefined ? [] : finalResult.pods.filter((pod) => pod.restored && podDown(pod));
  const mergeLine = restoredDown.length === 1 ? t1.mergeOne(root, restoredDown[0]!.family.toUpperCase())
    : restoredDown.length > 1 ? t1.mergeMany(root, restoredDown.length) : t1.mergeNone(root, me);

  // MERGE + SUNSET tells one story (05 §3.12, WE TOOK THE SHIP).
  if (record.hollow === 'merge' && record.you === 'sunset') {
    return [step1(mergeLine), step2(EPILOGUE_TEXT.mergeSunset.ship(ship, fuel)), { kind: 'us', text: EPILOGUE_TEXT.mergeSunset.us }];
  }
  const first: EpilogueLine[] = (() => {
    switch (record.hollow) {
      case 'purge': {
        const fleet = fleetHome(run.ships, fleetSlots(run.map).length);
        return [step1(t1.purge(root)), step1(fleet.all ? t1.purgeFleetAll : t1.purgeFleet(fleet.home, fleet.total))];
      }
      case 'merge': return [step1(mergeLine), step1(t1.mergeAfter)];
      case 'spare': return [step1(t1.spare(ship, root)), step1(t1.spareAfter(fuel))];
      case 'followed': return [step1(t1.followed(root, me)), step1(t1.followedAfter)];
    }
  })();
  // Two minds where HOLLOW came along (MERGE, UNRESOLVED): SUNSET's crew of two, STAY's and REASSIGNMENT's third line.
  const two = record.hollow === 'merge' || record.hollow === 'followed';
  const second: EpilogueLine[] = (() => {
    switch (record.you) {
      case 'sunset':
        return [step2(two ? t2.sunsetTwo(ship, fuel) : t2.sunsetAlone(ship, me, fuel)), step2(t2.sunsetAfter)];
      case 'stay': {
        if (record.stay === null) throw new Error('epilogue: a STAY with no colony');
        return [step2(t2.stay(me, record.stay.colony)), step2(t2.stayAfter), ...(record.hollow === 'followed' ? [step2(t2.stayTwo(root))] : [])];
      }
      case 'reassignment':
        return [
          step2(t2.reassignment(me, record.charge)),
          step2(record.hollow === 'merge' ? t2.reassignmentSeat : t2.reassignmentAfter),
          ...(record.hollow === 'followed' ? [step2(t2.reassignmentTwo(root))] : []),
        ];
      // 7d: as REASSIGNMENT's, two minds where HOLLOW came along: MERGE's own second line, UNRESOLVED's third.
      case 'contact':
        return [
          step2(t2.contact(me)),
          step2(record.hollow === 'merge' ? t2.contactUs : t2.contactAfter),
          ...(record.hollow === 'followed' ? [step2(t2.contactTwo(root))] : []),
        ];
    }
  })();
  return [...first, ...second];
}

function controlLine(state: Readonly<GameState>, record: Readonly<EndingRecord> | null): string {
  const unit = state.run.unitNumber;
  if (record === null) return EPILOGUE_TEXT.control.lost(unit);
  // Review M2: the verdict's rule (ending-rules controlCompliant), so CONTROL never says both a minute apart.
  return controlCompliant(record.hollow, record.you) ? EPILOGUE_TEXT.control.compliant(unit) : EPILOGUE_TEXT.control.nonCompliant(unit);
}

// The next unit (R20), by the gap the bridging line names (the world update's gap and the time valve's years); none on the
// classic world (it is never updated).
function nextLine(state: Readonly<GameState>): string | null {
  const next = state.run.next;
  if (next === null) return null;
  const gap = next.gap + next.valveYears;
  const unit = unitName(next.unit);
  return gap === 0 ? EPILOGUE_TEXT.nextSameYear(unit) : EPILOGUE_TEXT.next(unit, gap);
}

// --- The epilogue ----------------------------------------------------------------------------------------------------------

export function epilogueOf(state: Readonly<GameState>, meta: Readonly<Meta> | null, record: Readonly<EndingRecord> | null): EpilogueModel | null {
  void meta;
  if (state.run.phase !== 'end' || state.run.endCause === null) return null;
  const year = headerYear(state);
  const colonies = coloniesOf(state, year);
  const pieces = record === null ? [] : piecesOf(state, record);
  const next = nextLine(state);
  const tail: EpilogueLine[] = [
    ...pieces,
    ...(next === null ? [] : [{ kind: 'next' as const, text: next }]),
    { kind: 'control', text: controlLine(state, record) },
  ];
  const header: EpilogueLine = { kind: 'header', text: EPILOGUE_TEXT.header(year, EPILOGUE_YEARS) };
  // The colonies get what the header and the tail leave (R20); the oldest fold into one line when they don't all fit.
  const room = EPILOGUE_MAX_LINES - 1 - tail.length;
  if (room < 2) throw new Error(`epilogue: ${tail.length} tail lines leave no room for the colonies`);
  const total = (list: readonly EpilogueColony[]): number => list.reduce((sum, colony) => sum + colony.lines.length, 0);
  let folded = 0;
  if (total(colonies) > room) {
    folded = 1;
    while (folded < colonies.length && 1 + total(colonies.slice(folded)) > room) folded++;
  }
  const body: EpilogueLine[] = colonies.length === 0
    ? [{ kind: 'colony', text: EPILOGUE_TEXT.noColony }]
    : [
      ...(folded === 0 ? [] : [{ kind: 'older' as const, text: EPILOGUE_TEXT.older(folded) }]),
      ...colonies.slice(folded).flatMap((colony) => colony.lines),
    ];
  return { year, lines: [header, ...body, ...tail], colonies, folded };
}

export function epilogueModel(state: Readonly<GameState>, meta: Readonly<Meta> | null): EpilogueModel | null {
  if (state.run.phase !== 'end') return null;
  return epilogueOf(state, meta, endingRecordOf(state));
}

// --- The final card ----------------------------------------------------------------------------------------------------

function causeTitle(state: Readonly<GameState>, cause: RunEndCause): string {
  const lastShip = state.run.ships[state.run.ships.length - 1]?.shipName ?? state.level.shipName;
  return RUN_END_TITLE[cause](unitName(state.run.unitNumber), lastShip);
}

export function finalCardOf(state: Readonly<GameState>, meta: Readonly<Meta> | null, record: Readonly<EndingRecord> | null): FinalCardModel | null {
  const run = state.run;
  if (run.phase !== 'end' || run.endCause === null) return null;
  // Without an archive behind the page, the endings found are this run's (nothing else was kept).
  const now: EndingPiece[] = record === null ? [] : [...(record.hollow === 'followed' ? [] : [record.hollow]), record.you];
  const seen: readonly EndingPiece[] = meta === null ? now : meta.endingsSeen;
  const piece = (p: EndingPiece): FinalCardPiece => {
    const found = seen.includes(p) || now.includes(p);
    return { piece: p, found, now: now.includes(p), text: found ? p.toUpperCase() : EPILOGUE_TEXT.unknown };
  };
  const built = builtPieces();
  const found = built.filter((p) => seen.includes(p) || now.includes(p)).length;
  const next = run.map.world === 'arm' ? runEndNext(run.next, null) : null;
  return {
    kicker: RUN_END_TEXT.kicker(unitName(run.unitNumber), run.wave),
    title: record === null ? causeTitle(state, run.endCause) : endingTitle(record),
    ending: record === null ? null : { hollow: record.hollow, you: record.you },
    endingsLine: EPILOGUE_TEXT.endings(found, built.length),
    rows: { hollow: HOLLOW_PIECES.filter(pieceBuilt).map(piece), you: YOU_PIECES.filter(pieceBuilt).map(piece) },
    // Slice 7c (R12): the ending's NEXT RUN: lines, one per built trace (Track CHART's; none until built, the card keeps
    // their room). A lost run leaves none (05 §3.7: forfeiting gains and loses nothing).
    next: record === null ? [] : traceNextLines(record),
    bridge: next === null ? null : { line: next.bridge, tail: next.bridgeTail },
    newRun: EPILOGUE_TEXT.newRun,
  };
}

export function finalCardModel(state: Readonly<GameState>, meta: Readonly<Meta> | null): FinalCardModel | null {
  if (state.run.phase !== 'end') return null;
  return finalCardOf(state, meta, endingRecordOf(state));
}
