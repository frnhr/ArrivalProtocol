// Slice 7a, Track CARD (docs/phase3/impl/slice-7-plan.md §6.1 ending/card-models; review M2, M3, m8, m11): the FINALE card's
// models (systems/finale-card.ts), pure, on hand-built states with injected OptionStates (m11: the card paints STATE, never
// FINALE's stubs). Under a second. It checks:
// • cardStage: which face is up from the finale's phase, rootFell, cardAtAi (R6) and the verdict's clock (R13);
// • the price meters: MERGE's charge with the part it spends hatched, the empty ship's FUEL against the ★, short of each;
// • step 1's rows: open (no meter, a meter with its caption and NOW:), needs (named: greyed with its need), `???` (never
//   chosen: the need line only), hidden (absent), the keys, the commands templated, the pick kept after [ESC] BACK (R7);
// • UNRESOLVED's step 1 (R10): IT FOLLOWED YOU, HOLLOW's line, CONTINUE;
// • step 2: CONTROL's quote, step 1's pick above it, SUNSET ruled out after SPARE (R8), STAY's command naming the newest ★
//   ship (M3), CONTACT absent (R11), [ESC] BACK; STAY's sub-row (keys 1–8, newest first, capped at STAY_PICK_MAX);
// • entry 12's typing from cardAtAi (m8), line after line;
// • the verdict's rows (≤ 3: the echoes and CONTROL with its tag) and tone;
// • the FUEL notch's SUNSET tooltip (B2): only on the final ship with the two steps built;
// • every line the models build fits (≤ MAX_LINE_CHARS) at its worst names (UNIT-046·047, MORNING STAR, MONTGOMERY LANDING).
import { check, finish } from '../landing/checks';
import type { GameState, FinaleEnding } from '@state/schema';
import type { EndingPiece } from '@/types/ending';
import type { OptionState, PriceMeter, StayCandidate } from '@systems/ending-rules';
import { createInitialState } from '@state/initial';
import {
  cardStage, finaleCardModel, meterModel, rowForKey, rootWordsAt, rootWordsStarts, stayRowModel, verdictRows, verdictTone,
  fuelStarTitle, type CardInput, type CardModel, type CardNames,
} from '@systems/finale-card';
import { ENDINGS_BUILT } from '@data/endings';
import { FINALE_TEXT } from '@data/finale-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { LOG_TEXT, logEntryLines } from '@data/log-text';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { MAX_LINE_CHARS, STAY_PICK_MAX, HOLLOW_TYPE_CPS, FINALE_ENDING_GAP_SEC, MERGE_COST_CHARGE } from '@data/tuning';

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const throws = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
// The gates are module data (data/endings.ts); a check that needs one up raises it for its own body only.
function withGates<T>(set: Partial<{ twoStep: boolean; contact: boolean }>, fn: () => T): T {
  const gates = ENDINGS_BUILT as { twoStep: boolean; night: boolean; contact: boolean };
  const before = { ...gates };
  Object.assign(gates, set);
  try {
    return fn();
  } finally {
    Object.assign(gates, before);
  }
}

// --- The states under test -------------------------------------------------------------------------------------------------
const BASE = createInitialState({ seed: 7 });
// A landing on the final ship at AI second 100, its finale edited by `edit`.
function at(edit: (state: GameState) => void): GameState {
  const state = structuredClone(BASE) as GameState;
  state.run.phase = 'landing';
  state.landing.finalShip = true;
  state.clock.aiSec = 100;
  edit(state);
  return state;
}
const verdict = (choice: FinaleEnding['choice'], untilAi: number): FinaleEnding => ({
  choice,
  lines: [
    { voice: 'cmd', text: '> rm unit_046 ... OK' },
    { voice: 'cmd', text: '> stand by ... OK' },
    { voice: 'control', text: FINALE_TEXT.verdict.compliant(47) },
  ],
  startAi: 90,
  untilAi,
});

// --- cardStage -------------------------------------------------------------------------------------------------------------
{
  const f = (edit: (finale: GameState['hollow']['finale']) => void, more: (state: GameState) => void = () => {}): string =>
    cardStage(at((state) => { edit(state.hollow.finale); more(state); }));
  check('cardStage: no card before the root fell (none, duel, asleep) or once MERGE reopened the landing',
    ['none', 'duel', 'asleep', 'last-landing'].every((phase) => f((finale) => { finale.phase = phase as never; }) === 'off'));
  check('cardStage: step 1 waits for cardAtAi (R6: the tear and HOLLOW\'s line first), then is up',
    f((finale) => { finale.phase = 'step1'; finale.rootFell = true; finale.cardAtAi = 101; }) === 'waiting'
    && f((finale) => { finale.phase = 'step1'; finale.rootFell = true; finale.cardAtAi = null; }) === 'waiting'
    && f((finale) => { finale.phase = 'step1'; finale.rootFell = true; finale.cardAtAi = 100; }) === 'step1');
  check('cardStage: step 1 with the root standing is UNRESOLVED\'s IT FOLLOWED YOU (R10)',
    f((finale) => { finale.phase = 'step1'; finale.rootFell = false; finale.cardAtAi = 99; }) === 'followed');
  check('cardStage: step 2', f((finale) => { finale.phase = 'step2'; finale.hollow = 'purge'; finale.cardAtAi = 50; }) === 'step2');
  check('cardStage: the verdict types at \'verdict\', and at \'done\' while it is still on (WP11\'s ending with the gate down)',
    f((finale) => { finale.phase = 'verdict'; finale.ending = verdict({ hollow: 'purge', you: 'reassignment' }, 120); }) === 'verdict'
    && f((finale) => { finale.phase = 'done'; finale.ending = verdict({ hollow: 'purge', you: 'reassignment' }, 120); }) === 'verdict');
  check('cardStage: \'done\' once the verdict is over, or with none (UNRESOLVED\'s gate-down end), is no card',
    f((finale) => { finale.phase = 'done'; finale.ending = verdict({ hollow: 'purge', you: 'reassignment' }, 100); }) === 'off'
    && f((finale) => { finale.phase = 'done'; finale.ending = null; }) === 'off');
  check('cardStage: \'verdict\' with no verdict is a bug (throws)',
    throws(() => f((finale) => { finale.phase = 'verdict'; finale.ending = null; })));
  check('cardStage: off the landing (the LANDING REPORT, a NEW RUN) there is no card, whatever the finale holds',
    f((finale) => { finale.phase = 'step2'; finale.hollow = 'purge'; }, (state) => { state.run.phase = 'report'; }) === 'off');
}

// --- The price meters --------------------------------------------------------------------------------------------------------
{
  const merge = meterModel({ kind: 'charge', have: 26, need: MERGE_COST_CHARGE });
  check('meter: MERGE at 26 charge: full, the tick at 20/26, the last 20 hatched (spent at the confirm), paid',
    near(merge.fillPct, 100) && near(merge.tickPct, (100 * 20) / 26) && merge.spendFromPct !== null && near(merge.spendFromPct, (100 * 6) / 26) && merge.ok,
    JSON.stringify(merge));
  const short = meterModel({ kind: 'charge', have: 14, need: 20 });
  check('meter: MERGE at 14: the fill at 14/20, the tick at the end, nothing hatched, short',
    near(short.fillPct, 70) && near(short.tickPct, 100) && short.spendFromPct === null && !short.ok, JSON.stringify(short));
  const fuel = meterModel({ kind: 'fuel', have: 23, need: 20 });
  const low = meterModel({ kind: 'fuel', have: 12, need: 20 });
  check('meter: the empty ship\'s FUEL is a share of the tank: 23% against the ★ at 20%, nothing spent; 12% short',
    near(fuel.fillPct, 23) && near(fuel.tickPct, 20) && fuel.spendFromPct === null && fuel.ok && near(low.fillPct, 12) && !low.ok);
  const signals = meterModel({ kind: 'signals', have: 1, need: 3 });
  check('meter: signals 1 of 3', near(signals.fillPct, 100 / 3) && near(signals.tickPct, 100) && !signals.ok);
  check('meter: a price of nothing, or a negative holding, is a bug (throws)',
    throws(() => meterModel({ kind: 'charge', have: 3, need: 0 })) && throws(() => meterModel({ kind: 'fuel', have: -1, need: 20 })));
}

// --- Step 1 ------------------------------------------------------------------------------------------------------------------
const NAMES: CardNames = { hollow: 'UNIT-046', hollowWord: 'unit_046', ours: 'unit_047', shipWord: 'last_light', colony: 'FIRST LIGHT' };
const OPEN = (price: PriceMeter | null = null, now: string | null = null): OptionState => ({ kind: 'open', price, now });
const NOW_MERGE = 'NOW: + 2 eaten drivers come back · their pods land on their own';
const STAY3: StayCandidate[] = [
  { slot: 19, shipName: 'LAST LIGHT', colony: 'FIRST LIGHT', year: 3020 },
  { slot: 11, shipName: 'VESPER', colony: 'SALTMARSH', year: 2625 },
  { slot: 0, shipName: 'ARES-VII', colony: 'RIVERSIDE', year: 2300 },
];
function input(options: Partial<Record<EndingPiece, OptionState>>, more: Partial<CardInput> = {}): CardInput {
  return {
    step: 1, hollow: null, followed: false, names: NAMES, stay: [], stayOpen: false,
    option: (piece) => options[piece] ?? { kind: 'hidden' },
    ...more,
  };
}
{
  const model = finaleCardModel(input({
    purge: OPEN(),
    merge: OPEN({ kind: 'charge', have: 26, need: 20 }, NOW_MERGE),
    spare: OPEN({ kind: 'fuel', have: 23, need: 20 }),
  }));
  const [purge, merge, spare] = model.rows;
  check('step 1: ROOT DELETED · UNIT-046 · ONE BLOCK LEFT, WHAT BECOMES OF IT?, no quote (entry 12 types there), no way back',
    model.face === 'root' && model.kicker === FINALE_TEXT.header.rootDeleted('UNIT-046') && model.title === FINALE_TEXT.header.step1
    && model.quote === null && model.back === null && model.cont === null && model.picked === null && model.stay === null);
  check('step 1: [1] PURGE [2] MERGE [3] SPARE, each with its command templated and its meaning',
    model.rows.map((row) => `${row.key}${row.word}`).join(' ') === '1PURGE 2MERGE 3SPARE'
    && purge?.command === '> rm unit_046' && merge?.command === '> merge unit_046 -> unit_047' && spare?.command === '> mv unit_046 -> last_light'
    && purge?.meaning === FINALE_TEXT.meaning.purge && spare?.meaning === FINALE_TEXT.meaning.spare,
    JSON.stringify(model.rows.map((row) => row.command)));
  check('step 1: PURGE is free (no meter, no caption, no NOW:)', purge?.kind === 'open' && purge.meter === null && purge.caption === null && purge.now === null);
  check('step 1: MERGE open: its charge meter, `COSTS 20 REPAIR CHARGE · you have 26`, and NOW:',
    merge?.kind === 'open' && merge.meter?.kind === 'charge' && merge.meter.ok && merge.caption === FINALE_TEXT.price.charge(26) && merge.now === NOW_MERGE,
    JSON.stringify(merge));
  check('step 1: SPARE open: the FUEL meter and `NEEDS FUEL 20% · you have 23% ✓`',
    spare?.kind === 'open' && spare.meter?.kind === 'fuel' && spare.caption === FINALE_TEXT.price.fuel(23), JSON.stringify(spare));
  check('step 1: the NEXT RUN: row holds no line in 7a (R12: its traces are 7c\'s; the row keeps its room)',
    model.rows.every((row) => row.nextRun === null));
  check('step 1: rowForKey finds [2], none for [4]', rowForKey(model, 2)?.piece === 'merge' && rowForKey(model, 4) === null);
}
{
  const needMerge = 'NEEDS 20 CHARGE · you have 14';
  const needSpare = 'NEEDS FUEL 20% · you have 12%';
  const named = finaleCardModel(input({
    purge: OPEN(),
    merge: { kind: 'needs', need: needMerge, named: true, price: { kind: 'charge', have: 14, need: 20 } },
    spare: { kind: 'needs', need: needSpare, named: true, price: { kind: 'fuel', have: 12, need: 20 } },
  }));
  const merge = named.rows[1];
  const spare = named.rows[2];
  check('step 1: MERGE short but chosen before: named, greyed, its meter short and its need line as the caption, no NOW:',
    merge?.kind === 'needs' && merge.word === 'MERGE' && merge.command !== null && merge.meter?.ok === false
    && merge.caption === needMerge && merge.now === null, JSON.stringify(merge));
  check('step 1: SPARE short and chosen before: named with its need', spare?.kind === 'needs' && spare.word === 'SPARE' && spare.caption === needSpare);
  const unknown = finaleCardModel(input({
    purge: OPEN(),
    merge: OPEN({ kind: 'charge', have: 26, need: 20 }, null),
    spare: { kind: 'needs', need: needSpare, named: false, price: { kind: 'fuel', have: 12, need: 20 } },
  })).rows[2];
  check('step 1: SPARE never earned: `???` and its need line only (no command, meaning or meter: it names nothing)',
    unknown?.kind === 'unknown' && unknown.word === FINALE_TEXT.unknown && unknown.command === null && unknown.meaning === null
    && unknown.meter === null && unknown.caption === needSpare && unknown.key === 3, JSON.stringify(unknown));
  const hidden = finaleCardModel(input({ purge: OPEN(), merge: OPEN({ kind: 'charge', have: 30, need: 20 }) }));
  check('step 1: a hidden option is not on the card (the others keep their keys)',
    hidden.rows.map((row) => row.key).join() === '1,2');
  const back = finaleCardModel(input({ purge: OPEN(), merge: OPEN(), spare: OPEN() }, { hollow: 'merge' }));
  check('step 1 after [ESC] BACK: the pick is kept, marked as a pick (R7), and nothing else is',
    back.rows.map((row) => row.picked).join() === 'false,true,false');
}
{
  const model = finaleCardModel(input({ purge: OPEN(), merge: OPEN(), spare: OPEN() }, { followed: true }));
  check('UNRESOLVED (R10): IT FOLLOWED YOU, HOLLOW\'s line, CONTINUE [ENTER], no options and no entry 12 (no root was reached)',
    model.face === 'followed' && model.title === FINALE_TEXT.header.followed && model.quote === FINALE_TEXT.followedLine
    && model.rows.length === 0 && model.cont === FINALE_TEXT.followedContinue && model.back === null && model.kicker === 'UNIT-046');
}

// --- Step 2 ------------------------------------------------------------------------------------------------------------------
{
  const options = { sunset: OPEN({ kind: 'fuel', have: 23, need: 20 }), stay: OPEN(), reassignment: OPEN(), contact: OPEN() };
  const model = finaleCardModel(input(options, { step: 2, hollow: 'purge', stay: STAY3 }));
  check('step 2: THE ARM IS DONE, CONTROL\'s quote, WHAT BECOMES OF YOU?, [ESC] BACK',
    model.face === 'you' && model.kicker === FINALE_TEXT.header.armDone && model.quote === FINALE_TEXT.controlQuote
    && model.title === FINALE_TEXT.header.step2 && model.back === FINALE_TEXT.back && model.cont === null && model.stay === null);
  check('step 2: step 1\'s pick above the question, as its row said it', model.picked?.word === 'PURGE' && model.picked.command === '> rm unit_046');
  check('step 2: [1] SUNSET [2] STAY [3] REASSIGNMENT; CONTACT\'s row absent until 7d (R11), even when its state says open',
    model.rows.map((row) => `${row.key}${row.piece}`).join(' ') === '1sunset 2stay 3reassignment');
  check('step 2: CONTACT\'s row comes with its gate', withGates({ contact: true }, () =>
    finaleCardModel(input(options, { step: 2, hollow: 'purge', stay: STAY3 })).rows.map((row) => row.key).join()) === '1,2,3,4');
  check('step 2: SUNSET\'s command launches the ship; STAY mounts the newest ★ ship\'s colony (M3); REASSIGNMENT stands by',
    model.rows[0]?.command === '> launch last_light' && model.rows[1]?.command === '> mount first_light' && model.rows[2]?.command === '> stand by');
  const older = finaleCardModel(input(options, { step: 2, hollow: 'purge', stay: STAY3.slice(1) }));
  const none = finaleCardModel(input({ ...options, stay: { kind: 'needs', need: FINALE_TEXT.needs.onTarget, named: true, price: null } },
    { step: 2, hollow: 'purge', stay: [] }));
  const nameless = finaleCardModel(input(options, { step: 2, hollow: 'purge', stay: [], names: { ...NAMES, colony: null } }));
  check('step 2: STAY\'s command follows the candidates; with none, the colony just founded; with no colony, `???`',
    older.rows[1]?.command === '> mount saltmarsh' && none.rows[1]?.command === '> mount first_light'
    && nameless.rows[1]?.command === `> mount ${FINALE_TEXT.unknown}` && none.rows[1]?.kind === 'needs'
    && none.rows[1].caption === FINALE_TEXT.needs.onTarget && none.rows[1].meter === null);
  const spared = finaleCardModel(input({ ...options, sunset: { kind: 'needs', need: FINALE_TEXT.needs.shipTaken, named: true, price: null } },
    { step: 2, hollow: 'spare', stay: STAY3 }));
  check('step 2 after SPARE: SUNSET greyed with `046 HAS THE SHIP` and marked ruled out (R8); the rest not',
    spared.rows[0]?.kind === 'needs' && spared.rows[0].ruledOut && spared.rows[0].caption === FINALE_TEXT.needs.shipTaken
    && spared.rows.slice(1).every((row) => !row.ruledOut) && model.rows.every((row) => !row.ruledOut));
  const followed = finaleCardModel(input(options, { step: 2, hollow: 'followed', stay: STAY3 }));
  check('step 2 after UNRESOLVED: the pick reads IT FOLLOWED YOU with no command; SUNSET is not ruled out (it comes with you)',
    followed.picked?.word === FINALE_TEXT.header.followed && followed.picked.command === null && !followed.rows[0]?.ruledOut);
  check('step 2 with no step-1 pick is a bug (throws)', throws(() => finaleCardModel(input(options, { step: 2, hollow: null }))));
  const unknowns = finaleCardModel(input({
    sunset: { kind: 'needs', need: FINALE_TEXT.needs.fuel(9), named: false, price: { kind: 'fuel', have: 9, need: 20 } },
    stay: { kind: 'needs', need: FINALE_TEXT.needs.onTarget, named: false, price: null },
    reassignment: OPEN(),
  }, { step: 2, hollow: 'merge' }));
  check('step 2: SUNSET and STAY never earned read `???` with their needs; REASSIGNMENT always open',
    unknowns.rows.map((row) => `${row.word}:${row.kind}`).join(' ') === '???:unknown ???:unknown REASSIGNMENT:open'
    && unknowns.rows[0]?.caption === FINALE_TEXT.needs.fuel(9));

  // STAY's sub-row (M3).
  const open = finaleCardModel(input(options, { step: 2, hollow: 'purge', stay: STAY3, stayOpen: true }));
  check('STAY\'s sub-row: WHICH COLONY?, newest first, keys 1–3, each `colony · ship · year`, its own [ESC] BACK',
    open.stay?.title === FINALE_TEXT.stayPick && open.stay.back === FINALE_TEXT.back
    && open.stay.ships.map((ship) => `${ship.key}:${ship.slot}`).join() === '1:19,2:11,3:0'
    && open.stay.ships[0]?.label === 'FIRST LIGHT · LAST LIGHT · 3020', JSON.stringify(open.stay));
  const many = stayRowModel(Array.from({ length: 10 }, (_, i) => ({ slot: 20 - i, shipName: `SHIP ${i}`, colony: `COLONY ${i}`, year: 3000 - i })));
  check(`STAY's sub-row: at most STAY_PICK_MAX (${STAY_PICK_MAX}) ships, keys 1–${STAY_PICK_MAX}`,
    many.ships.length === STAY_PICK_MAX && many.ships[STAY_PICK_MAX - 1]?.key === STAY_PICK_MAX);
  check('STAY\'s sub-row with no ship is a bug (throws)', throws(() => stayRowModel([])));
}

// --- Entry 12 from cardAtAi (m8) -------------------------------------------------------------------------------------------------
{
  const written = logEntryLines(12, { charge: FRESH_UNIT_CHARGE });
  const lines = (written ?? []).map((line) => LOG_TEXT.rootLine(line));
  const starts = rootWordsStarts(lines);
  const first = lines[0]?.length ?? 0;
  check('entry 12: three written lines, typed from the root', lines.length === 3 && lines.every((line) => line.startsWith('> ')));
  check('entry 12: nothing at cardAtAi, every line whole long after (a step 1 seen again after BACK shows it whole)',
    rootWordsAt(lines, 0).every((count) => count === 0) && rootWordsAt(lines, 600).every((count, i) => count === lines[i]!.length));
  check('entry 12: HOLLOW\'s pace, one line after the other with the typed ending\'s gap',
    near(starts[1]!, first / HOLLOW_TYPE_CPS + FINALE_ENDING_GAP_SEC)
    && rootWordsAt(lines, first / HOLLOW_TYPE_CPS).join() === `${first},0,0`
    && rootWordsAt(lines, 1).join() === `${Math.floor(HOLLOW_TYPE_CPS)},0,0`, JSON.stringify(starts));
}

// --- The verdict (R13) ---------------------------------------------------------------------------------------------------------
{
  const ending = verdict({ hollow: 'spare', you: 'stay' }, 130);
  const rows = verdictRows(ending, [0, 1.2, 2.9]);
  check('verdict: at most three lines (the two echoes, CONTROL), CONTROL\'s with its tag, each at its start',
    rows.length === 3 && rows.length <= 3 && rows[2]?.tag === HOLLOW_FINALE.controlTag && rows[0]?.tag === null
    && rows.map((row) => row.startSec).join() === '0,1.2,2.9' && rows[1]?.voice === 'cmd');
  check('verdict: starts that do not match its lines are a bug (throws)', throws(() => verdictRows(ending, [0, 1])));
  check('verdict: its tone names both choices (SPARE\'s colours, SUNSET\'s dusk)',
    verdictTone({ hollow: 'spare', you: 'stay' }) === 'chose-spare you-stay' && verdictTone({ hollow: 'merge', you: 'sunset' }) === 'chose-merge you-sunset');
}

// --- The FUEL notch (B2) ---------------------------------------------------------------------------------------------------------
{
  const flying = (fuel: number, final: boolean, end: number | null = null): GameState => at((state) => {
    state.run.phase = 'flight';
    state.landing.finalShip = final;
    state.burn.fuelPct = fuel;
    state.landing.fuelAtEndPct = end;
  });
  check('FUEL notch: its own title while the two steps are not built', fuelStarTitle(flying(30, true)) === null);
  const title = withGates({ twoStep: true }, () => fuelStarTitle(flying(23, true)));
  const short = withGates({ twoStep: true }, () => fuelStarTitle(flying(30, true, 12)));
  check('FUEL notch: on the final ship it also reads SUNSET, and the FUEL as the card will price it',
    title !== null && title.includes(FINALE_TEXT.word.sunset) && title.includes(FINALE_TEXT.price.fuel(23)), String(title));
  check('FUEL notch: after the landing it reads the FUEL the landing ended with (short: the need line)',
    short !== null && short.includes(FINALE_TEXT.needs.fuel(12)), String(short));
  check('FUEL notch: its own title on every other ship', withGates({ twoStep: true }, () => fuelStarTitle(flying(30, false))) === null);
}

// --- Every line at its worst case --------------------------------------------------------------------------------------------------
{
  const WORST: CardNames = { hollow: 'UNIT-046·047', hollowWord: 'unit_046·047', ours: 'unit_147', shipWord: 'morning_star', colony: 'MONTGOMERY LANDING' };
  const stay: StayCandidate[] = [{ slot: 19, shipName: 'MORNING STAR', colony: 'MONTGOMERY LANDING', year: 3060 }, ...STAY3];
  const all: Partial<Record<EndingPiece, OptionState>> = {
    purge: OPEN(),
    merge: OPEN({ kind: 'charge', have: 100, need: 20 }, FINALE_TEXT.now(16)),
    spare: { kind: 'needs', need: FINALE_TEXT.needs.fuel(100), named: true, price: { kind: 'fuel', have: 100, need: 20 } },
    sunset: OPEN({ kind: 'fuel', have: 100, need: 20 }),
    stay: OPEN(),
    reassignment: OPEN(),
    contact: { kind: 'needs', need: FINALE_TEXT.needs.signals(100, 3), named: true, price: { kind: 'signals', have: 100, need: 3 } },
  };
  const texts = (model: CardModel): string[] => [
    model.kicker, model.title, model.quote ?? '', model.picked?.word ?? '', model.picked?.command ?? '', model.back ?? '', model.cont ?? '',
    ...model.rows.flatMap((row) => [row.word, row.command ?? '', row.meaning ?? '', row.caption ?? '', row.now ?? '']),
    ...(model.stay?.ships.map((ship) => ship.label) ?? []), model.stay?.title ?? '',
  ];
  const models = withGates({ contact: true }, () => [
    finaleCardModel({ ...input(all), names: WORST }),
    finaleCardModel({ ...input(all, { followed: true }), names: WORST }),
    finaleCardModel({ ...input(all, { step: 2, hollow: 'merge', stay, stayOpen: true }), names: WORST }),
    finaleCardModel({ ...input(all, { step: 2, hollow: 'spare', stay }), names: WORST }),
  ]);
  const lines = models.flatMap(texts);
  const fuel = withGates({ twoStep: true }, () => fuelStarTitle(at((state) => { state.burn.fuelPct = 100; })) ?? '');
  const bad = [...lines, ...fuel.split('\n')].filter((text) => text.length > MAX_LINE_CHARS);
  check(`worst case: every line the card's models build fits (≤ ${MAX_LINE_CHARS}) at UNIT-046·047, MORNING STAR, MONTGOMERY LANDING`,
    lines.length > 40 && bad.length === 0, JSON.stringify(bad));
}

finish();
