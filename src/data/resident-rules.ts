// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §6.2): the strip's corrupted-resident lines
// (`THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`, `BLOCK THE LOCK — SCAN POD 07 (3…)`, `POD 07 LOCKED — DELETE
// or REPAIR WARDEN.sys`). data/script.ts spreads RESIDENT_RULES into GUIDE_RULES right before GHOST_ALARM_RULES (the
// FOUNDATION's one line there), so a resident's line sits where the engine's alarm lines do and WARDEN never edits
// script.ts. The strip never names a sleeper or a departed resident's files (plan R21). Others ask by message.
import type { GameState } from '@state/schema';
import type { DirectorCtx, GuideRule, TextCtx } from '@systems/director';
import { isLivePhase } from '@systems/clock';
import { GHOST_ALARM_ID } from '@systems/alerts';
import { residentFile, lockedDrivers, lockSecondsLeft } from '@state/resident-selectors';
import { WARDEN_TEXT } from '@data/warden-text';
import { TOOL_HINT_TARGET } from '@data/fs-tools';
import { GHOST_LESSON_SHOW_SEC } from '@data/tuning';

// Every line is one wording per screen: in amber the way to the MIND first ([TAB]), in blue the tool's chip lit until a
// tool is in hand. The words are data/warden-text.ts's.
// • THE ALARM (priority alarm, beside the engine's own): the resident's first burst, while ghost-thrust.ts's alarm stands
//   with its word (`THE SHIP'S AI IS FIRING THE ENGINE`): where the cause is. On the late surprise it is the strip's first
//   word about it (04 §3.12: the strip names rack A at once).
// • THE LOCK (mind-urgent, before a lesson's lead-in, as a HOLLOW verb is): a lock counting down, and the cheap block.
// • A LOCKED POD (tutorial): a pod held, and the two ways to free it (SCAN first on a `reported faulty` ship, R25).
// • ITS LESSON (tutorial, once): after the alarm, the way to the cause stays a while (GHOST_LESSON_SHOW_SEC), until the kid
//   is at the file or it stops.
// A template is rendered by the tests with no state (TextCtx only: the corpus and the words checks); then it says its
// worst case (POD 16, the longest resident name, the longest countdown).

const WORST_NAME = 'STEWARD';
const WORST_POD = 16;
const WORST_SEC = 9;

function stateOf(ctx: TextCtx): Readonly<GameState> | null {
  return (ctx as Partial<DirectorCtx>).state ?? null;
}

function inAmber(ctx: DirectorCtx): boolean {
  return ctx.mode === 'tools';
}

function nameOf(state: Readonly<GameState> | null): string {
  return state?.resident.def?.name ?? WORST_NAME;
}

// A live ship (a crash course is DON'T HIT THE PLANET's: the alarm lines yield to it, as the engine's own do).
function live(ctx: DirectorCtx): boolean {
  return isLivePhase(ctx.state) && ctx.pred.outcome !== 'impact';
}

// The engine's alarm stands for the resident's own first burst (ghost-thrust.ts words it by its cause).
function alarmLive(ctx: DirectorCtx): boolean {
  return live(ctx) && ctx.state.alerts.list.some((alert) => alert.id === GHOST_ALARM_ID && alert.text === WARDEN_TEXT.alarm);
}

function lockOf(ctx: TextCtx): { pod: number; sec: number } {
  const lock = stateOf(ctx)?.resident.corrupted?.lock ?? null;
  return lock === null ? { pod: WORST_POD, sec: WORST_SEC } : { pod: lock.pod, sec: lockSecondsLeft(lock.leftSec) };
}

function lockLive(ctx: DirectorCtx): boolean {
  return isLivePhase(ctx.state) && ctx.state.resident.corrupted?.lock != null;
}

// The pod it holds first (address order), while it is still awake: an ACCEPT, the cure and DELETE release every lock.
function lockedPod(state: Readonly<GameState> | null): number {
  if (state === null) return WORST_POD;
  const name = state.resident.def?.name;
  return lockedDrivers(state).find((driver) => driver.lockedBy === name)?.pod ?? WORST_POD;
}

function lockedLive(ctx: DirectorCtx): boolean {
  const state = ctx.state;
  return isLivePhase(state) && state.resident.corrupted?.phase === 'awake' && state.landing.ended === null
    && lockedDrivers(state).some((driver) => driver.lockedBy === state.resident.def?.name);
}

function scanned(state: Readonly<GameState> | null): boolean {
  return state === null ? true : residentFile(state)?.scanned === true;
}

function firingLive(ctx: DirectorCtx): boolean {
  const corrupted = ctx.state.resident.corrupted;
  return live(ctx) && ctx.state.run.phase === 'flight' && corrupted?.phase === 'awake' && corrupted.bursts > 0
    && residentFile(ctx.state) !== null;
}

// The tool chip to light while no tool is in hand.
function chip(ctx: DirectorCtx, kind: 'scan' | 'delete'): string | null {
  return ctx.state.ui.activeTool === null ? TOOL_HINT_TARGET[kind] : null;
}

const FIRING_LESSON = 'resident-firing';

export const RESIDENT_RULES: readonly GuideRule[] = [
  {
    id: 'alarm-resident-tab',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && inAmber(ctx),
    text: () => WARDEN_TEXT.stripAlarmTab,
    keys: ['TAB'],
  },
  {
    id: 'alarm-resident',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && !inAmber(ctx),
    text: () => WARDEN_TEXT.stripAlarm,
  },
  {
    id: 'resident-lock-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => lockLive(ctx) && inAmber(ctx),
    text: (ctx) => { const { pod, sec } = lockOf(ctx); return WARDEN_TEXT.stripLockTab(pod, sec); },
    keys: ['TAB'],
  },
  {
    id: 'resident-lock',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => lockLive(ctx) && !inAmber(ctx),
    text: (ctx) => { const { pod, sec } = lockOf(ctx); return WARDEN_TEXT.stripLock(pod, sec); },
    highlight: (ctx) => chip(ctx, 'scan'),
  },
  {
    id: 'resident-locked-tab',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => lockedLive(ctx) && inAmber(ctx),
    text: (ctx) => WARDEN_TEXT.stripLockedTab(lockedPod(stateOf(ctx)), nameOf(stateOf(ctx))),
    keys: ['TAB'],
  },
  {
    id: 'resident-locked',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => lockedLive(ctx) && !inAmber(ctx),
    text: (ctx) => {
      const state = stateOf(ctx);
      return scanned(state) ? WARDEN_TEXT.stripLocked(lockedPod(state), nameOf(state)) : WARDEN_TEXT.stripLockedScan(lockedPod(state), nameOf(state));
    },
    highlight: (ctx) => chip(ctx, scanned(ctx.state) ? 'delete' : 'scan'),
  },
  {
    id: 'tut-resident-firing-tab',
    lesson: FIRING_LESSON,
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: GHOST_LESSON_SHOW_SEC,
    activeWhen: (ctx) => firingLive(ctx) && inAmber(ctx),
    text: (ctx) => WARDEN_TEXT.stripFiringTab(nameOf(stateOf(ctx))),
    keys: ['TAB'],
    doneWhen: (ctx) => ctx.state.ui.selectedId === residentFile(ctx.state)?.id,
  },
  {
    id: 'tut-resident-firing',
    lesson: FIRING_LESSON,
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: GHOST_LESSON_SHOW_SEC,
    activeWhen: (ctx) => firingLive(ctx) && !inAmber(ctx),
    text: (ctx) => {
      const state = stateOf(ctx);
      return scanned(state) ? WARDEN_TEXT.stripFiring(nameOf(state)) : WARDEN_TEXT.stripFiringScan(nameOf(state));
    },
    highlight: (ctx) => chip(ctx, scanned(ctx.state) ? 'delete' : 'scan'),
    doneWhen: (ctx) => ctx.state.ui.selectedId === residentFile(ctx.state)?.id,
  },
];
