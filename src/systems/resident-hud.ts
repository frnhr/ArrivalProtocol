// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.11, §6.2): the residents' view models, pure,
// which the painters (MindTerminal, SegmentBlock, DetailPanel, HollowPainter, Stamp, ShipCard, StarChart, LandingReport,
// TransmitScreen) read. The FOUNDATION wrote the final signatures as stubs that answer empty (plan §6.1 item 5); FACE may
// widen the models' fields (they are its own). No module state (plan §2.3).
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';

// The SHIP CARD's RESIDENT row for `slot` (02 §8 slice 5: `none`, `reported faulty`, `unknown`; after the ship, the record's
// words: `was faulty`, `left · LOOKOUT`, `friendly · MOTH`). null: no row (the classic world). FOUNDATION stub: null.
export interface ResidentCardRow {
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

export function residentCardRow(state: Readonly<GameState>, slot: number): ResidentCardRow | null {
  void state;
  void slot;
  return null;
}

// The LANDING REPORT's resident rows (plan §2.11: MOTH's `+4 TRAINING CYCLES · taught by MOTH` after 03's cycles line,
// WARDEN's goodnight in 05's story-line slot (R24), locked pods among the PARKED rows). FOUNDATION stub: none.
export interface ResidentReportRow {
  kind: 'gift' | 'goodnight' | 'locked';
  text: string;
}

export function residentReportRows(state: Readonly<GameState>): ResidentReportRow[] {
  void state;
  return [];
}

// How the MIND strip and the DetailPanel draw a resident's file (amber-edged, grey, `?` until scanned, the lock's chain on a
// driver), or null for a file that is not a resident's or locked. FOUNDATION stub: null.
export interface ResidentSegmentLook {
  className: string;
  badge: string | null;
  health: string | null;
}

export function residentSegmentLook(state: Readonly<GameState>, seg: Readonly<Segment>): ResidentSegmentLook | null {
  void state;
  void seg;
  return null;
}

// The lock telegraph's reticle (HollowPainter's verb reticle in amber, class `lock-aim`): the driver it is on and its
// second, or null. FOUNDATION stub: null.
export interface LockAimView {
  segId: string;
  second: number;
}

export function lockAimView(state: Readonly<GameState>): LockAimView | null {
  void state;
  return null;
}

// The sleeper's rack breathes while it is on screen and asleep (opacity 0.96 ↔ 1 at SLEEPER_BREATH_HZ, off under reduced
// motion; heartbeat at SLEEPER_BREATH_GAIN). FOUNDATION stub: false.
export function sleeperBreathing(state: Readonly<GameState>): boolean {
  void state;
  return false;
}
