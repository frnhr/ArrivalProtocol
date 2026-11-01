import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { onPostTick } from '@systems/clock';
import { lockCount } from '@systems/flight-events';
import { requireById, replayAnimation } from '@components/dom';
import { screenFocus } from './focus';
import { LINES, BEAM_OUT_TEXT } from '@data/script';
import {
  LOCK_HOLD_AI_SEC, SHAKE_BURN_PX, SHAKE_FAULT_PX, SHAKE_CRASH_PX, SHAKE_DEBRIS_PX, SHAKE_MS_PER_PX, SHAKE_MIN_MS, SHAKE_MAX_MS, SHAKE_STEPS,
  LINE_TWEEN_MS, SCREEN_FLASH_MS, SHAKE_GHOST_FIRST_PX, SHAKE_GHOST_PX, SHAKE_LAUNCH_PX, SHAKE_BOARD_PX,
} from '@data/tuning';

// Juice (§7.3): the feel, never the information.
// • Screen shake on .desktop-wrap (never <html>: the glitch jerk owns that): a nudge when the
//   engine lights, a jolt when a scripted fault breaks a file (the ENGINE I/O FAULT) or debris hits
//   a rack (WP9), a slam on a crash, and the engine firing by itself (WP10: the ship's first burst slams like
//   debris, every later one kicks); HOLLOW's root landing as it boards (phase 3 slice 2).
// • The red alarm vignette while any alarm is active (an impact under 30 tactical s).
// • HOLD STEADY 3-2-1, the big count over the screen while the lock hold runs, with a bar.
// • The predicted line's colour tween on a state change (red → flyby → green); the ring's
//   breathing while the loop is in it is pure CSS (game.css, .np-ring.hot).
// • A full-screen flash on ORBIT LOCKED (amber) and on a crash (red).
// • BEAM OUT filled: the old ship's windows cut to black (WP7).
// • ui.reducedMotion → body.reduced-motion, which game.css uses to drop shake, scale, flashes
//   and pulses. Colours, words and countdowns never change with it.
// Shake directions are Math.random: cosmetic and deliberately unseeded, like the glitch jerk.

let deskEl: HTMLElement | null = null;
let reduced = false;
// The shakes asked for lately, newest last (?debug `__ap.shakeLog()`: a browser check can't feel a 3 px kick, and the
// animation is gone a few hundred ms later). Kept short; reduced motion still logs what it skipped.
const SHAKE_LOG_KEEP = 20;
const shakeLog: number[] = [];

export function recentShakes(): readonly number[] {
  return shakeLog;
}

export function shake(px: number): void {
  if (!deskEl) throw new Error('shake: mountJuice has not run');
  shakeLog.push(px);
  if (shakeLog.length > SHAKE_LOG_KEEP) shakeLog.splice(0, shakeLog.length - SHAKE_LOG_KEEP);
  if (reduced || px <= 0) return;
  const duration = Math.min(SHAKE_MAX_MS, Math.max(SHAKE_MIN_MS, px * SHAKE_MS_PER_PX));
  const frames: Keyframe[] = [];
  for (let i = 0; i < SHAKE_STEPS; i++) {
    const amplitude = px * (1 - i / SHAKE_STEPS);
    const angle = Math.random() * 2 * Math.PI;
    frames.push({ transform: `translate(${(amplitude * Math.cos(angle)).toFixed(1)}px, ${(amplitude * Math.sin(angle)).toFixed(1)}px)` });
  }
  frames.push({ transform: 'translate(0, 0)' });
  deskEl.animate(frames, { duration, easing: 'linear' });
}

export function mountJuice(store: Store<GameState>): () => void {
  const desk = document.querySelector<HTMLElement>('.desktop-wrap');
  if (!desk) throw new Error('.desktop-wrap missing from index.html');
  deskEl = desk;
  const holdEl = requireById('holdSteady');
  const holdTitle = requireById('holdSteadyTitle');
  const holdSub = requireById('holdSteadySub');
  const holdCount = requireById('holdSteadyCount');
  const holdFill = requireById('holdSteadyFill');
  const flashEl = requireById('screenFlash');
  const plot = requireById('navplotSvg');

  holdTitle.textContent = LINES.holdSteady();
  holdSub.textContent = LINES.holdSteadySub();
  plot.style.setProperty('--line-tween-ms', `${LINE_TWEEN_MS}ms`);
  flashEl.style.setProperty('--flash-ms', `${SCREEN_FLASH_MS}ms`);

  // --- Reduced motion and the alarm vignette: body classes from the store ---
  const paintMotion = (reducedMotion: boolean): void => {
    reduced = reducedMotion;
    document.body.classList.toggle('reduced-motion', reducedMotion);
  };
  paintMotion(store.getState().ui.reducedMotion);
  const unsubMotion = store.subscribe((s) => s.ui.reducedMotion, paintMotion);

  const paintAlarm = (): void => {
    const state = store.getState();
    document.body.classList.toggle('alarm', state.alerts.list.some((alert) => alert.severity === 'alarm'));
  };
  paintAlarm();
  const unsubAlarm = store.subscribe((s) => s.alerts.rev, paintAlarm);

  // --- Screen flash ---
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  const flash = (tone: 'good' | 'danger'): void => {
    if (reduced) return;
    flashEl.dataset.tone = tone;
    flashEl.hidden = false;
    replayAnimation(flashEl, 'run');
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashEl.hidden = true; flashTimer = null; }, SCREEN_FLASH_MS);
  };

  // --- Line colour tween: the whole line starts in the colour it just left ---
  let tweenTimer: ReturnType<typeof setTimeout> | null = null;

  // --- BEAM OUT filled (§5.3 signature 14): the old ship's windows cut to black, `LINK CLOSED` over them,
  // until the next world (a new ship's boot, or a NEW RUN) replaces them. TRANSMIT / RUN END wait for it.
  const toolsView = document.querySelector<HTMLElement>('.desktop .tools-view');
  if (!toolsView) throw new Error('.desktop .tools-view missing from index.html');
  const unsubReset = store.subscribe((s) => s.run.rev, () => {
    document.body.classList.remove('beamed-out');
    delete toolsView.dataset.blackout;
  });

  const offs = [
    on('abandoned', () => {
      toolsView.dataset.blackout = BEAM_OUT_TEXT.blackout;
      document.body.classList.add('beamed-out');
    }),
    on('firing-start', () => shake(SHAKE_BURN_PX)),
    on('file-fault', () => shake(SHAKE_FAULT_PX)),
    // WP9 (§7.3): debris slams into a rack (the rack's rows flash red: components/memory-view/RackZoneMarks).
    on('zone-hit', ({ kind }) => { if (kind === 'debris') shake(SHAKE_DEBRIS_PX); }),
    // WP10 (§7.3): 6 px on the ship's first burst (it also stops a SKIP), 3 px on every later one. A later burst a
    // SKIP flies through does not shake (the lead's ruling on WP10's verify, WP12): up to seven 3 px kicks a second
    // wear a kid out, and the pip's flash and the ignite sound still say it happened.
    on('ghost-start', ({ first, inSkip }) => {
      if (first) shake(SHAKE_GHOST_FIRST_PX);
      else if (!inSkip) shake(SHAKE_GHOST_PX);
    }),
    on('crashed', () => { shake(SHAKE_CRASH_PX); flash('danger'); }),
    // Slice 1a (01-landing §4): a kick per launch, felt at the 2-second rhythm. The streak, the entry flare, the ring's
    // pulse and the touchdown float are the NAV PLOT's (plot-landing.ts), the chip flash LaunchFx's.
    on('pod-launched', () => shake(SHAKE_LAUNCH_PX)),
    // Phase 3 slice 2 (04 §4): HOLLOW's root drops into the bay as the 108% unpack is said (the tear is the glitch
    // driver's, the thud the hollowBoard cue's).
    on('hollow-boarded', () => shake(SHAKE_BOARD_PX)),
    on('locked', () => flash('good')),
    on('line-state', ({ from }) => {
      plot.dataset.tweenFrom = from;
      replayAnimation(plot, 'tween');
      if (tweenTimer !== null) clearTimeout(tweenTimer);
      tweenTimer = setTimeout(() => { plot.classList.remove('tween'); tweenTimer = null; }, LINE_TWEEN_MS);
    }),
    on('lock-count', () => replayAnimation(holdCount, 'pop')),
  ];

  // --- HOLD STEADY 3-2-1, from burn.lockHoldAiSec (mutated per AI tick, so painted per tick) ---
  let lastHoldKey = '';
  const offTick = onPostTick(() => {
    const state = store.getState();
    const live = state.run.phase === 'flight' && state.burn.status === 'approaching';
    const count = live ? lockCount(state.burn.lockHoldAiSec) : null;
    const fillPct = count === null ? 0 : Math.round((100 * state.burn.lockHoldAiSec) / LOCK_HOLD_AI_SEC);
    const key = `${count}|${fillPct}`;
    if (key === lastHoldKey) return;
    lastHoldKey = key;
    if (count !== null && holdEl.hidden) {
      // Centred where the kid is looking when the hold starts (the plot in amber).
      const focus = screenFocus(state.ui.mode);
      holdEl.style.left = `${Math.round(focus.x)}px`;
      holdEl.style.top = `${Math.round(focus.y)}px`;
    }
    holdEl.hidden = count === null;
    if (count !== null) {
      holdCount.textContent = String(count);
      holdFill.style.width = `${fillPct}%`;
    }
  });

  return () => {
    unsubReset();
    unsubMotion();
    unsubAlarm();
    offs.forEach((off) => off());
    offTick();
    if (flashTimer !== null) clearTimeout(flashTimer);
    if (tweenTimer !== null) clearTimeout(tweenTimer);
    deskEl = null;
  };
}
