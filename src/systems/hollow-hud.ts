import type { GameState } from '@state/schema';
import type { InfectionSide, Segment } from '@/types/segment';
import {
  hollowReach, drainConditions, drainRatePerSec, healRatePerSec, netLossPerSec, oppositeSide, settledWakeAtAi, dealHolds, type ReachVerdict,
} from '@systems/hollow';
import { formatTac } from '@systems/guidance';
import { dealEffectNow } from '@systems/hollow-deal';
import { isLivePhase } from '@systems/clock';
import { segmentStarts } from '@systems/memory-ops';
import { infectedSegments, healthKnown, isInfected, isFirewall, type InfectedSegment } from '@state/selectors';
import { driverTouch } from '@systems/landing-rules';
import { HOLLOW_HUD_TEXT } from '@data/hollow-text';
import { THREAT_TEXT, traceCells as traceCellsText } from '@data/threat-text';
import { traceCells, tallyPreview, beamSeedsInMemory } from '@state/threat-selectors';
import { hollowLabel } from '@systems/say';
import {
  RACK_BLOCKS, RACK_COUNT, INTEGRITY_MAX, HOLLOW_BITE_URGENT_SEC, CHEW_FULL_DRAIN, TUG_BEAT_PER_PCT, TUG_BEAT_MIN_HZ,
  TUG_BEAT_MAX_HZ, TUG_PITCH_LOW_HZ, TUG_PITCH_HIGH_HZ, FIREWALL_BLOCKS, TRACE_BOARD_AT,
} from '@data/tuning';

// What HOLLOW looks and sounds like, as data (§6.6, §7.1, §7.2, §9 WP6 items 6, 9, 10), the way
// flight-hud.ts is the flight's: pure readers of the state, so the painter, the mini-strip and the
// sound only draw and play, and the headless tests check what a kid would see and hear.
// • biteClock: `NEXT BITE m:ss` on every hollow block (one global timer), `?:??` when there is none.
// • reachMarks: its reach drawn from hollowReach, so a label can never disagree with the bite: the
//   dashed arrow from a hollow block to each file it bites next, `GAP n` (red) on the free blocks it
//   bites across, `WALL n ✓` (green) on the ones that hold it. Nothing while it is done for the ship.
// • miniStripRows: the amber mini-strip, one row of cells per rack.
// • chewLevel / tugTone: the chew's loudness and the tug-of-war's beating tones.
// • traceMeter / reportTraceLine (phase 3 slice 2, 04 §4): TRACE as the MIND header, the mini-HUD and the LANDING
//   REPORT draw it, from state/threat-selectors.ts (traceCells, tallyPreview), so the three never disagree.

// --- NEXT BITE ----------------------------------------------------------------------------------------

export interface BiteClock {
  secLeft: number | null;  // AI seconds to the next bite; null: no timer (ship 1 bites once, on its cue; a
                           // coast-tied wake before the coast has fixed its time)
  time: string;            // `0:25`, or `?:??`
  key: string;             // `NEXT BITE`, or what THE DEAL made of it: `FED · BITE`, `FASTER BITE` (WP10)
  text: string;            // `NEXT BITE 0:25`
  urgent: boolean;         // HOLLOW_BITE_URGENT_SEC or less to go
  quiet: boolean;          // dormant: done with this ship (the static calms, no arrows)
  // WP10, THE DEAL's answer as the strip shows it: 'fed' while an ACCEPT keeps it still (the bite timer stands, so
  // NEXT BITE counts the pause too and never jumps), 'hasted' while a REFUSE makes it bite more often. null: neither.
  mood: 'fed' | 'hasted' | null;
}

export function biteClock(state: Readonly<GameState>): BiteClock {
  const { phase, biteInSec, cfg } = state.hollow;
  const effect = dealEffectNow(state);
  let secLeft: number | null = null;
  let mood: BiteClock['mood'] = null;
  if (phase === 'awake') {
    secLeft = biteInSec === null ? null : biteInSec + effect.pausedForSec;
    if (effect.pausedForSec > 0) mood = 'fed';
    else if (effect.hastedForSec > 0) mood = 'hasted';
  }
  // A calm-only wake (beam seeds before HOLLOW boards, 04 §3.5) counts calm AI seconds only (HollowState.calmAiSec, which
  // stands still at TACTICAL): its countdown is that clock's remainder, so it freezes through a burn's lines and never
  // jumps (pillar 5). A debris dodge holding the wake shows no time, as for any timed wake.
  else if (phase === 'asleep' && typeof cfg.wake !== 'string' && cfg.wake.calmOnly) {
    secLeft = state.hollow.wakeHeld ? null : Math.max(0, cfg.wake.afterAiSec - state.hollow.calmAiSec);
  }
  // A later ship's HOLLOW wakes with a bite at a set time: that IS its next bite. A coast-tied wake has no
  // time to show until the coast (or the latest wake) fixes it. (A scripted wake, VESPER's silent boarding until the
  // capture, has no time either: `?:??`.)
  else if (phase === 'asleep' && typeof cfg.wake !== 'string') {
    const wakeAt = settledWakeAtAi(cfg, state.burn.coastAtAi, state.clock.aiSec, state.hollow);
    secLeft = wakeAt === null ? null : Math.max(0, wakeAt - state.clock.aiSec);
  }
  const time = secLeft === null ? HOLLOW_HUD_TEXT.noTimer : formatTac(secLeft);
  const key = mood === 'fed' ? HOLLOW_HUD_TEXT.nextBiteFed : mood === 'hasted' ? HOLLOW_HUD_TEXT.nextBiteHasted : HOLLOW_HUD_TEXT.nextBite;
  return {
    secLeft,
    time,
    key,
    text: `${key} ${time}`,
    urgent: secLeft !== null && secLeft <= HOLLOW_BITE_URGENT_SEC,
    quiet: phase === 'dormant',
    mood,
  };
}

// The next bite on the amber objective strip (WP7; WP6's TODO for ship 2): HOLLOW awake with its timer
// running and something it would bite (a file across a GAP, or one whose recoil ends first). Walled off,
// the bite only fizzles, and the strip stays quiet. AI time, so it carries no ▸▸ / ×¼ badge.
export function amberBite(state: Readonly<GameState>): { text: string; urgent: boolean } | null {
  if (state.hollow.phase !== 'awake') return null;
  const clock = biteClock(state);
  if (clock.secLeft === null) return null;
  const reach = hollowReach(state.memory, state.clock.aiSec);
  if (!reach.some((candidate) => candidate.verdict === 'bite' || candidate.verdict === 'recoiling')) return null;
  return { text: HOLLOW_HUD_TEXT.amberBite(clock.time), urgent: clock.urgent };
}

// --- TRACE (04 §3.7, §4) -----------------------------------------------------------------------------------

// The UI's own words around THREAT_TEXT's (data/threat-text.ts is Track THREAT's): the meter's key, and the report's line
// for a ship whose beam seeds were all deleted (a kid who did the RM lesson right sees it counted, not just silence).
export const TRACE_UI_TEXT = {
  key: 'TRACE',
  clean: (cells: string): string => `NO SEEDS LEFT BEHIND · NOTHING REPORTS HOME · TRACE ${cells}`,
  title: 'TRACE: every seed left in memory at a ship\'s end reports home. Three, and it finds you.',
  ridesTitle: 'It rides the beam with you now, from ship to ship.',
} as const;

// What the TRACE meter shows (the MIND header and the mini-HUD): `TRACE ■■□`, `■■■ +1` past a full meter, with
// `1 MORE AND IT FINDS YOU` one short of boarding; once HOLLOW is aboard, `IT RIDES WITH YOU · 10 BLOCKS` in its place.
// Hidden until it means something this run: a report counted, a beam seed came in (or is in memory), or HOLLOW is aboard.
// The calm ships show nothing (04 §3.2: nothing there to report home).
export type TraceTone = 'quiet' | 'warn' | 'full' | 'aboard';

export interface TraceMeter {
  visible: boolean;
  key: string;              // TRACE
  cells: string;            // ■■□, or ■■■ +1
  filled: number;
  total: number;
  over: number;
  text: string;             // TRACE ■■□, or IT RIDES WITH YOU · 10 BLOCKS
  note: string | null;      // 1 MORE AND IT FINDS YOU
  aboard: boolean;          // the meter's place says HOLLOW rides along
  tone: TraceTone;
  title: string;
}

// The root HOLLOW rides in on this ship (its size now: the duel deletes it block by block), or null.
function rootInMemory(memory: readonly Segment[]): number | null {
  const root = memory.find((seg) => seg.type === 'hollow' && seg.root);
  return root === undefined ? null : root.size;
}

export function traceMeter(state: Readonly<GameState>): TraceMeter {
  const { filled, total, over } = traceCells(state);
  const trace = state.run.threat.trace;
  const cells = traceCellsText(trace);
  const rootBlocks = state.run.threat.aboard ? rootInMemory(state.memory) : null;
  const metSeeds = (state.run.arrival?.seeds.length ?? 0) > 0 || beamSeedsInMemory(state.memory).length > 0;
  const visible = rootBlocks !== null || trace > 0 || metSeeds;
  if (rootBlocks !== null) {
    return {
      visible, key: TRACE_UI_TEXT.key, cells, filled, total, over, text: THREAT_TEXT.ridesWithYou(rootBlocks), note: null,
      aboard: true, tone: 'aboard', title: TRACE_UI_TEXT.ridesTitle,
    };
  }
  const oneShort = trace === TRACE_BOARD_AT - 1;
  return {
    visible, key: TRACE_UI_TEXT.key, cells, filled, total, over, text: THREAT_TEXT.trace(trace),
    note: oneShort ? THREAT_TEXT.traceOneMore : null, aboard: false,
    tone: filled >= total ? 'full' : oneShort ? 'warn' : 'quiet', title: TRACE_UI_TEXT.title,
  };
}

// The LANDING REPORT's TRACE line (04 §4: `2 SEEDS LEFT BEHIND · THEY REPORT HOME · TRACE ■□□ → ■■■`), from the same tally
// the ship's end applies (tallyPreview): what the beam-born blocks still in memory will do. With HOLLOW aboard they feed
// it instead (`… · THEY FEED ???`). A ship whose beam brought seeds and that kept none says so; a ship that never met
// one has no line. 'warn': TRACE goes up; 'fed': HOLLOW grows; 'good': nothing reports home.
export interface ReportTraceLine {
  text: string;
  tone: 'warn' | 'fed' | 'good';
}

export function reportTraceLine(state: Readonly<GameState>): ReportTraceLine | null {
  const tally = tallyPreview(state);
  if (tally.left === 0) {
    const met = (state.run.arrival?.seeds.length ?? 0) > 0;
    return met ? { text: TRACE_UI_TEXT.clean(traceCellsText(tally.traceAfter)), tone: 'good' } : null;
  }
  if (tally.fed) return { text: THREAT_TEXT.reportFed(tally.left, hollowLabel(state.run)), tone: 'fed' };
  return { text: THREAT_TEXT.reportTrace(tally.left, tally.traceBefore, tally.traceAfter), tone: 'warn' };
}

// --- Its reach -----------------------------------------------------------------------------------------

// The free blocks between a hollow block and its neighbour: a red GAP it bites across, or a green WALL.
export interface GapMark {
  kind: 'gap' | 'wall';
  segIds: readonly string[];   // the free segments of the gap, nearest the hollow block first
  blocks: number;
  hollowEdge: InfectionSide;   // the gap's edge that touches the hollow block
  label: string;               // `GAP 2` / `WALL 8 ✓`
  word: string;                // `GAP` / `WALL`: the label drawn on two lines, to fit a 2-block chip
  count: string;               // `2` / `8 ✓`
  title: string;               // the tooltip: the whole rule
}

// A file the next bite infects: the dashed arrow from the hollow block's mouth to the target's edge.
export interface BiteMark {
  hollowId: string;
  mouth: InfectionSide;        // the hollow block's edge that faces the target
  targetId: string;
  edge: InfectionSide;         // the target's edge that faces the hollow block (where the red comes in)
  gapBlocks: number;
}

// A FIREWALL holding one side of HOLLOW (WP8, the WP6 TODO): the green shield the painter draws on it, the
// way a WALL gets its green bracket. The free blocks in front of it are not labelled (it holds whatever their
// number), like any blocker's.
export interface ShieldMark {
  hollowId: string;
  firewallId: string;
  hollowEdge: InfectionSide;   // the FIREWALL's edge that faces the hollow block
  gapBlocks: number;
}

export interface ReachMarks {
  gaps: GapMark[];
  bites: BiteMark[];
  shields: ShieldMark[];
}

// A gap is red while HOLLOW reaches a file across it: the next bite, a file it is already eating, or
// one it skips only while it recoils from a cure. Next to no food (REPAIR CHARGE, another hollow block)
// or the end of memory, a short gap is no threat and is not labelled.
const RED_GAP_VERDICTS: ReadonlySet<ReachVerdict> = new Set<ReachVerdict>(['bite', 'infected', 'recoiling']);

export function reachMarks(state: Readonly<GameState>): ReachMarks {
  const marks: ReachMarks = { gaps: [], bites: [], shields: [] };
  if (state.hollow.phase === 'dormant') return marks;
  for (const reach of hollowReach(state.memory, state.clock.aiSec)) {
    // Looking right, the gap's left edge touches the hollow block (and the other way round).
    const hollowEdge = oppositeSide(reach.side);
    const blocks = reach.gapBlocks;
    const neighbour = reach.neighbourId === null ? undefined : state.memory.find((seg) => seg.id === reach.neighbourId);
    if (reach.verdict === 'blocked' && neighbour !== undefined && isFirewall(neighbour)) {
      marks.shields.push({ hollowId: reach.hollowId, firewallId: neighbour.id, hollowEdge, gapBlocks: blocks });
    }
    if (blocks > 0 && reach.verdict === 'wall') {
      marks.gaps.push({
        kind: 'wall', segIds: reach.gapIds, blocks, hollowEdge, label: HOLLOW_HUD_TEXT.wall(blocks),
        word: HOLLOW_HUD_TEXT.wallWord, count: HOLLOW_HUD_TEXT.wallCount(blocks), title: HOLLOW_HUD_TEXT.wallTitle(blocks),
      });
    } else if (blocks > 0 && RED_GAP_VERDICTS.has(reach.verdict)) {
      marks.gaps.push({
        kind: 'gap', segIds: reach.gapIds, blocks, hollowEdge, label: HOLLOW_HUD_TEXT.gap(blocks),
        word: HOLLOW_HUD_TEXT.gapWord, count: String(blocks), title: HOLLOW_HUD_TEXT.gapTitle(blocks),
      });
    }
    if (reach.verdict === 'bite' && reach.neighbourId !== null) {
      marks.bites.push({ hollowId: reach.hollowId, mouth: reach.side, targetId: reach.neighbourId, edge: hollowEdge, gapBlocks: blocks });
    }
  }
  return marks;
}

// A red GAP a FIREWALL.sys fits in (WP8 fix round 1): MOVEd there, it seals that side of HOLLOW. The strip's
// FIREWALL line points at it (data/script.ts FIREWALL_RULES).
export function firewallFits(marks: Readonly<ReachMarks>): boolean {
  return marks.gaps.some((gap) => gap.kind === 'gap' && gap.blocks >= FIREWALL_BLOCKS);
}

// --- The amber mini-strip (§7.1) ---------------------------------------------------------------------

// What a cell of the mini-strip is: a pod's driver in the colonists' mint (the hurt yellow while its pod would land
// hard: 01-landing §3.8), HOLLOW red, free space empty, the rest of the files dim.
export type MiniKind = 'free' | 'file' | 'core' | 'charge' | 'driver' | 'driver-hurt' | 'hollow';

export interface MiniCell {
  segId: string;
  kind: MiniKind;
  blocks: number;               // this cell's share of its segment, inside one rack
  infected: InfectionSide | null;
  eatenPct: number | null;      // the red share; null: infected, but its health is not known (the hatch)
  healing: boolean;             // a repair is pushing the red back
}

function miniKind(seg: Segment): MiniKind {
  switch (seg.type) {
    case 'free': return 'free';
    case 'hollow': return 'hollow';
    case 'core': return 'core';
    case 'redundancy': return 'charge';
    case 'driver':
      return driverTouch(seg.integrity) === 'soft' ? 'driver' : 'driver-hurt';
    default: return 'file';
  }
}

function miniCell(state: Readonly<GameState>, seg: Segment, blocks: number): MiniCell {
  const infected = isInfected(seg) ? seg : null;
  const known = infected !== null && healthKnown(infected);
  return {
    segId: seg.id,
    kind: miniKind(seg),
    blocks,
    infected: infected ? infected.infected.side : null,
    eatenPct: infected && known ? Math.max(0, INTEGRITY_MAX - infected.integrity) : null,
    healing: infected !== null && healRatePerSec(state, infected) > 0,
  };
}

// One row per rack, its cells in address order; a segment that crosses a rack border is a cell in
// each rack (rack C's tail and the empty rack D are one gap in memory).
export function miniStripRows(state: Readonly<GameState>): MiniCell[][] {
  const rows: MiniCell[][] = Array.from({ length: RACK_COUNT }, () => []);
  const starts = segmentStarts(state.memory);
  state.memory.forEach((seg, index) => {
    let addr = starts[index]!;
    let left = seg.size;
    while (left > 0) {
      const rack = Math.floor(addr / RACK_BLOCKS);
      const row = rows[rack];
      if (!row) throw new Error(`miniStripRows: block ${addr} of ${seg.name} is past rack ${RACK_COUNT}`);
      const take = Math.min(left, RACK_BLOCKS - (addr % RACK_BLOCKS));
      row.push(miniCell(state, seg, take));
      addr += take;
      left -= take;
    }
  });
  return rows;
}

// --- Its sounds (§7.2) -----------------------------------------------------------------------------------

// HOLLOW is heard while the ship is being played and the mind is running: paused, lost or done, the
// chew and the tug fall silent at once, like the engine.
function hollowAudible(state: Readonly<GameState>): boolean {
  return isLivePhase(state) && !state.clock.paused;
}

// The chew's loudness, 0..1: the total drain over every infected file, full at CHEW_FULL_DRAIN.
export function chewLevel(state: Readonly<GameState>): number {
  if (!hollowAudible(state)) return 0;
  // The driver THE DEAL holds is not being chewed while the offer stands (hollow.ts dealHolds).
  const eating = infectedSegments(state).filter((seg) => !dealHolds(state.hollow, seg));
  if (eating.length === 0) return 0;
  const conditions = drainConditions(state);
  const perFile = drainRatePerSec(state.hollow.cfg, conditions.thrustDelivered, conditions.landingActive);
  return Math.min(1, (perFile * eating.length) / CHEW_FULL_DRAIN);
}

// The tug-of-war's two beating tones: the beat follows how fast the green/red boundary moves, the
// pitch how far the green has got. One voice: the tug with the lowest integrity (the one in most
// danger) leads. null: no repair is fighting HOLLOW.
export interface TugTone {
  segId: string;
  beatHz: number;
  pitchHz: number;
  winning: boolean;   // the green is pushing the red back
}

export function tugTone(state: Readonly<GameState>): TugTone | null {
  if (!hollowAudible(state)) return null;
  let lead: InfectedSegment | null = null;
  for (const seg of infectedSegments(state)) {
    if (healRatePerSec(state, seg) <= 0) continue;
    if (lead && seg.integrity >= lead.integrity) continue;
    lead = seg;
  }
  if (!lead) return null;
  const net = netLossPerSec(state, lead);
  const beatHz = Math.min(TUG_BEAT_MAX_HZ, Math.max(TUG_BEAT_MIN_HZ, Math.abs(net) * TUG_BEAT_PER_PCT));
  const share = Math.min(1, Math.max(0, lead.integrity / INTEGRITY_MAX));
  return { segId: lead.id, beatHz, pitchHz: TUG_PITCH_LOW_HZ + (TUG_PITCH_HIGH_HZ - TUG_PITCH_LOW_HZ) * share, winning: net < 0 };
}
