// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.11, §6.2): the residents' view models, pure,
// which the painters (MindTerminal, SegmentBlock, DetailPanel, HollowPainter, Stamp, ShipCard, StarChart, LandingReport,
// TransmitScreen) read. FACE paints STATE: every model reads the store's slices (state.resident, run.residents, the
// segments' own fields), never WARDEN's or KIN's modules, so it shows whatever they write. No module state (plan §2.3).
// Every word is data/resident-ui-text.ts's, but the notes' lines (data/kin-text.ts, KIN's pool, read by the segment's index).
import type { GameState, LogChoice, Speaker } from '@state/schema';
import type { Segment, DriverSegment, ResidentFileSegment } from '@/types/segment';
import type { DraftCard } from '@data/upgrades';
import { builtResident } from '@data/residents';
import { KIN_TEXT } from '@data/kin-text';
import { UNKNOWN_TEXT } from '@data/unknown-text';
import { UNKNOWN_EVENTS_BUILT } from '@data/unknown';
import { signalSourceAt } from '@systems/signals';
import { RESIDENT_UI_TEXT } from '@data/resident-ui-text';
import { SKILL_TREE } from '@data/skills';
import { podCode } from '@data/landing-text';
import { currentSlot, shipLaunchYear, shipSummaryAt } from '@systems/map-run';
import { integrityBand, isResidentFile, shownIntegrity } from '@state/selectors';
import { SLEEPER_GIFT_CYCLES, SIGNALS_FOR_CONTACT } from '@data/tuning';

const T = RESIDENT_UI_TEXT;

// --- The SHIP CARD and the STAR CHART (02 §8 slice 5, plan R18) ------------------------------------------------------------

// The SHIP CARD's RESIDENT row for `slot` (02 §8 slice 5: `none`, `reported faulty`, `unknown`; after the ship, the record's
// words: `was faulty`, `left · LOOKOUT`, `friendly · MOTH`). null: no row (the classic world). A kind this build does not
// play reads `none` (data/residents.ts builtResident: the ship will hold no files of it). A sleeper nobody woke stays
// `unknown` after its ship: the kid never met it, and it may still sleep there next run (04 §3.11).
export interface ResidentCardRow {
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

export function residentCardRow(state: Readonly<GameState>, slot: number): ResidentCardRow | null {
  const map = state.run.map;
  if (map.world !== 'arm') return null;
  const row = (value: string, tone: ResidentCardRow['tone'] = 'plain'): ResidentCardRow => ({ label: T.card.label, value, tone });
  const met = state.run.residents.met.find((record) => record.slot === slot);
  if (met !== undefined) {
    switch (met.kind) {
      case 'corrupted': return row(T.card.wasFaulty);
      case 'left': return row(T.card.left(met.name));
      case 'sleeping': return met.fate === 'woken' ? row(T.card.friendly(met.name), 'good') : row(T.card.unknown);
    }
  }
  const reserved = shipSummaryAt(map, slot).reserved?.resident ?? null;
  const def = builtResident(reserved === null ? null : { ...reserved, fragments: 0 });
  if (def === null) return row(T.card.none);
  return def.shown === 'faulty' ? row(T.card.faulty, 'warn') : row(T.card.unknown);
}

// The chart's `▓░` glyph (plan R18): on a ship still ahead whose departed resident's note carries a fragment, once the run
// has found one (a kid who has never scanned a note learns nothing from the chart). Only fragments this build can collect.
// Review D4 (the lead's decision): and only where the ship's card already shows the resident's kind. On an `unknown` card the
// glyph would narrow it to a departed resident, telling it from a sleeper or a late surprise. In slice 5 no card ahead names
// a departed resident (it reads `unknown` until the ship is met), so the glyph shows nowhere yet; slice 7's cards that do
// (the `?` signal ship's) get it with no change here.
// Slice 7d (R40, OPEN-DECISIONS 49; the lead's): also on every `?` ship that carries fragments (the signal ship's file, the
// gone resident's note), once the `?` ships are built. Their `??? · NO TRANSPONDER` card promises no resident kind, so the
// glyph narrows nothing (OD 31 holds), and the three it marks with the notes are CONTACT's price. And on a CONTACT stop whose
// `▓▓░▓` file still waits (02 §3.5: "every other fragment ship"; its card's TRACE row names it already).
export function signalGlyph(state: Readonly<GameState>, slot: number): boolean {
  const map = state.run.map;
  if (map.world !== 'arm' || state.run.residents.signals.length === 0) return false;
  if (map.route.some((stop) => stop.slot === slot)) return false;
  const ahead = shipSummaryAt(map, slot).reserved;
  if (UNKNOWN_EVENTS_BUILT && ahead !== null && ahead.unknownEvent !== null && ahead.fragments > 0) {
    return ahead.unknownEvent === 'signal' || builtResident(ahead.resident === null ? null : { ...ahead.resident, fragments: ahead.fragments })?.kind === 'left';
  }
  if (signalSourceAt(state.run, slot)?.source === 'contact-stop') return true;
  const card = residentCardRow(state, slot);
  if (card === null || card.value === T.card.unknown || card.value === T.card.none) return false;
  const reserved = shipSummaryAt(map, slot).reserved;
  if (reserved === null || reserved.resident === null || reserved.fragments <= 0) return false;
  return builtResident({ ...reserved.resident, fragments: reserved.fragments })?.kind === 'left';
}

// --- The LANDING REPORT (plan §2.11, R12, R24, R7) ---------------------------------------------------------------------------

// The report's resident rows: MOTH's gift (shown once the sleeper was woken, whatever its job: plan R12's decision, the
// preview of residentShipEnd's grant), WARDEN's goodnight (R24: it was met awake, not deleted, and every pod went down), and
// each pod parked in orbit with a lock still on its driver (`pod` set; the report draws it in place of that pod's PARKED row).
export interface ResidentReportRow {
  kind: 'gift' | 'goodnight' | 'locked';
  text: string;
  pod: number | null;
}

export function residentReportRows(state: Readonly<GameState>): ResidentReportRow[] {
  const def = state.resident.def;
  if (def === null) return [];
  const rows: ResidentReportRow[] = [];
  if (def.kind === 'sleeping' && state.resident.sleeper !== null && state.resident.sleeper.phase !== 'asleep') {
    rows.push({ kind: 'gift', text: T.report.gift(SLEEPER_GIFT_CYCLES, def.name), pod: null });
  }
  const corrupted = state.resident.corrupted;
  if (def.kind === 'corrupted' && corrupted !== null) {
    const pods = state.landing.pods;
    const allDown = pods.length > 0 && pods.every((record) => record.fate.kind === 'down');
    if (allDown && corrupted.phase !== 'dormant' && corrupted.phase !== 'deleted') {
      rows.push({ kind: 'goodnight', text: T.report.goodnight(def.name), pod: null });
    }
    // A pod still aboard as the report opens is parked by the landing's end (landing-rules finalFateOfAboard: the report's
    // tally reads it so), so it counts with the ones already written parked.
    for (const driver of lockedDriversAboard(state)) {
      const fate = pods.find((record) => record.pod === driver.pod)?.fate;
      if (fate?.kind !== 'parked' && fate?.kind !== 'aboard') continue;
      rows.push({ kind: 'locked', text: T.report.lockedParked(podCode(driver.pod), driver.lockedBy!), pod: driver.pod });
    }
  }
  return rows;
}

function lockedDriversAboard(state: Readonly<GameState>): DriverSegment[] {
  return state.memory.filter((seg): seg is DriverSegment => seg.type === 'driver' && seg.lockedBy !== undefined)
    .sort((a, b) => a.pod - b.pod);
}

// --- The MIND strip (SegmentBlock) -------------------------------------------------------------------------------------------

// How the strip draws a resident's file, or a driver a resident has locked; null for any other segment. From the segment
// alone (the strip renders without the state): `className` joins the chip's classes, `health` replaces its health reading
// (null: the chip's own), `healthCls` its colour, `title` its tooltip, `chain` a locked driver's chain.
// • WARDEN.sys: amber-edged, a ship's own file; `?` until scanned, then its health in its band's colour.
// • MOTH.sys: grey and IDLE like any inactive backup until it wakes; then green, AWAKE. MOTH.wall: a green WALL.
// • sleep.lock, farewell.txt, the leftovers: grey, `?` until scanned; then LOCK, READ (or the fragment's `▓░`), and a leftover
//   its own health (its name is its card's, KIN's after the SCAN).
export interface ResidentSegmentLook {
  className: string;
  health: string | null;
  healthCls: string;
  title: string | null;
  chain: boolean;
}

const look = (className: string, health: string | null, healthCls = '', title: string | null = null): ResidentSegmentLook => (
  { className, health, healthCls, title, chain: false }
);

export function residentSegmentLook(seg: Readonly<Segment>): ResidentSegmentLook | null {
  if (seg.type === 'driver') {
    if (seg.lockedBy === undefined) return null;
    return { className: 'res-locked', health: null, healthCls: '', title: T.strip.lockedTitle(podCode(seg.pod), seg.lockedBy), chain: true };
  }
  if (!isResidentFile(seg)) return null;
  return fileLook(seg);
}

function fileLook(seg: Readonly<ResidentFileSegment>): ResidentSegmentLook {
  const unknown = look('', T.strip.unknown, 'unknown');
  switch (seg.type) {
    case 'resident': {
      // Review M2: a late surprise before its wake is a plain ship file (the ship-file look, its own health rules: `?` until a
      // SCAN), so rack A gives nothing away before the engine coughs (R9: the boot's amber line is the only tell).
      if (seg.hidden === true) return look('ship res-hidden', null);
      if (!seg.scanned) return { ...unknown, className: 'res-mind res-corrupted' };
      const band = integrityBand(seg.integrity);
      const cls = band === 'ok' ? 'good' : band === 'degraded' ? 'partial' : 'warn';
      return look('res-mind res-corrupted res-scanned', seg.state === 'repairing' ? null : `${shownIntegrity(seg.integrity)}%`, cls);
    }
    case 'sleeper':
      if (seg.part === 'wall') return look('res-sleeper res-wall', T.strip.wall, 'good');
      return seg.awake ? look('res-sleeper res-awake', T.strip.awake, 'good') : look('res-sleeper res-asleep inactive', T.strip.asleep, 'partial');
    case 'sleep-lock':
      return seg.scanned ? look('res-grey res-lock', T.strip.lock, 'partial') : { ...unknown, className: 'res-grey res-lock' };
    case 'note':
      if (!seg.scanned) return { ...unknown, className: 'res-grey res-note' };
      return seg.fragment ? look('res-grey res-note res-signal', T.strip.signal, 'signal') : look('res-grey res-note', T.strip.read, 'partial');
    case 'leftover':
      return seg.scanned ? look('res-grey res-leftover res-scanned', null) : { ...unknown, className: 'res-grey res-leftover' };
    // Slice 7d: the `▓▓░▓` file, grey and `?` until a SCAN, then its noise (a read note's fragment look).
    case 'signal':
      return seg.scanned ? look('res-grey res-note res-signal', T.strip.signal, 'signal') : { ...unknown, className: 'res-grey res-note res-signal-file' };
  }
}

// --- INSPECT (DetailPanel) ----------------------------------------------------------------------------------------------------

// INSPECT's resident rows for the selected file, or null: a scanned WARDEN.sys's who-line (05 §3.6, the ship's launch year),
// a read note's lines with its signature and fragment noise, MOTH's job once awake, a locked driver's lock.
export interface ResidentInspectRow {
  key: string;
  value: string;
  cls: string;
}

export interface ResidentInspect {
  state: { text: string; cls: string } | null;     // replaces INSPECT's state row (null: its own)
  rows: ResidentInspectRow[];
  note: { lines: string[]; signature: string; noise: string | null } | null;
}

export function residentInspect(state: Readonly<GameState>, seg: Readonly<Segment>): ResidentInspect | null {
  if (seg.type === 'driver') {
    if (seg.lockedBy === undefined) return null;
    return {
      state: null,
      rows: [
        { key: T.detail.lockedKey, value: T.detail.lockedBy(seg.lockedBy), cls: 'resident' },
        { key: '', value: T.detail.lockedHow, cls: 'resident-dim' },
      ],
      note: null,
    };
  }
  if (!isResidentFile(seg)) return null;
  switch (seg.type) {
    case 'resident': {
      if (!seg.scanned || state.run.map.world !== 'arm') return null;
      const year = shipLaunchYear(state.run.map, currentSlot(state.run));
      const cured = state.resident.corrupted?.phase === 'cured';
      const who = cured ? T.inspectCured(seg.owner, year) : T.inspect(seg.owner, year);
      // Its health in its band's colour; a REPAIR running keeps INSPECT's own live ↻ readout.
      const band = integrityBand(seg.integrity);
      const health = cured ? { text: T.detail.state.cured, cls: 'good' }
        : { text: T.detail.state.corrupted(shownIntegrity(seg.integrity)), cls: band === 'ok' ? 'good' : band === 'degraded' ? 'partial' : 'warn' };
      return { state: seg.state === 'repairing' ? null : health, rows: [{ key: '', value: who, cls: cured ? 'good' : 'resident' }], note: null };
    }
    case 'note': {
      if (!seg.scanned) return null;
      const lines = KIN_TEXT.notes[seg.tone][seg.text];
      if (lines === undefined) throw new Error(`residentInspect: ${seg.owner}'s note ${seg.tone}[${seg.text}] is not in KIN_TEXT.notes`);
      return {
        state: { text: T.detail.state.read, cls: 'partial' }, rows: [],
        note: { lines: [...lines], signature: T.detail.signature(seg.owner), noise: seg.fragment ? T.noise : null },
      };
    }
    // Slice 7d: a read `▓▓░▓` file shows its one line, no sender, and its noise.
    case 'signal': {
      if (!seg.scanned) return null;
      return {
        state: { text: T.detail.state.read, cls: 'partial' }, rows: [],
        note: { lines: [UNKNOWN_TEXT.signal.lines[seg.source]], signature: UNKNOWN_TEXT.signal.signature, noise: UNKNOWN_TEXT.signal.noise },
      };
    }
    case 'sleeper': {
      if (seg.part === 'wall') return { state: { text: T.detail.state.wall, cls: 'good' }, rows: [], note: null };
      const sleeper = state.resident.sleeper;
      if (!seg.awake || sleeper === null) {
        return seg.scanned ? { state: { text: T.detail.state.asleep, cls: 'partial' }, rows: [], note: null } : null;
      }
      return {
        state: { text: T.detail.state.awake, cls: 'good' },
        rows: [{ key: T.detail.sleeperKey, value: T.detail.sleeperJob[sleeper.job ?? 'none'], cls: 'sleeper' }], note: null,
      };
    }
    default:
      return null;
  }
}

// --- The lock's reticle (HollowPainter) and the sleeper's breath ----------------------------------------------------------

// The lock telegraph's reticle (HollowPainter's verb reticle in amber, class `lock-aim`): the driver it is on, its whole
// second (as the TERMINAL counts it, never below 1), how much of its countdown is left (0..1: the brackets close in) and the
// badge (`LOCK 3`); null while no lock counts down.
export interface LockAimView {
  segId: string;
  pod: number;
  second: number;
  progress: number;
  badge: string;
}

export function lockAimView(state: Readonly<GameState>): LockAimView | null {
  const lock = state.resident.corrupted?.lock ?? null;
  if (lock === null) return null;
  const second = Math.max(1, Math.ceil(lock.leftSec));
  const progress = lock.totalSec > 0 ? Math.max(0, Math.min(1, lock.leftSec / lock.totalSec)) : 0;
  return { segId: lock.segId, pod: lock.pod, second, progress, badge: T.lockBadge(second) };
}

// The sleeper's rack breathes (opacity 0.96 ↔ 1 at SLEEPER_BREATH_HZ, off under reduced motion; heartbeat at
// SLEEPER_BREATH_GAIN) while it sleeps in memory on a ship being flown or landed: never once it is woken, never on the desk.
export function sleeperBreathing(state: Readonly<GameState>): boolean {
  const sleeper = state.resident.sleeper;
  if (state.resident.def?.kind !== 'sleeping' || sleeper === null || sleeper.phase !== 'asleep') return false;
  if (state.run.phase !== 'flight' && state.run.phase !== 'landing') return false;
  return state.memory.some((seg) => seg.type === 'sleeper' && seg.part === 'mind' && !seg.awake);
}

// --- The TERMINAL's voices (MindTerminal) --------------------------------------------------------------------------------------

// Who types a line, as the TERMINAL draws and sounds it (04 §4): a resident in amber capitals with its flat one-note blip, the
// sleeper in the good green with its soft sine; every other speaker keeps the TERMINAL's own typing tick.
export type TerminalSound = 'residentBlip' | 'sleeperVoice' | 'typeTick';

export interface TerminalVoice {
  className: string;
  sound: TerminalSound;
}

export function terminalVoice(speaker: Speaker): TerminalVoice {
  if (speaker === 'resident') return { className: 'speaker-resident voice-resident', sound: 'residentBlip' };
  if (speaker === 'sleeper') return { className: 'speaker-sleeper voice-sleeper', sound: 'sleeperVoice' };
  return { className: `speaker-${speaker}`, sound: 'typeTick' };
}

// A choice with no timer (the sleeper's offer, plan R23) draws no bar and no clock.
export function choiceHasTimer(choice: Readonly<LogChoice>): boolean {
  return choice.timeoutAiSec !== null;
}

// --- The stamps (Stamp.ts) -------------------------------------------------------------------------------------------------------

export interface ResidentStamp {
  text: string;
  tone: 'good' | 'plain' | 'danger';
  glitch: boolean;          // the late surprise's small tear (04 §4: glitchBurst(0.3, 400))
}

// The wake stamps only the late surprise (04 §4: a one-time stamp; a reported resident was announced by CONTROL already).
export function wakeStamp(payload: Readonly<{ kind: string; surprise: boolean }>): ResidentStamp | null {
  if (payload.kind !== 'corrupted' || !payload.surprise) return null;
  return { text: T.stamp.awake, tone: 'danger', glitch: true };
}

export function deletedStamp(): ResidentStamp {
  return { text: T.stamp.deleted, tone: 'good', glitch: false };
}

export function curedStamp(): ResidentStamp {
  return { text: T.stamp.cured, tone: 'good', glitch: false };
}

// Slice 7d: past CONTACT's price (a run can find up to 7), the stamp says the count alone: `SIGNAL · 4/3` reads as a bug.
export function signalStamp(count: number): ResidentStamp {
  return { text: count > SIGNALS_FOR_CONTACT ? T.stamp.signalMore(count) : T.stamp.signal(count, SIGNALS_FOR_CONTACT), tone: 'good', glitch: false };
}

// --- The PACKET's leftover deck (TransmitScreen) ----------------------------------------------------------------------------

// The deck's look (04 §3.13, plan §2.8): `LEFT BEHIND BY LOOKOUT` over it when its cards are a departed resident's leftovers,
// and per card its chip line (the skill card drawn like a `.skl` chip: `AUTODROP.skl v1 · FROM THE RESIDENT THAT LEFT`) or
// the pool card's `LEFT` mark. `headline` null: the normal deal.
export interface LeftoverDeckView {
  headline: string | null;
  cards: { skillChip: string | null; leftMark: string | null }[];
}

export function leftoverDeckView(state: Readonly<GameState>, cards: readonly DraftCard[]): LeftoverDeckView {
  const def = state.resident.def;
  const leftover = def?.kind === 'left' && cards.some((card) => card.leftover !== undefined);
  return {
    headline: leftover && def !== null ? T.deck.headline(def.name) : null,
    cards: cards.map((card) => {
      if (!leftover || card.leftover === undefined) return { skillChip: null, leftMark: null };
      const skill = card.leftover.skill;
      return skill === null
        ? { skillChip: null, leftMark: T.deck.leftMark }
        : { skillChip: T.deck.skillChip(SKILL_TREE[skill].fileName, 1), leftMark: null };
    }),
  };
}
