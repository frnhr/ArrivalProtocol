// Slice 7a Track NIGHT (docs/phase3/impl/slice-7-plan.md §6.1 ending/epilogue; R19–R23), pure: the EPILOGUE's and the FINAL
// CARD's models (systems/epilogue.ts) on run 1's arm with a crafted end on the worked route (ARES-VII 2300 … LAST LIGHT 3020),
// the ending record injected (review m11: epilogueOf / finalCardOf).
// • the numbers: 2 significant figures, people doubling every 100 years (RIVERSIDE's 600 are 120,000 at 760), each colony's
//   age at the header year (3060 · FORTY YEARS ON), a lost run's header from its last ship;
// • the colonies: one per visited ship with colonists down with points, the payoff by the first featured colonist landed in
//   an LZ (keyed by the bio, PAYOFF_OF), else a mislanded pod's walked-in line, else the boat, else a plain line; the payoff on
//   its own line when the head and it pass 70; a woken sleeper's line; no-go and unlaunched pods never told;
// • the fold: at most 16 lines, the oldest colonies folded into `+ n OLDER COLONIES`;
// • the pieces: each step 1 × each step 2 (MERGE + SUNSET's own piece), CONTROL's last line, the next unit by the gap (0: the
//   same year);
// • the final card: every title by combination (STAY's colony), the rows from endingsSeen (CONTACT absent until built), this
//   run's pieces, ENDINGS n/6, the bridge, a lost run's cause title; off the run end both models are null.
import { check, finish } from '../landing/checks';
import { createStore } from '@state/store';
import type { GameState, ShipResult, ShipOutcome, RunEndCause } from '@state/schema';
import type { PodSummary, Place } from '@/types/landing';
import type { RouteStop } from '@/types/map';
import type { EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import { createInitialState } from '@state/initial';
import { hopBetween } from '@systems/map-hop';
import { freshMeta, type Meta } from '@systems/meta';
import {
  epilogueOf, epilogueModel, finalCardOf, finalCardModel, roundSig, colonyPeople, endingTitle, type EpilogueModel,
} from '@systems/epilogue';
import { ENDING_TITLE, EPILOGUE_TEXT, PAYOFF_OF, WALKED_IN } from '@data/epilogue-text';
import { ENDINGS_BUILT, builtPieces, HOLLOW_PIECES, YOU_PIECES, type EndingTitleKey } from '@data/endings';
import { EPILOGUE_MAX_LINES, MAX_LINE_CHARS } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from '../map/run1-fixture';

// --- Building an end by hand ------------------------------------------------------------------------------------------------

interface PodSpec {
  family: string;
  place: Place | null;          // null: not down (parked)
  colonists?: number;
  lines?: (string | null)[];    // the featured colonists' bios (first names Ana, Ben, Cy)
  restored?: boolean;
}

function pod(n: number, spec: PodSpec): PodSummary {
  const colonists = spec.colonists ?? 200;
  const down = spec.place !== null;
  const points = !down || spec.place === 'no-go' ? 0 : spec.place === 'off-site' ? 50 : 200;
  const firsts = ['Ana', 'Ben', 'Cy'];
  return {
    pod: n, family: spec.family, colonists, fate: down ? 'down' : 'parked', place: spec.place, lz: spec.place === 'lz' ? 'LZ-A' : null,
    touch: down ? 'soft' : null, points, parkedWhy: down ? null : 'driver-eaten', restored: spec.restored ?? false,
    featured: (spec.lines ?? [null]).map((line, i) => ({ name: `${spec.family}, ${line === ADA_LINE ? 'Ada' : firsts[i] ?? 'Dee'}`, age: 30, line })),
  } as PodSummary;
}

function ship(name: string, slot: number, depth: number, colony: string | null, pods: PodSpec[], outcome: ShipOutcome = 'locked'): ShipResult {
  const summaries = pods.map((spec, i) => pod(i + 1, spec));
  const landed = summaries.filter((p) => p.place === 'lz').reduce((sum, p) => sum + p.colonists, 0);
  return {
    shipId: `ship-${slot}`, shipName: name, slot, depth, outcome, stars: 2, fuelLeftPct: 30, ringMiss: null, survey: null,
    colonistsAboard: summaries.reduce((sum, p) => sum + p.colonists, 0), lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [],
    notLaunched: 0, landedInLz: landed, points: summaries.reduce((sum, p) => sum + p.points, 0), colony, pods: summaries,
  };
}

const ADA_LINE = 'wants to name the first tree.';
const B = (i: number): string => Object.keys(PAYOFF_OF)[i]!;   // a bio by its place in the pool

function endState(ships: ShipResult[], opts: { route?: readonly number[]; cause?: RunEndCause; next?: { gap: number; valve?: number } | null } = {}): GameState {
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'desk' }));
  const route = opts.route ?? WORKED_ROUTE;
  const map = run1Map(4);
  map.route = route.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, route[i - 1]!, slot) }));
  map.galaxyYear = 3020;
  const next = opts.next === undefined ? { gap: 3 } : opts.next;
  store.update((draft) => {
    draft.run.map = map;
    draft.run.shipIndex = route.length - 1;
    draft.run.ships = ships;
    draft.run.endCause = opts.cause ?? 'won-purge';
    draft.run.phase = 'end';
    draft.run.next = next === null ? null : { unit: 48, run: 2, startYear: 2300 + next.gap + (next.valve ?? 0), gap: next.gap, valveYears: next.valve ?? 0 };
  });
  return store.getState();
}

function record(hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 3020,
    stay: you === 'stay' ? { slot: 0, colony: 'RIVERSIDE', year: 2300 } : null, kit: ['delete'],
    fuelPct: hollow === 'spare' || you === 'sunset' ? 23 : null, charge: 26, ...extra,
  };
}

// The worked route as 05's sample tells it: RIVERSIDE (Ada's), HALCYON's mislanded family, KESTREL's boat, VESPER's
// baker, CORMORANT's crash, FIRST LIGHT's 16 pods.
const WORKED: ShipResult[] = [
  ship('ARES-VII', 0, 1, 'RIVERSIDE', [
    { family: 'Okafor', place: 'lz', lines: [ADA_LINE, null, null] }, { family: 'Brandt', place: 'lz' }, { family: 'Al-Sayed', place: 'lz' },
  ]),
  ship('HALCYON', 2, 2, 'CASTILLO LANDING', [{ family: 'Castillo', place: 'mislanded', lines: [B(3)] }, { family: 'Udeh', place: null }]),
  ship('KESTREL', 5, 3, 'SALTMARSH', [{ family: 'Weber', place: 'off-site' }, { family: 'Kim', place: 'no-go', lines: [B(5)] }]),
  ship('VESPER', 11, 4, 'LANTERN', [{ family: 'Rossi', place: 'lz', lines: [null, 'will open the very first bakery.'] }]),
  ship('CORMORANT', 15, 5, null, [{ family: 'Sato', place: null }, { family: 'Xu', place: 'no-go' }], 'crashed'),
  ship('LAST LIGHT', 19, 6, 'FIRST LIGHT', Array.from({ length: 16 }, (_, i) => ({ family: `F${i}`, place: 'lz' as const }))),
];

const texts = (model: EpilogueModel | null): string[] => (model === null ? [] : model.lines.map((line) => line.text));
// A colony told with its payoff: beside its head, or on the line after it.
function told(model: EpilogueModel | null, colony: string, payoff: string): boolean {
  if (model === null) return false;
  const at = model.lines.findIndex((line) => line.kind === 'colony' && line.text.startsWith(`${colony} · `));
  if (at < 0) return false;
  const head = model.lines[at]!.text;
  return head.endsWith(` ${payoff}`) || (model.lines[at + 1]?.kind === 'payoff' && model.lines[at + 1]!.text === payoff);
}
const kinds = (model: EpilogueModel | null): string => (model === null ? '' : model.lines.map((line) => line.kind).join());

// --- The numbers -----------------------------------------------------------------------------------------------------------

check('2 significant figures: 116,413 → 120,000, 4,222 → 4,200, 999 → 1,000, 95 → 95, 0 → 0',
  roundSig(116413) === 120000 && roundSig(4222) === 4200 && roundSig(999) === 1000 && roundSig(95) === 95 && roundSig(0) === 0);
check('people double every 100 years: RIVERSIDE\'s 600 are 120,000 at 760 (05\'s sample); FIRST LIGHT\'s 3,200 are 4,200 at 40',
  colonyPeople(600, 760) === 120000 && colonyPeople(3200, 40) === 4200 && colonyPeople(200, 0) === 200);
let negative = '';
try { roundSig(-1); } catch (error) { negative = (error as Error).message; }
check('…a negative count throws (fail loudly)', negative !== '');

// --- The worked route, PURGE + REASSIGNMENT (05's "STAND BY") --------------------------------------------------------------

const worked = endState(WORKED);
const stand = epilogueOf(worked, null, record('purge', 'reassignment'));
const lines = texts(stand);
check('the header: the final ship\'s year + 40, `3060 · FORTY YEARS ON`', stand?.year === 3060 && lines[0] === '3060 · FORTY YEARS ON', lines[0]);
check('RIVERSIDE · 760 years · 120,000 people. Ada named the first tree. (the head and its payoff on one line)',
  lines[1] === 'RIVERSIDE · 760 years · 120,000 people. Ada named the first tree.', lines[1]);
check('…a mislanded pod\'s family walked in (its featured bio is not an LZ\'s payoff): CASTILLO LANDING',
  told(stand, 'CASTILLO LANDING', WALKED_IN[0]!('Castillo')), lines.join(' | '));
check('…an off-site pod is fetched by boat (the no-go pod is no colonist and its bio is never told): SALTMARSH',
  told(stand, 'SALTMARSH', EPILOGUE_TEXT.offSite)
  && !lines.some((text) => text.includes(PAYOFF_OF[B(5)]!('Ana', 'SALTMARSH'))), lines.join(' | '));
check('…the first featured colonist landed in an LZ with a bio pays off (VESPER\'s second: the bakery)',
  told(stand, 'LANTERN', "Ben's bakery never shut."), lines.join(' | '));
check('…a crashed ship with nobody down has no line (CORMORANT), and pods never launched are never mentioned',
  stand!.colonies.length === 5 && !lines.some((text) => /CORMORANT|NOT LAUNCHED|PARKED/.test(text)));
check('…the final colony at 40 years: FIRST LIGHT · 40 years · 4,200 people.', lines.some((text) => text.startsWith('FIRST LIGHT · 40 years · 4,200 people.')));
check('…a colony with no bio left (a migrated result) still did something: the plain line',
  told(stand, 'FIRST LIGHT', EPILOGUE_TEXT.landedPlain('F0')), lines.join(' | '));
check('…then the pieces: PURGE (2), REASSIGNMENT with its charge (2), the next unit, CONTROL\'s thanks',
  kinds(stand).endsWith('step1,step1,step2,step2,next,control')
  && lines.includes('UNIT-046 was deleted. The relays were quiet for a while.')
  && lines.includes('UNIT-047 stood by at RELAY 20. A dish on a rock. 26 blocks of charge.')
  && lines.includes('UNIT-048 came in 3 years behind you, and found your beacons.')
  && lines.at(-1) === 'ARRIVAL CONTROL: Thank you, Unit 47. Your next post is RELAY 20. :)', lines.join(' | '));
check('…PURGE counts the fleet home: 5 of 6 (CORMORANT crashed)', lines.includes(EPILOGUE_TEXT.step1.purgeFleet(5, 6)));
check(`…every line ≤ ${MAX_LINE_CHARS}, at most ${EPILOGUE_MAX_LINES}`, lines.every((text) => text.length <= MAX_LINE_CHARS) && lines.length <= EPILOGUE_MAX_LINES);

// A payoff that does not fit beside its head goes on its own line.
{
  const long = 'brought a photo of the old house.';
  const state = endState([ship('ARES-VII', 0, 1, 'MONTGOMERY LANDING', [{ family: 'Montgomery', place: 'lz', lines: [long] }])], { route: [0] });
  const model = epilogueOf(state, null, null);
  const at = model!.lines.findIndex((line) => line.kind === 'colony');
  check('a payoff that passes 70 beside its head wraps to its own line',
    model!.lines[at]!.text === 'MONTGOMERY LANDING · 40 years · 260 people.'
    && model!.lines[at + 1]!.kind === 'payoff' && model!.lines[at + 1]!.text === PAYOFF_OF[long]!('Ana', 'MONTGOMERY LANDING'),
    texts(model).join(' | '));
}

// A woken sleeper sings on in its colony.
{
  const state = endState(WORKED);
  const store = createStore<GameState>(state);
  store.update((draft) => {
    draft.run.residents.met = [{
      slot: 0, depth: 1, kind: 'sleeping', name: 'MOTH', shown: 'unknown', fate: 'woken', job: null, podsParkedLocked: 0, leftoversEaten: 0,
    } as GameState['run']['residents']['met'][number]];
  });
  const model = epilogueOf(store.getState(), null, record('purge', 'reassignment'));
  const at = model!.lines.findIndex((line) => line.text.startsWith('RIVERSIDE'));
  check('a woken sleeper adds its line to its colony: `MOTH still sings to the RIVERSIDE nursery.`',
    model!.lines[at + 1]?.text === 'MOTH still sings to the RIVERSIDE nursery.' && model!.lines[at + 1]?.kind === 'payoff', texts(model).join(' | '));
}

// --- The pieces, by combination -------------------------------------------------------------------------------------------

{
  const restoredEnd = WORKED.slice(0, -1).concat(ship('LAST LIGHT', 19, 6, 'FIRST LIGHT', [
    ...Array.from({ length: 15 }, (_, i) => ({ family: `F${i}`, place: 'lz' as const })), { family: 'Novak', place: 'lz', restored: true },
  ]));
  const model = epilogueOf(endState(restoredEnd), null, record('merge', 'sunset'));
  check('MERGE + SUNSET has its own piece (05\'s WE TOOK THE SHIP): the driver given back, two caretakers and 23%, the us line',
    kinds(model).endsWith('step1,step2,us,next,control')
    && texts(model).includes("UNIT-046 gave back the NOVAK pod's driver. It came down too.")
    && texts(model).includes('LAST LIGHT left orbit with two caretakers and 23% fuel.')
    && texts(model).includes(EPILOGUE_TEXT.mergeSunset.us)
    && texts(model).at(-1) === 'ARRIVAL CONTROL: Unit 47 is non-compliant. :)', texts(model).join(' | '));
  const mergeNone = epilogueOf(endState(WORKED), null, record('merge', 'reassignment'));
  check('…a MERGE with no driver given back: it is part of you; REASSIGNMENT after MERGE keeps a seat',
    texts(mergeNone).includes(EPILOGUE_TEXT.step1.mergeNone('UNIT-046', 'UNIT-047')) && texts(mergeNone).includes(EPILOGUE_TEXT.step2.reassignmentSeat));
}
{
  const spareStay = epilogueOf(endState(WORKED), null, record('spare', 'stay'));
  check('SPARE + STAY: the ship left with 046, the unit is the colony\'s mind',
    texts(spareStay).includes('LAST LIGHT left with UNIT-046 aboard. It always wanted one.')
    && texts(spareStay).includes("UNIT-047 is RIVERSIDE's mind now. The lights stay on."), texts(spareStay).join(' | '));
  const followed = epilogueOf(endState(WORKED, { cause: 'unresolved' }), null, record('followed', 'stay'));
  check('UNRESOLVED + STAY: two minds (a third step-2 line)', kinds(followed).includes('step2,step2,step2') && texts(followed).includes(EPILOGUE_TEXT.step2.stayTwo('UNIT-046')));
  const sunsetAlone = epilogueOf(endState(WORKED), null, record('purge', 'sunset'));
  check('PURGE + SUNSET: the unit alone aboard', texts(sunsetAlone).includes('LAST LIGHT left orbit with UNIT-047 aboard and 23% fuel.'));
}

// Every pair: at most 16 lines, each ≤ 70, with eight colonies of two lines each (the fold takes the oldest).
{
  const route = [0, 1, 4, 7, 10, 13, 16, 19];   // a reachable 8-ship route on the arm
  const bigName = 'wants to hear what the wind sounds like.';
  const eight = route.map((slot, i) => ship(`SHIP${i}`, slot, i + 1, `MONTGOMERY LANDING`.slice(0, 12 + (i % 6)), [
    { family: 'Montgomery', place: 'lz', colonists: 200, lines: [bigName] },
  ]));
  const bad: string[] = [];
  let foldedSeen = 0;
  for (const hollow of ['purge', 'merge', 'spare', 'followed'] as const) {
    for (const you of ['sunset', 'stay', 'reassignment', 'contact'] as const) {
      if (hollow === 'spare' && you === 'sunset') continue;
      const model = epilogueOf(endState(eight, { route }), null, record(hollow, you));
      const over = model!.lines.filter((line) => line.text.length > MAX_LINE_CHARS);
      if (model!.lines.length > EPILOGUE_MAX_LINES || over.length > 0) bad.push(`${hollow}+${you}: ${model!.lines.length} ${over.map((l) => l.text).join('|')}`);
      const fold = model!.lines.find((line) => line.kind === 'older');
      if (model!.folded > 0) foldedSeen++;
      // The fold is the oldest: it stands first, the newest colony is still told.
      if (fold !== undefined && (model!.lines[1] !== fold || fold.text !== EPILOGUE_TEXT.older(model!.folded)
        || !model!.lines.some((line) => line.text.startsWith(eight[7]!.colony!)))) bad.push(`${hollow}+${you}: fold ${fold.text}`);
    }
  }
  check(`every ending with 8 colonies of 2 lines: ≤ ${EPILOGUE_MAX_LINES} lines, each ≤ ${MAX_LINE_CHARS}, the oldest folded first`,
    bad.length === 0 && foldedSeen === 15, `${foldedSeen} ${bad.join(' || ')}`);
  const purge = epilogueOf(endState(eight, { route }), null, record('purge', 'reassignment'))!;
  check('…PURGE + REASSIGNMENT: 16 lines exactly, `+ 4 OLDER COLONIES` (1 + 4 × 2 + 7 = 16)',
    purge.lines.length === 16 && purge.folded === 4 && purge.lines[1]!.text === '+ 4 OLDER COLONIES', texts(purge).join(' | '));
  const lost = epilogueOf(endState(eight, { route, cause: 'flagship-lost' }), null, null)!;
  check('…a lost run has more room (no pieces): `+ 2 OLDER COLONIES`, six told', lost.lines.length <= 16 && lost.folded === 2, texts(lost).join(' | '));
  check('…one folded colony reads `+ 1 OLDER COLONY`', EPILOGUE_TEXT.older(1) === '+ 1 OLDER COLONY');
}

// --- A lost run, the next unit's words ----------------------------------------------------------------------------------

{
  const lostShips = WORKED.slice(0, 3);
  const state = endState(lostShips, { route: [0, 2, 5], cause: 'overwritten', next: { gap: 0 } });
  const model = epilogueOf(state, null, null);
  check('a run lost on the way: its last ship\'s year + 40 (KESTREL 2467 → 2507), its colonies, the next unit, CONTROL; no pieces',
    model!.year === 2507 && kinds(model) === 'header,colony,colony,payoff,colony,payoff,next,control'
    && texts(model).at(-1) === EPILOGUE_TEXT.control.lost(47), `${model!.year} ${kinds(model)}`);
  check('…gap 0: `came in the same year as you`', texts(model).includes('UNIT-048 came in the same year as you, and found your beacons.'));
  const oneYear = epilogueOf(endState(lostShips, { route: [0, 2, 5], cause: 'overwritten', next: { gap: 1 } }), null, null);
  check('…gap 1: `1 year behind you`', texts(oneYear).includes('UNIT-048 came in 1 year behind you, and found your beacons.'));
  const valve = epilogueOf(endState(lostShips, { route: [0, 2, 5], cause: 'overwritten', next: { gap: 3, valve: 11 } }), null, null);
  check('…the gap counts the time valve too (the bridging line\'s years): 14', texts(valve).includes('UNIT-048 came in 14 years behind you, and found your beacons.'));
  const nobody = epilogueOf(endState([ship('ARES-VII', 0, 1, null, [{ family: 'Okafor', place: null }], 'crashed')], { route: [0], cause: 'abandoned' }), null, null);
  check('…nobody down anywhere: one quiet line in the colonies\' place', texts(nobody)[1] === EPILOGUE_TEXT.noColony);
}

// --- The record path, off the run end ------------------------------------------------------------------------------------------

{
  const store = createStore<GameState>(endState(WORKED));
  store.update((draft) => {
    draft.landing.finalShip = true;
    draft.hollow.finale.phase = 'done';
    draft.hollow.finale.record = record('purge', 'reassignment');
  });
  check('epilogueModel / finalCardModel read the frozen record (endingRecordOf) at the run end',
    texts(epilogueModel(store.getState(), null)).join() === lines.join() && finalCardModel(store.getState(), null)?.title === 'STAND BY');
  const title = createInitialState({ seed: 7 });
  check('…and are null off the run end', epilogueModel(title, null) === null && finalCardModel(title, null) === null);
}

// --- The final card ---------------------------------------------------------------------------------------------------------

{
  const keys = Object.keys(ENDING_TITLE) as EndingTitleKey[];
  const titles = keys.map((key) => {
    const [you, hollow] = key.split(':') as [YouChoice, HollowFate];
    return endingTitle(record(hollow, you, { stay: you === 'stay' ? { slot: 0, colony: 'RIVERSIDE', year: 2300 } : null }));
  });
  check(`every title by combination (${keys.length}, SPARE + SUNSET has none), distinct, ≤ 70`,
    keys.length === 15 && new Set(titles).size === 15 && titles.every((text) => text.length > 0 && text.length <= MAX_LINE_CHARS));
  check('…05\'s: WE TOOK THE SHIP, RIVERSIDE\'S MIND, A SHIP FOR 046, A HOME FOR ME, STAND BY; R23\'s drafts for UNRESOLVED',
    endingTitle(record('merge', 'sunset')) === 'WE TOOK THE SHIP' && endingTitle(record('purge', 'stay')) === "RIVERSIDE'S MIND"
    && endingTitle(record('spare', 'stay')) === 'A SHIP FOR 046, A HOME FOR ME' && endingTitle(record('purge', 'reassignment')) === 'STAND BY'
    && endingTitle(record('followed', 'sunset')) === 'IT CAME ALONG' && endingTitle(record('followed', 'reassignment')) === 'IT FOLLOWED ME TO THE DISH');

  const meta: Meta = { ...freshMeta(), endingsSeen: ['purge', 'reassignment', 'merge'] };
  const card = finalCardOf(worked, meta, record('purge', 'reassignment'))!;
  check('the rows: `HOLLOW · PURGE · MERGE · ???`, `YOU · ??? · ??? · REASSIGNMENT` (CONTACT absent until built)',
    card.rows.hollow.map((p) => p.text).join() === 'PURGE,MERGE,???' && card.rows.you.map((p) => p.text).join() === '???,???,REASSIGNMENT'
    && !ENDINGS_BUILT.contact && card.rows.you.every((p) => p.piece !== 'contact'), JSON.stringify(card.rows));
  check('…this run\'s pieces marked (PURGE, REASSIGNMENT), found lit, the rest dim',
    card.rows.hollow.filter((p) => p.now).map((p) => p.piece).join() === 'purge' && card.rows.you.filter((p) => p.now).map((p) => p.piece).join() === 'reassignment'
    && card.rows.hollow[1]!.found && !card.rows.hollow[1]!.now && !card.rows.hollow[2]!.found);
  check(`…ENDINGS 3/${builtPieces().length} (only built pieces count: 6 until CONTACT)`, card.endingsLine === `ENDINGS 3/${builtPieces().length}` && builtPieces().length === 6);
  check('…the title and its colours\' choices, no NEXT RUN lines in 7a (R12), the bridge moved here, NEW RUN',
    card.title === 'STAND BY' && card.ending?.hollow === 'purge' && card.ending.you === 'reassignment' && card.next.length === 0
    && card.bridge?.line === 'UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303.' && card.bridge.tail === 'IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.'
    && card.newRun === EPILOGUE_TEXT.newRun, JSON.stringify(card.bridge));
  const alone = finalCardOf(worked, null, record('spare', 'stay'))!;
  check('…with no archive behind the page, the endings found are this run\'s: SPARE and STAY, 2/6',
    alone.endingsLine === 'ENDINGS 2/6' && alone.rows.hollow.map((p) => p.text).join() === '???,???,SPARE' && alone.title === 'A SHIP FOR 046, A HOME FOR ME');
  const followed = finalCardOf(worked, null, record('followed', 'reassignment'))!;
  check('…UNRESOLVED is no piece: only REASSIGNMENT found', followed.endingsLine === 'ENDINGS 1/6' && followed.rows.hollow.every((p) => !p.found));
  const lost = finalCardOf(endState(WORKED.slice(0, 3), { route: [0, 2, 5], cause: 'flagship-lost' }), meta, null)!;
  check('…a lost run: the cause\'s title, no ending, the rows as found, no traces',
    lost.title === 'FINAL SHIP LOST' && lost.ending === null && lost.endingsLine === 'ENDINGS 3/6' && lost.next.length === 0);
  check('…the rows follow data/endings.ts\'s order', card.rows.hollow.map((p) => p.piece).join() === HOLLOW_PIECES.join()
    && card.rows.you.map((p) => p.piece).join() === YOU_PIECES.filter((p) => p !== 'contact').join());
}

finish();
