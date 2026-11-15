import type { Store } from '@state/store';
import type {
  GameState, ViewMode, RunPhase, Speaker, GuideLayer, ObjectiveLine, Urgency,
} from '@state/schema';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { onAny, type GameEventName } from '@systems/events';
import { getPrediction, getSensedPrediction, type Prediction } from '@systems/predict';
import {
  buildFlightContext, flightObjective, createObjectiveFilter, releaseHolds, dodgeCountdownEnds, type FlightObjective,
  buildLandingContext, landingObjective, landingFlightOf, type LandingObjective,
} from '@systems/guidance';
import { getDropSolution } from '@systems/drop-cache';
import { fastForwardBlockReason } from '@systems/pace';
import { FLIGHT_OVER_LINE, percentFloor } from '@systems/flight-hud';
import { getOps } from '@systems/ops-core';
import { say } from '@systems/say';
import { mindAlertActive } from '@systems/alerts';
import { capabilitiesNow, type Capabilities } from '@systems/capabilities';
import { beamOutView } from '@systems/beam-out';
import { bootSkipWaits } from '@systems/boot';
import {
  BEATS, GUIDE_RULES, LINES, REFUSAL_LINES, BEAM_OUT_HINT_TARGET, lineVars, type LineVars,
} from '@data/script';
import { repairStepTarget } from '@data/fs-tools';
import { REFUSAL_FLASH_SEC } from '@data/tuning';
import { CORE_LOST_TEXT } from '@data/hollow-text';
import { shipSummaryAt } from '@systems/map-run';
import { deskSteps } from '@systems/desk';
import { LEAVE_TEXT } from '@data/leave-text';
import { sitesFlashLine } from '@data/sites-text';

// A refused input's strip line: script.ts REFUSAL_LINES by key, or the words a SITES pill sent (playtest 1, C-SITES: built per
// click, `LZ-B HAS PODS DOWN — OPEN SITE 4 AS LZ-D`).
function refusalLine(reason: string): { text: string; keys: readonly string[] } | null {
  return REFUSAL_LINES[reason] ?? sitesFlashLine(reason);
}

// The director (§6.3) composes the one line the objective strip shows and speaks the story
// beats. It runs at the end of every clock tick, in every phase and while paused, so PAUSED,
// the boot and the end of the flight show at once. There is no step counter: every tick the
// line is recomputed from the situation, first match wins:
//   1. an active ALARM rule;
//   2. the live objective when its urgency is 'now';
//   3. an active MIND-URGENT rule;
//   4. an active TUTORIAL rule (one-shot, until its doneWhen);
//   5. the live objective when 'soon';
//   6. a HINT rule;
//   7. the live objective ('wait').
// The live objective is the flight table's line in FLIGHT and the landing table's in LANDING (01-landing §3.11:
// landing-guidance landingObjective in the flight line's places; composeLive is the one composition).
// A lesson with a lead-in (`leadInSec`) outranks 3 for its first seconds on the strip, so a ship's new rule is read
// before HOLLOW's eating lines bury it (WP12 p3); a mind-urgent line marked `outranksLeadIn` still comes first.
// A lesson worded for each screen (its amber `-tab` line and its blue line, GuideRule.lesson) is one lesson: the two
// share its lead-in, its `maxShownSec` clock and its one-shot completion, so they retire together (final review: retired
// one wording at a time, the blue twin's end sent the kid back to amber, where the other still asked for the TAB).
// One exception to 2: a tutorial whose `preempts` holds outranks the flight's 'now' line. It is
// for a beat the kid must not miss while the flight can wait for it (the ship-1 ENGINE I/O FAULT
// lands mid-correction, with the capture minutes away: TAB now, fix it, come back). A one-shot
// with `maxShownSec` steps aside for good after that long on the strip, so a kid who does not
// follow it gets the flight's own line back (what the reminder says stays on the mode toggle).
// Above all of these sit the director's own overrides: the boot, the end of the flight, a
// refused input's explanation (a moment), and PAUSED.
// The shown line passes the same 0.3 s hysteresis as the flight table, and the store is
// updated only when the shown line changes structurally (objectiveStructure); a countdown's
// new numbers are mutated in place. Rules and beats live in data/script.ts.

export type GuidePriority = 'alarm' | 'mind-urgent' | 'tutorial' | 'hint';

// What templates may read (script.ts renders them with worst-case values in tests).
export interface TextCtx {
  vars: LineVars;
}

export interface DirectorCtx extends TextCtx {
  state: Readonly<GameState>;
  pred: Prediction;
  caps: Capabilities;              // what the ship's files allow right now (capabilities.ts)
  phase: RunPhase;
  mode: ViewMode;
  flight: FlightObjective | null;  // the flight table's line (null outside a live flight)
  landing: LandingObjective | null;  // the landing table's line (null outside LANDING, and once the Core is lost)
  skipAvailable: boolean;          // F would start a SKIP right now
  bootSkipWaits: boolean;          // the boot's skip waits for the last unit's ghost (systems/boot.ts)
  events: ReadonlySet<GameEventName>;  // what happened since the previous tick
  phaseEntered: RunPhase | null;   // the phase this tick started, if it just changed
  mindQuietSec: number;            // AI s in blue with no op running and nothing infected
  mindAlert: boolean;              // a mind alert at warn or worse is active
  flash: string | null;            // the refused input being explained, if any
  done: ReadonlySet<string>;
  leadShownSec: ReadonlyMap<string, number>;  // AI seconds each lead-in lesson (lessonOf) has been on the strip on this ship
}

export interface GuideRule {
  id: string;
  layer: GuideLayer;
  priority: GuidePriority;
  activeWhen(ctx: DirectorCtx): boolean;
  text(ctx: TextCtx): string;
  keys?: readonly string[];
  // The data-hint-target to light besides the key caps: fixed, or chosen per tick (the chip until
  // the tool is in hand, then the file to click). A changed target is not a new line.
  highlight?: string | ((ctx: DirectorCtx) => string | null);
  // Overrides the priority's urgency on the strip (a tutorial that must read as urgent).
  urgency?: Urgency;
  // Tutorials only: while this holds, the rule outranks the flight's 'now' line (see the header).
  preempts?(ctx: DirectorCtx): boolean;
  // The lesson this rule is one wording of (its amber `-tab` line and its blue line name the same one; see the header).
  // Its wordings share the one-shot completion, the maxShownSec clock and the lead-in, and script.ts checks that they
  // agree on them. Left out, a rule is a lesson of its own (its id).
  lesson?: string;
  // One-shot: once done it never shows again. Done when doneWhen holds (checked every tick,
  // shown or not); a once-rule without doneWhen is done when it stops being active after it
  // was shown. For a lesson: when any wording is done, every wording is; without doneWhen, once
  // one was shown and none is active any more.
  once?: boolean;
  doneWhen?(ctx: DirectorCtx): boolean;
  // One-shots only: also done after this many AI seconds on the strip (see the header), all its wordings together.
  maxShownSec?: number;
  // Tutorials only (WP12 p3): for its first leadInSec AI seconds on the strip the lesson outranks the mind-urgent lines
  // (HOLLOW's eating and wall lines), except those marked outranksLeadIn (see the header). Counted per lesson (WP12
  // review: keyed by rule id, the blue wording got a second full lead-in after the amber one's, 12 s instead of 6).
  leadInSec?: number;
  // Mind-urgent only: a line no lesson's lead-in may stand in front of (a verb's three seconds, the finale's duel), or
  // only while this holds (a seed whose bite reaches the AI Core or an AI file, final review).
  outranksLeadIn?: true | ((ctx: DirectorCtx) => boolean);
}

export interface BeatLine {
  speaker: Speaker;
  text(ctx: TextCtx): string;
  critical?: boolean;
  quip?: boolean;
}

export interface Beat {
  id: string;
  when(ctx: DirectorCtx): boolean;
  lines: readonly BeatLine[];
  once: boolean;
  // A one-shot that belongs to one ship, not the run (PAL's touchdown cheer, `They're down! :)`): the next ship,
  // or ship 1 again after the simulation, hears it again (systems/run.ts forgets it at the reset).
  perShip?: true;
}

// The urgency each rule priority carries on the strip (hysteresis lets 'now' through at once).
const RULE_URGENCY: Record<GuidePriority, Urgency> = {
  alarm: 'now',
  'mind-urgent': 'now',
  tutorial: 'soon',
  hint: 'wait',
};

// A line's layer is the screen its controls are on: ◆ SHIP in amber, ◇ MIND in blue.
export function layerOfScreen(mode: ViewMode): GuideLayer {
  return mode === 'memory' ? 'mind' : 'ship';
}

export function screenOfLayer(layer: GuideLayer): ViewMode {
  return layer === 'mind' ? 'memory' : 'tools';
}

function ruleHighlight(rule: GuideRule, ctx: DirectorCtx): string | null {
  if (typeof rule.highlight === 'function') return rule.highlight(ctx);
  return rule.highlight ?? null;
}

function ruleLine(rule: GuideRule, ctx: DirectorCtx): ObjectiveLine {
  return {
    id: rule.id,
    text: rule.text(ctx),
    keys: rule.keys ?? [],
    urgency: rule.urgency ?? RULE_URGENCY[rule.priority],
    layer: rule.layer,
    highlight: ruleHighlight(rule, ctx),
    source: rule.priority,
  };
}

function flightLine(objective: FlightObjective, ctx: DirectorCtx): ObjectiveLine {
  return {
    id: objective.id,
    text: objective.text,
    keys: objective.keys,
    urgency: objective.urgency,
    // A flight line is the ship's, unless its fix is a file in the mind (F1, F2).
    layer: objective.layer ?? 'ship',
    // Shown in the mind, a repair line lights the way to it: the chip, then the file.
    highlight: objective.repairs ? repairStepTarget(ctx.state.ui.activeTool?.kind ?? null, objective.repairs) : null,
    source: 'flight',
    warn: objective.warn === true,
  };
}

// The landing table's line on the strip: its own layer; a REPAIR row (L1) lights the chip, then the file, as F1 does.
function landingLine(objective: LandingObjective, ctx: DirectorCtx): ObjectiveLine {
  const held = ctx.state.ui.activeTool?.kind ?? null;
  return {
    id: objective.id,
    text: objective.text,
    keys: objective.keys,
    urgency: objective.urgency,
    layer: objective.layer,
    highlight: objective.repairs ? repairStepTarget(held, objective.repairs) : objective.highlight ?? null,
    source: 'landing',
    warn: objective.warn === true,   // L2's flight row in its warning colour (slice 1b)
  };
}

function isRuleLive(rule: GuideRule, ctx: DirectorCtx): boolean {
  return !(rule.once && ctx.done.has(rule.id)) && rule.activeWhen(ctx);
}

// The lesson a rule words (GuideRule.lesson; a rule without one is its own).
export function lessonOf(rule: GuideRule): string {
  return rule.lesson ?? rule.id;
}

// Every wording of `rule`'s lesson in `rules` (itself included). The rule lists are fixed tables, so each one's
// lessons are grouped once: the one-shot checks ask this for every rule on every tick.
const lessonsByRules = new WeakMap<readonly GuideRule[], Map<string, GuideRule[]>>();
function wordingsOf(rules: readonly GuideRule[], rule: GuideRule): readonly GuideRule[] {
  let lessons = lessonsByRules.get(rules);
  if (lessons === undefined) {
    lessons = new Map();
    for (const candidate of rules) {
      const group = lessons.get(lessonOf(candidate));
      if (group) group.push(candidate);
      else lessons.set(lessonOf(candidate), [candidate]);
    }
    lessonsByRules.set(rules, lessons);
  }
  const wordings = lessons.get(lessonOf(rule));
  if (wordings === undefined) throw new Error(`director: rule '${rule.id}' is not in the rule list it was checked against`);
  return wordings;
}

function outranksLeadIn(rule: GuideRule, ctx: DirectorCtx): boolean {
  if (rule.outranksLeadIn === undefined) return false;
  return rule.outranksLeadIn === true || rule.outranksLeadIn(ctx);
}

// The line the strip should show now, before hysteresis. Pure: tests drive it with crafted
// contexts and rule lists.
export function composeObjective(ctx: DirectorCtx, rules: readonly GuideRule[]): ObjectiveLine | null {
  if (ctx.phase === 'title') return null;
  const screen = layerOfScreen(ctx.mode);
  if (ctx.phase === 'boot') {
    // While the run-2 ghost speaks, a skip is refused: the strip does not offer one. The same id as the boot's
    // own line, so the switch is not held by the hysteresis (AI time does not run in the boot).
    if (ctx.bootSkipWaits) return { id: 'boot', text: LINES.bootingGhost(), keys: [], urgency: 'wait', layer: 'mind', highlight: null, source: 'boot' };
    return { id: 'boot', text: LINES.booting(), keys: ['SPACE'], urgency: 'wait', layer: 'mind', highlight: null, source: 'boot' };
  }
  const status = ctx.state.burn.status;
  // Phase 3 slice 3a: the DESK's two steps (systems/desk.ts deskSteps: a ship, then SET COURSE ▸ it [ENTER]). The desk
  // screen (components/desk/DeskScreen.ts) shows the same steps in its own guidance strip, with the opening beat and
  // CONTROL's line, over this one; the strip keeps the step so every reader of the objective agrees.
  if (ctx.phase === 'desk') {
    const step = deskSteps(ctx.state).find((candidate) => !candidate.done);
    if (!step) throw new Error('composeObjective: a desk step is always left (SET COURSE)');
    return { id: `desk-${step.id}`, text: step.text, keys: step.id === 'set-course' ? ['ENTER'] : [], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  // Playtest 1 (note 5): LEAVE ORBIT, the salvage before the chart.
  if (ctx.phase === 'leave') {
    return { id: 'leave', text: LEAVE_TEXT.strip, keys: ['ENTER'], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  // WP7: between ships (TRANSMIT) and after the run (RUN END) their screens explain.
  if (ctx.phase === 'transmit') {
    const plan = ctx.state.run.transit;
    if (!plan) throw new Error('composeObjective: TRANSMIT with no transit plan');
    return { id: 'transmit', text: LINES.transmitting(shipSummaryAt(ctx.state.run.map, plan.toSlot).name), keys: [], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  if (ctx.phase === 'end') {
    return { id: 'run-over', text: LINES.runOver(), keys: [], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  // HOLLOW ate the Core (WP6): the ship is over, in flight or while landing; its card explains.
  if (ctx.state.run.coreLost) {
    return { id: 'over-core-lost', text: CORE_LOST_TEXT.title, keys: [], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  if (ctx.phase === 'report') {
    return { id: 'report', text: LINES.landingDone(), keys: [], urgency: 'now', layer: 'mind', highlight: null, source: 'over' };
  }
  // A ship lost in flight, or during its landing (slice 1b: crashed or escaped with the engine open there).
  const lostLanding = ctx.phase === 'landing' && (status === 'crashed' || status === 'escaped');
  if ((ctx.phase === 'flight' && status !== 'approaching') || lostLanding) {
    return { id: `over-${status}`, text: FLIGHT_OVER_LINE[status], keys: [], urgency: 'now', layer: 'ship', highlight: null, source: 'over' };
  }
  if (ctx.flash) {
    const refusal = refusalLine(ctx.flash);
    if (!refusal) throw new Error(`composeObjective: no REFUSAL_LINES entry for '${ctx.flash}'`);
    return { id: `flash-${ctx.flash}`, text: refusal.text, keys: refusal.keys, urgency: 'now', layer: screen, highlight: null, source: 'flash' };
  }
  // Pause is look-only (§6.1): every action line would be refused, so say the one that works.
  if (ctx.state.clock.paused) {
    return { id: 'paused', text: LINES.paused(), keys: ['P'], urgency: 'now', layer: screen, highlight: null, source: 'paused' };
  }
  // BEAM OUT (WP7, §4.3): the bar racing the impact, or a doomed ship no burn can save (no FUEL for it, too
  // late, no engine), outranks every other line: the kid has seconds, and one right move. A doomed ship that a
  // burn, or F2's REPAIR, can still save keeps its flight line; the button is there as the way out.
  if (ctx.phase === 'flight') {
    const beam = beamOutView(ctx.state, ctx.pred);
    if (beam.look === 'beaming') {
      const text = LINES.beaming(percentFloor(beam.progress), beam.impactTac);
      return { id: 'beam-out-beaming', text, keys: [], urgency: 'now', layer: 'ship', highlight: BEAM_OUT_HINT_TARGET, source: 'flight' };
    }
    if (beam.look === 'offered' && beam.hopeless !== null) {
      // In the MIND the button is a screen away: `… — [TAB], press BEAM OUT` with TAB lit (the same row, so the words
      // change at once on a TAB).
      const inMind = screen === 'mind';
      const text = inMind ? LINES.beamOutOfferTab(beam.hopeless) : LINES.beamOutOffer(beam.hopeless);
      return { id: 'beam-out-offer', text, keys: inMind ? ['TAB'] : [], urgency: 'now', layer: 'ship', highlight: BEAM_OUT_HINT_TARGET, source: 'flight' };
    }
  }
  // The landing (01-landing §3.11): its table in the flight line's places.
  if (ctx.phase === 'landing') {
    if (!ctx.landing) throw new Error('composeObjective: no landing objective during the landing');
    return composeLive(ctx, rules, ctx.landing.urgency, landingLine(ctx.landing, ctx));
  }

  // guidance returns null only once the flight is over; anything else is a table bug.
  if (!ctx.flight) throw new Error('composeObjective: no flight objective during a live flight');
  return composeLive(ctx, rules, ctx.flight.urgency, flightLine(ctx.flight, ctx));
}

// The composition of a live ship (plan §1.6), the flight's and the landing's alike: alarm, the objective's `now` line (or
// a preempting tutorial), a lesson's lead-in, mind-urgent, tutorial, the objective's `soon`, hint, the objective's
// `wait`. `objective` is the table's line, already on the strip's terms.
export function composeLive(
  ctx: DirectorCtx, rules: readonly GuideRule[], urgency: Urgency, objective: ObjectiveLine,
): ObjectiveLine {
  const live = (priority: GuidePriority): GuideRule | undefined =>
    rules.find((rule) => rule.priority === priority && isRuleLive(rule, ctx));
  const alarm = live('alarm');
  if (alarm) return ruleLine(alarm, ctx);
  if (urgency === 'now') {
    const preempting = rules.find((rule) => rule.priority === 'tutorial' && rule.preempts?.(ctx) === true && isRuleLive(rule, ctx));
    if (preempting) return ruleLine(preempting, ctx);
    return objective;
  }
  const lesson = rules.find((rule) => rule.priority === 'tutorial' && rule.leadInSec !== undefined
    && (ctx.leadShownSec.get(lessonOf(rule)) ?? 0) < rule.leadInSec && isRuleLive(rule, ctx));
  if (lesson && !rules.some((rule) => rule.priority === 'mind-urgent' && isRuleLive(rule, ctx) && outranksLeadIn(rule, ctx))) {
    return ruleLine(lesson, ctx);
  }
  const urgent = live('mind-urgent');
  if (urgent) return ruleLine(urgent, ctx);
  const tutorial = live('tutorial');
  if (tutorial) return ruleLine(tutorial, ctx);
  if (urgency !== 'wait') return objective;
  const hint = live('hint');
  if (hint) return ruleLine(hint, ctx);
  return objective;
}

// The ids of every wording of the lessons in `done` that are not recorded done yet.
function withWordings(rules: readonly GuideRule[], done: readonly GuideRule[], ctx: DirectorCtx): string[] {
  const ids = new Set<string>();
  for (const rule of done) for (const wording of wordingsOf(rules, rule)) if (!ctx.done.has(wording.id)) ids.add(wording.id);
  return [...ids];
}

// One-shot rules completed this tick: by their own doneWhen (shown or not), or, without one,
// once they were shown and have stopped being active; a lesson's wordings complete together (see the header).
// `everShown` remembers which one-shot lessons have been on the strip (the director keeps it across ticks).
export function completedOneShots(
  rules: readonly GuideRule[], ctx: DirectorCtx, shownId: string | null, everShown: Set<string>,
): string[] {
  const done: GuideRule[] = [];
  for (const rule of rules) {
    if (!rule.once || ctx.done.has(rule.id)) continue;
    if (rule.doneWhen) {
      if (rule.doneWhen(ctx)) done.push(rule);
      continue;
    }
    const lesson = lessonOf(rule);
    const wordings = wordingsOf(rules, rule);
    if (wordings.some((wording) => wording.id === shownId)) everShown.add(lesson);
    else if (everShown.has(lesson) && !wordings.some((wording) => wording.activeWhen(ctx))) done.push(rule);
  }
  return withWordings(rules, done, ctx);
}

// One-shot lessons with a maxShownSec that have now been on the strip that long, all their wordings together.
// `shownSec` keeps each lesson's AI seconds on the strip so far (the director keeps it across ticks).
export function outlivedOneShots(
  rules: readonly GuideRule[], shownId: string | null, dtAi: number, shownSec: Map<string, number>,
): string[] {
  const rule = shownId === null ? undefined : rules.find((candidate) => candidate.id === shownId);
  if (!rule?.once || rule.maxShownSec === undefined) return [];
  const lesson = lessonOf(rule);
  const total = (shownSec.get(lesson) ?? 0) + dtAi;
  shownSec.set(lesson, total);
  return total >= rule.maxShownSec ? wordingsOf(rules, rule).map((wording) => wording.id) : [];
}

// A countdown's digits are a per-tick value, not a new instruction.
const DIGITS = /\d+/g;

// What makes a NEW line on the strip: the instruction, its words, keys, urgency, layer and warning
// colour, but not its numbers. The same line with a ticking m:ss changes 13–20 times a wall second under
// SKIP, and a store.update per tick would fan out to every subscriber (§9 tick discipline):
// the memory view's detail panel rebuilds its buttons and swallows clicks. So a structural
// change is an update (the strip retypes, the TAB glow follows), and new numbers are only
// mutated into director.shown; the strip patches them in place from its per-tick paint.
// (§6.3 says "update when the id or text changes"; read with §9, the text means its words.
// A rule whose line should retype for a new number, a different pod say, needs its own id.)
export function objectiveStructure(line: ObjectiveLine | null): string {
  if (!line) return '';
  return `${line.id}|${line.text.replace(DIGITS, '#')}|${line.urgency}|${line.layer}|${line.keys.join(',')}|${line.highlight}|${line.source}|${line.warn === true}`;
}

export function sameObjectiveStructure(a: ObjectiveLine | null, b: ObjectiveLine | null): boolean {
  return objectiveStructure(a) === objectiveStructure(b);
}

export interface DirectorCtxInputs {
  events: ReadonlySet<GameEventName>;
  phaseEntered: RunPhase | null;
  mindQuietSec: number;
  flash: string | null;
  leadShownSec?: ReadonlyMap<string, number>;  // none yet when left out
}

// `pred` is the true prediction (beats, line vars); guidance reads `sensed`, what the instruments
// show (predict.ts getSensedPrediction; the same object while Sensor Interp is ok).
export function buildDirectorCtx(
  state: Readonly<GameState>, pred: Prediction, inputs: DirectorCtxInputs, sensed: Prediction = pred,
): DirectorCtx {
  const flying = state.run.phase === 'flight';
  const flightCtx = flying ? buildFlightContext(state, sensed) : null;
  // The landing's table reads the drop cache (mounted with the landing); not once the Core is lost (its card owns it).
  // Its L2 is the flight's row in landing (slice 1b: the engine is open), handed in so landing-guidance stays pure.
  // Nor once the ship has left orbit during it (crashed, escaped): its LOST card owns it too.
  const landingLive = state.burn.status === 'locked' || state.burn.status === 'accepted';
  const landingCtx = state.run.phase === 'landing' && !state.run.coreLost && landingLive
    ? buildLandingContext(state, getDropSolution(), fastForwardBlockReason(state, sensed) === null, landingFlightOf(state, sensed)) : null;
  const landing = landingCtx ? landingObjective(landingCtx) : null;
  return {
    state,
    pred,
    caps: capabilitiesNow(state),
    phase: state.run.phase,
    mode: state.ui.mode,
    flight: flightCtx ? flightObjective(flightCtx) : null,
    landing,
    skipAvailable: flightCtx?.skipAvailable ?? landingCtx?.skipAvailable ?? false,
    bootSkipWaits: bootSkipWaits(state),
    events: inputs.events,
    phaseEntered: inputs.phaseEntered,
    mindQuietSec: inputs.mindQuietSec,
    leadShownSec: inputs.leadShownSec ?? new Map(),
    mindAlert: mindAlertActive(state),
    flash: inputs.flash,
    done: new Set(state.director.done),
    vars: { ...lineVars(state, pred), nextLz: landing?.nextLz ?? '' },
  };
}

// --- The live director ---------------------------------------------------------------------

const filter = createObjectiveFilter<ObjectiveLine>({ holdsAgainst: releaseHolds, passesAt: dodgeCountdownEnds });
const pendingEvents = new Set<GameEventName>();
let lastPhase: RunPhase | null = null;
let mindQuietSec = 0;
let flash: { reason: string; leftSec: number } | null = null;
// The one-shot lessons that have been on the strip, and each one's AI seconds there (lessonOf: all its wordings together).
const shownOnceLessons = new Set<string>();
const shownSecByLesson = new Map<string, number>();
// AI seconds each lead-in lesson (lessonOf, all its wordings together) has been on the strip on this ship.
const leadShownSec = new Map<string, number>();

function resetDirector(): void {
  filter.reset();
  pendingEvents.clear();
  lastPhase = null;
  mindQuietSec = 0;
  flash = null;
  shownOnceLessons.clear();
  shownSecByLesson.clear();
  leadShownSec.clear();
}

let mounted = false;

export function mountDirector(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountDirector: already mounted');
  mounted = true;

  // Events only mark what happened; the tick below acts on them (never inside an emit).
  const offEvents = onAny((name, payload) => {
    pendingEvents.add(name);
    if (name === 'refused') {
      const reason = (payload as { reason: string }).reason;
      if (refusalLine(reason)) flash = { reason, leftSec: REFUSAL_FLASH_SEC };
    }
    // A refusal explains what went wrong on the screen the kid was on. After a switch it is
    // stale, and the one that matters most (SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]) has
    // just been obeyed: show the real line at once, not "press TAB" again.
    if (name === 'mode-change') flash = null;
  });

  const offTick = onPostTick((dtWall, dtAi) => {
    const state = store.getState();
    const pred = getPrediction();

    const phaseEntered = state.run.phase !== lastPhase ? state.run.phase : null;
    lastPhase = state.run.phase;
    // Explanations of refused inputs are input feedback: they time out in wall seconds, even
    // while paused.
    if (flash) {
      flash.leftSec -= dtWall;
      if (flash.leftSec <= 0) flash = null;
    }
    const quiet = state.ui.mode === 'memory' && getOps().length === 0 && !mindAlertActive(state);
    mindQuietSec = quiet ? mindQuietSec + dtAi : 0;

    const events = new Set(pendingEvents);
    pendingEvents.clear();
    const ctx = buildDirectorCtx(
      state, pred, { events, phaseEntered, mindQuietSec, flash: flash?.reason ?? null, leadShownSec }, getSensedPrediction(),
    );

    // Beats: speak, then record one-shots.
    const newlyDone: string[] = [];
    for (const beat of BEATS) {
      if (beat.once && ctx.done.has(beat.id)) continue;
      if (!beat.when(ctx)) continue;
      for (const line of beat.lines) {
        say(line.speaker, line.text(ctx), { critical: line.critical === true, quip: line.quip === true });
      }
      if (beat.once) newlyDone.push(beat.id);
    }

    // The coast began (the flight's own line says WAIT for the first time): the coast-tied licences
    // (KESTREL's MOVE) and wakes key on it (WP7). A plain number nobody subscribes to.
    if (ctx.flight?.urgency === 'wait' && state.burn.coastAtAi === null) {
      const at = state.clock.aiSec;
      store.mutate((draft) => { draft.burn.coastAtAi = at; });
    }

    const candidate = composeObjective(ctx, GUIDE_RULES);
    const shown = filter.next(candidate, dtAi);
    const shownRule = shown === null ? undefined : GUIDE_RULES.find((rule) => rule.id === shown.id);
    if (shownRule?.leadInSec !== undefined) {
      const lessonShown = lessonOf(shownRule);
      leadShownSec.set(lessonShown, (leadShownSec.get(lessonShown) ?? 0) + dtAi);
    }

    newlyDone.push(...completedOneShots(GUIDE_RULES, ctx, shown?.id ?? null, shownOnceLessons));
    // The hysteresis can keep a just-retired line up a moment longer: record it once, not per tick.
    for (const id of outlivedOneShots(GUIDE_RULES, shown?.id ?? null, dtAi, shownSecByLesson)) {
      if (!ctx.done.has(id)) newlyDone.push(id);
    }

    const current = store.getState().director.shown;
    const structural = !sameObjectiveStructure(shown, current);
    const numbers = !structural && shown?.text !== current?.text;
    if (structural || newlyDone.length > 0) {
      store.update((draft) => {
        if (structural || numbers) draft.director.shown = shown;
        for (const id of newlyDone) if (!draft.director.done.includes(id)) draft.director.done.push(id);
      });
    } else if (numbers) {
      store.mutate((draft) => { draft.director.shown = shown; });
    }
  });

  const offReset = onWorldReset('director', resetDirector, () => ({
    pending: pendingEvents.size, lastPhase, mindQuietSec, flash, shownOnce: shownOnceLessons.size, shownSec: shownSecByLesson.size,
    leadShown: leadShownSec.size,
  }));
  return () => { offEvents(); offTick(); offReset(); mounted = false; };
}
