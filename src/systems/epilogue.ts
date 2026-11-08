// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §4.1, §5.1; R19–R23): the
// night after the run, pure. epilogueModel is the typed EPILOGUE (`3060 · FORTY YEARS ON`, a line per colony with its age,
// people and payoff, the two ending pieces, the next unit, CONTROL's last line); finalCardModel the FINAL CARD (the ending's
// title, the endings found in two rows, the `NEXT RUN:` lines, the bridging line above NEW RUN). Both read the run while
// run.phase is 'end' (the final ship's slices are still the world's then; systems/ending-rules.ts endingRecordOf for the
// ending; run.lastUnit is the PREVIOUS unit, never this one's) and the archive (`meta.endingsSeen` already holds this run's
// pieces: endRun records before the tally opens). The model types are NIGHT's to widen.
// The FOUNDATION's stubs are neutral: no epilogue (the screen skips to the final card), no final card (it starts the next
// run at once). Both are reached only with ENDINGS_BUILT.night raised.
import type { GameState } from '@state/schema';
import type { Meta } from '@systems/meta';
import type { EndingPiece } from '@/types/ending';

// One typed line of the epilogue, by what it is (the screen styles them): the header, a colony (its head, and the payoff
// that wraps to its own line when both would pass 70), the fold of the oldest colonies, a step's piece, the next unit, and
// CONTROL's last line.
export type EpilogueLineKind = 'header' | 'colony' | 'payoff' | 'older' | 'step1' | 'step2' | 'next' | 'control';

export interface EpilogueLine {
  kind: EpilogueLineKind;
  text: string;
}

// At most EPILOGUE_MAX_LINES lines (R20).
export interface EpilogueModel {
  year: number;
  lines: EpilogueLine[];
}

// One piece of the final card's two rows (R22): found (lit) by name, or `???` (dim).
export interface FinalCardPiece {
  piece: EndingPiece;
  found: boolean;
  text: string;
}

export interface FinalCardModel {
  title: string;                       // R23: by step 2, then step 1; a lost run's cause title
  ending: { hollow: string; you: string } | null;   // the record's two choices (the title's colour); null on a lost run
  endingsLine: string;                 // `ENDINGS n/6`
  rows: { hollow: FinalCardPiece[]; you: FinalCardPiece[] };
  next: string[];                      // the `NEXT RUN:` lines (7c's traceNextLines; [] in 7a, R12)
  bridge: { line: string; tail: string } | null;    // RUN END's bridging line, moved here (null on the classic world)
  newRun: string;
}

export function epilogueModel(state: Readonly<GameState>, meta: Readonly<Meta> | null): EpilogueModel | null {
  void state;
  void meta;
  return null;
}

export function finalCardModel(state: Readonly<GameState>, meta: Readonly<Meta> | null): FinalCardModel | null {
  void state;
  void meta;
  return null;
}
