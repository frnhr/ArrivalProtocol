// Slice 7a: Track CARD owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10; review B2, M2, M3, m8,
// m11): the FINALE card's models, pure (no store, no DOM, no module state), and its hooks into screens CARD does not own.
// components/run/FinaleChoice.ts paints what these return; tests/unit/ending/card-models.test.ts runs them on hand-built
// states with injected OptionStates (m11: the card paints STATE, it never re-derives FINALE's rules).
// • cardStage: which face of the card is up (or none), from the finale's phase, rootFell, cardAtAi and the verdict's clock.
// • finaleCardModel: one step's face: its header, CONTROL's quote or HOLLOW's line, the rows (open with their price meter
//   and NOW:, needs with what they need, `???` for an option never earned, absent when hidden), the reserved NEXT RUN: row
//   (R12), step 1's kept pick (R7), [ESC] BACK, and STAY's sub-row (M3).
// • rootWordsAt: entry 12's typing on the card, on the AI clock from cardAtAi (m8; the TERMINAL says it as 'step1' begins).
// • verdictRows: the verdict's (R13) or WP11's typed ending's lines, their voice and when each starts.
// • fuelStarTitle: the FUEL bar's ★ notch's tooltip on the final ship (05 §3.7: the notch at 20% also reads SUNSET; the
//   notch's place is STAR_FUEL_PCT, which EMPTY_SHIP_FUEL_PCT equals), or null for the notch's own title
//   (components/tools-view/EngineWindow.ts reads it on every paint).
// Every word is FINALE's (data/finale-text.ts); this file only lays them out.
import type { GameState, FinaleEnding, EndingVoice } from '@state/schema';
import type { EndingPiece, HollowFate, YouChoice } from '@/types/ending';
import type { OptionState, PriceMeter, StayCandidate } from '@systems/ending-rules';
import { shownFuelPct } from '@systems/flight-hud';
import { STEP1_OPTIONS, step2Options, pieceBuilt, type EndingOption } from '@data/endings';
import { FINALE_TEXT } from '@data/finale-text';
import { echoWord } from '@data/tool-text';
import { STAY_PICK_MAX, HOLLOW_TYPE_CPS, FINALE_ENDING_GAP_SEC } from '@data/tuning';

// --- Which face is up ------------------------------------------------------------------------------------------------

// off: no card (before the root fell, the duel, the asleep landing, the reopened landing after MERGE, any other run phase);
// waiting: the finale is at step 1 but its card comes up at cardAtAi (R6: the tear and HOLLOW's line are seen first);
// step1 / followed / step2: a step's choice (followed: UNRESOLVED's step 1, R10); verdict: the typed verdict (R13).
export type CardStage = 'off' | 'waiting' | 'step1' | 'followed' | 'step2' | 'verdict';

export function cardStage(state: Readonly<GameState>): CardStage {
  if (state.run.phase !== 'landing') return 'off';
  const finale = state.hollow.finale;
  switch (finale.phase) {
    case 'step1':
      if (finale.cardAtAi === null || state.clock.aiSec < finale.cardAtAi) return 'waiting';
      return finale.rootFell ? 'step1' : 'followed';
    case 'step2':
      return 'step2';
    case 'verdict':
      if (finale.ending === null) throw new Error("cardStage: the finale is at 'verdict' with no verdict");
      return 'verdict';
    case 'done':
      return finale.ending !== null && state.clock.aiSec < finale.ending.untilAi ? 'verdict' : 'off';
    default:
      return 'off';
  }
}

// --- One step's face ---------------------------------------------------------------------------------------------------

// A price meter as the card draws it (review M2's PriceMeter): the fill is what the kid has, the tick the price, both in %
// of the meter's scale; `spendFromPct` is where along the fill the part the confirm spends begins (MERGE's last 20 charge,
// hatched), null when nothing is spent.
export interface MeterModel {
  kind: PriceMeter['kind'];
  fillPct: number;
  tickPct: number;
  spendFromPct: number | null;
  ok: boolean;
}

// One option row (R11):
// • open: its word, command and meaning, its meter with the price caption, and NOW:;
// • needs: the same, greyed, its caption the need line (`NEEDS FUEL 20% · you have 12%`);
// • unknown: an option out of reach and never chosen before: `???` and its need line, nothing else.
// `nextRun` is the NEXT RUN: row's line (R12: none until 7c builds the traces; the row keeps its room). `picked`: step 1's
// pick kept after [ESC] BACK (R7). `ruledOut`: SPARE gave the ship away (`046 HAS THE SHIP` on SUNSET, R8).
export interface CardRow {
  key: number;
  piece: EndingPiece;
  kind: 'open' | 'needs' | 'unknown';
  word: string;
  command: string | null;
  meaning: string | null;
  meter: MeterModel | null;
  caption: string | null;
  now: string | null;
  nextRun: string | null;
  picked: boolean;
  ruledOut: boolean;
}

// STAY's sub-row (R9; review M3): every ★ ON TARGET ship, newest first, keys 1–STAY_PICK_MAX.
export interface StayRowModel {
  title: string;
  ships: { key: number; slot: number; colony: string; label: string }[];
  back: string;
}

export interface CardModel {
  step: 1 | 2;
  // root: step 1 after the root fell; followed: UNRESOLVED's step 1; you: step 2.
  face: 'root' | 'followed' | 'you';
  kicker: string;
  title: string;
  // Step 2's CONTROL quote; UNRESOLVED's HOLLOW line (typed in its pink); null on step 1 (entry 12 types there).
  quote: string | null;
  // Step 2: what step 1 picked, as its row said it (word and command), above the question.
  picked: { word: string; command: string | null } | null;
  rows: CardRow[];
  // UNRESOLVED's way on; step 2's way back.
  cont: string | null;
  back: string | null;
  stay: StayRowModel | null;
}

// The names the commands template (05 §3.7: run 1's are unit_046, unit_047, last_light, riverside).
export interface CardNames {
  hollow: string;       // HOLLOW's label, `UNIT-046` (the header)
  hollowWord: string;   // `unit_046`
  ours: string;         // `unit_047`
  shipWord: string;     // `last_light`
  colony: string | null;// the final colony (STAY's command when no ship qualifies yet), null before the first touchdown
}

export interface CardInput {
  step: 1 | 2;
  // Step 1's pick (kept through [ESC] BACK, R7); 'followed' on UNRESOLVED.
  hollow: HollowFate | null;
  // UNRESOLVED (R10): step 1 is IT FOLLOWED YOU.
  followed: boolean;
  names: CardNames;
  // Each piece's state on the card (systems/ending-rules.ts optionState with the archive's endingsSeen), injected.
  option: (piece: EndingPiece) => OptionState;
  // STAY's ships (ending-rules.ts stayCandidates), newest first.
  stay: readonly StayCandidate[];
  // The sub-row is open (CARD-local, unsaved: M3).
  stayOpen: boolean;
}

export function meterModel(price: Readonly<PriceMeter>): MeterModel {
  if (price.need <= 0 || price.have < 0) throw new Error(`meterModel: a ${price.kind} meter of ${price.have} against ${price.need}`);
  const ok = price.have >= price.need;
  // FUEL is a share of the tank (0–100%), the rest counts against the larger of what is held and what is asked.
  const scale = price.kind === 'fuel' ? 100 : Math.max(price.have, price.need);
  const clamp = (pct: number): number => Math.max(0, Math.min(100, pct));
  // Only MERGE's charge is spent at the confirm (05 §3.7: kept through the duel, then spent); the empty ship's FUEL is
  // the ship's, and signals are held, not paid.
  const spendFromPct = price.kind === 'charge' && ok && price.have > 0 ? clamp((100 * (price.have - price.need)) / price.have) : null;
  return { kind: price.kind, fillPct: clamp((100 * price.have) / scale), tickPct: clamp((100 * price.need) / scale), spendFromPct, ok };
}

// The meter's caption on an open option (the need line is the caption of one out of reach).
function priceCaption(price: Readonly<PriceMeter>): string {
  switch (price.kind) {
    case 'charge': return FINALE_TEXT.price.charge(price.have);
    case 'fuel': return FINALE_TEXT.price.fuel(price.have);
    case 'signals': return FINALE_TEXT.needs.signals(price.have, price.need);
    default: throw new Error(`priceCaption: unknown meter '${String((price as PriceMeter).kind)}'`);
  }
}

function commandOf(piece: EndingPiece, names: Readonly<CardNames>, stay: readonly StayCandidate[]): string {
  const command = FINALE_TEXT.command;
  switch (piece) {
    case 'purge': return command.purge(names.hollowWord);
    case 'merge': return command.merge(names.hollowWord, names.ours);
    case 'spare': return command.spare(names.hollowWord, names.shipWord);
    case 'sunset': return command.sunset(names.shipWord);
    // Review M3: the row names the newest candidate; with none yet, the colony just founded (it is the likeliest).
    case 'stay': {
      const colony = stay[0]?.colony ?? names.colony;
      return command.stay(colony === null ? FINALE_TEXT.unknown : echoWord(colony));
    }
    case 'reassignment': return command.reassignment;
    case 'contact': return command.contact;
    default: throw new Error(`commandOf: unknown piece '${String(piece)}'`);
  }
}

function rowOf(option: Readonly<EndingOption<EndingPiece>>, input: Readonly<CardInput>): CardRow | null {
  const piece = option.piece;
  const state = input.option(piece);
  if (state.kind === 'hidden') return null;
  const picked = input.step === 1 && input.hollow === piece;
  const ruledOut = input.step === 2 && STEP1_OPTIONS.some((first) => first.piece === input.hollow && first.rulesOut === piece);
  if (state.kind === 'needs' && !state.named) {
    return {
      key: option.key, piece, kind: 'unknown', word: FINALE_TEXT.unknown, command: null, meaning: null, meter: null,
      caption: state.need, now: null, nextRun: null, picked, ruledOut,
    };
  }
  const base = {
    key: option.key, piece, word: FINALE_TEXT.word[piece], command: commandOf(piece, input.names, input.stay),
    meaning: FINALE_TEXT.meaning[piece], meter: state.price === null ? null : meterModel(state.price), nextRun: null, picked, ruledOut,
  };
  if (state.kind === 'open') return { ...base, kind: 'open', caption: state.price === null ? null : priceCaption(state.price), now: state.now };
  return { ...base, kind: 'needs', caption: state.need, now: null };
}

export function stayRowModel(stay: readonly StayCandidate[]): StayRowModel {
  if (stay.length === 0) throw new Error('stayRowModel: STAY\'s sub-row with no ship');
  return {
    title: FINALE_TEXT.stayPick,
    ships: stay.slice(0, STAY_PICK_MAX).map((ship, i) => ({
      key: i + 1, slot: ship.slot, colony: ship.colony, label: `${ship.colony} · ${ship.shipName} · ${ship.year}`,
    })),
    back: FINALE_TEXT.back,
  };
}

export function finaleCardModel(input: Readonly<CardInput>): CardModel {
  const header = FINALE_TEXT.header;
  if (input.step === 1) {
    if (input.followed) {
      return {
        step: 1, face: 'followed', kicker: input.names.hollow, title: header.followed, quote: FINALE_TEXT.followedLine,
        picked: null, rows: [], cont: FINALE_TEXT.followedContinue, back: null, stay: null,
      };
    }
    return {
      step: 1, face: 'root', kicker: header.rootDeleted(input.names.hollow), title: header.step1, quote: null, picked: null,
      rows: STEP1_OPTIONS.map((option) => rowOf(option, input)).filter((row): row is CardRow => row !== null),
      cont: null, back: null, stay: null,
    };
  }
  if (input.hollow === null) throw new Error('finaleCardModel: step 2 with no step-1 pick');
  const first = input.hollow === 'followed' ? null : STEP1_OPTIONS.find((option) => option.piece === input.hollow);
  const picked = input.hollow === 'followed'
    ? { word: header.followed, command: null }
    : { word: FINALE_TEXT.word[input.hollow], command: first === undefined || first === null ? null : commandOf(first.piece, input.names, input.stay) };
  return {
    step: 2, face: 'you', kicker: header.armDone, title: header.step2, quote: FINALE_TEXT.controlQuote, picked,
    rows: step2Options().map((option) => rowOf(option, input)).filter((row): row is CardRow => row !== null),
    cont: null, back: FINALE_TEXT.back, stay: input.stayOpen ? stayRowModel(input.stay) : null,
  };
}

// The step a row's key picks (1–4), or null: no such row, or it is not on the card.
export function rowForKey(model: Readonly<CardModel>, key: number): CardRow | null {
  return model.rows.find((row) => row.key === key) ?? null;
}

// --- Entry 12 on the card (m8) -------------------------------------------------------------------------------------------

// Entry 12 types from the root on step 1, in HOLLOW's slow voice, one line after the other with the typed ending's gap,
// from the card's own second (cardAtAi: entry 12 is found as 'step1' begins, FINALE_OPEN_DELAY_SEC before the card is up;
// m8). AI time, so pause holds it, and a step 1 seen again after [ESC] BACK shows it whole. `elapsedSec` is the AI seconds
// since cardAtAi; the counts are the letters of each line on screen.
export function rootWordsStarts(lines: readonly string[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length / HOLLOW_TYPE_CPS + FINALE_ENDING_GAP_SEC;
  }
  return starts;
}

export function rootWordsAt(lines: readonly string[], elapsedSec: number): number[] {
  const starts = rootWordsStarts(lines);
  return lines.map((line, i) => {
    const start = starts[i]!;
    if (elapsedSec <= start) return 0;
    return Math.min(line.length, Math.floor((elapsedSec - start) * HOLLOW_TYPE_CPS));
  });
}

// --- The verdict (R13) -----------------------------------------------------------------------------------------------------

// One line of the verdict on the card: its voice (the echoes in the command's colour, CONTROL with its tag after its chime),
// its tag (CONTROL's), its text, and when it starts on the verdict's clock (systems/finale.ts finaleEndingLineStartsSec,
// injected: the same schedule the LANDING REPORT waits for).
export interface VerdictRow {
  voice: EndingVoice;
  tag: string | null;
  text: string;
  startSec: number;
}

export function verdictRows(ending: Readonly<FinaleEnding>, starts: readonly number[]): VerdictRow[] {
  if (starts.length !== ending.lines.length) throw new Error(`verdictRows: ${ending.lines.length} lines with ${starts.length} starts`);
  return ending.lines.map((line, i) => ({
    voice: line.voice, tag: line.voice === 'control' ? FINALE_TEXT.verdictTag : null, text: line.text, startSec: starts[i]!,
  }));
}

// The verdict card's colour: step 1's fate, and SUNSET's dusk when step 2 took the ship.
export function verdictTone(choice: Readonly<{ hollow: HollowFate; you: YouChoice }>): string {
  return `chose-${choice.hollow} you-${choice.you}`;
}

// --- The FUEL notch (review B2) ----------------------------------------------------------------------------------------------

// On the final ship, with SUNSET on the card, the ★ notch also says it is SUNSET's: FINALE_TEXT.fuelStar (review m4), with
// the FUEL as the card will price it. Null elsewhere: the notch's own title.
export function fuelStarTitle(state: Readonly<GameState>): string | null {
  if (!state.landing.finalShip || !pieceBuilt('sunset')) return null;
  return FINALE_TEXT.fuelStar(shownFuelPct(state.landing.fuelAtEndPct ?? state.burn.fuelPct));
}
