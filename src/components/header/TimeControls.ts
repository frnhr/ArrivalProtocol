import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { getDropSolution } from '@systems/drop-cache';
import { togglePause, requestSkip, registerTimeKeys, setDebugWarp } from '@systems/pace';
import { countdownChip, paceLabel, skipButton, formatWarp, headerCrumbs, overclockBadge, nextHazard } from '@systems/flight-hud';
import { toggleMuted, isMuted, onMuteChange } from '@systems/audio';
import { requireById, replayAnimation } from '@components/dom';
import { isDebugMode } from '@/debug';
import { DEBUG_WARP_MAX } from '@data/tuning';

// Header time controls (§6.1, §7.1). The director (systems/pace.ts) owns the warp; the player
// only ever pauses or asks to SKIP:
//   • the pace label: TACTICAL ×20 / CRUISE ×60 / SKIP ▸▸ ×871 / OVERCLOCK ×¼ (in blue while
//     something is happening: the ship slows to a quarter, the mind keeps full speed);
//   • the main countdown chip: IMPACT, the next burn, or ▼/▲, in tactical seconds, with ▸▸
//     while the world runs faster than real time, ×¼ under OVERCLOCK, and red at ≤ 30;
//   • on a phone, the next hazard beside it (`DEBRIS C? 03:41`, WP12 review): the strip's upcoming list has no room there;
//   • ❚❚ (P): the look-only pause;
//   • ▸▸ SKIP (F): struck out, with the reason next to it, whenever a skip would be refused;
//   • ♪ (M): sound on/off for the session;
//   • ◐: reduced motion on/off for the session (ui.reducedMotion, §7.3).
// The crumbs on the left are live too: UNIT-047 / ARES-VII / IMPACT COURSE, FLYBY, GET READY,
// CAPTURED … (§7.1), and so is the browser tab's title (UNIT-047 · ARES-VII, §9 WP12 item 4), so a
// kid who tabbed away sees which unit and ship are waiting. The old ×10 ladder survives only behind
// ?debug (it writes clock.debugWarp).

// How long a refused SKIP stays flashed (matches the skip-refused keyframes in game.css).
const REFUSED_FLASH_MS = 600;

function formatClock(tSec: number): string {
  const whole = Math.floor(tSec);
  const hours = String(Math.floor(whole / 3600)).padStart(5, '0');
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
  const seconds = String(whole % 60).padStart(2, '0');
  return `T+ ${hours}:${minutes}:${seconds}`;
}

export function mountTimeControls(store: Store<GameState>): () => void {
  const paceEl = requireById('paceLabel');
  const chipEl = requireById('countdownChip');
  const chipLabel = requireById('cdLabel');
  const chipTime = requireById('cdTime');
  const chipFastForward = requireById('cdFastForward');
  const chipSlow = requireById('cdSlow');
  const hazardEl = requireById('hazardChip');
  chipSlow.textContent = overclockBadge();
  const pauseBtn = requireById<HTMLButtonElement>('speedPause');
  const skipBtn = requireById<HTMLButtonElement>('skipBtn');
  const skipReasonEl = requireById('skipReason');
  const ladder = requireById('debugLadder');
  const autoBtn = requireById<HTMLButtonElement>('speedReal');
  const upBtn = requireById<HTMLButtonElement>('speedUp');
  const downBtn = requireById<HTMLButtonElement>('speedDown');
  const ladderReadout = requireById('speedMult');
  const clockEl = requireById('clock');
  const muteBtn = requireById<HTMLButtonElement>('muteBtn');
  const motionBtn = requireById<HTMLButtonElement>('motionBtn');
  const crumbUnit = requireById('crumbUnit');
  const crumbWave = requireById('crumbWave');
  const crumbShip = requireById('crumbShip');
  const crumbPhase = requireById('crumbPhase');

  const debug = isDebugMode();
  ladder.hidden = !debug;

  // A refused SKIP (button or F) flashes the struck-out button and its reason so the reason
  // gets read. Wall-clock timing is fine here: it is input feedback, not game logic, and it
  // must also end under reduced motion, where the shake animation is off.
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  const flashRefused = (): void => {
    replayAnimation(skipBtn, 'refused');
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { skipBtn.classList.remove('refused'); flashTimer = null; }, REFUSED_FLASH_MS);
  };
  const paintMute = (muted: boolean): void => {
    muteBtn.classList.toggle('muted', muted);
    muteBtn.title = muted ? 'Sound is off (M)' : 'Sound is on (M)';
    muteBtn.setAttribute('aria-label', muted ? 'sound off' : 'sound on');
  };
  paintMute(isMuted());
  const offMute = onMuteChange(paintMute);
  const onMuteClick = (): void => toggleMuted();
  muteBtn.addEventListener('click', onMuteClick);

  const paintMotion = (reduced: boolean): void => {
    motionBtn.classList.toggle('active', reduced);
    motionBtn.title = reduced ? 'Reduced motion is on: no shake, flashes or pulses' : 'Reduced motion is off';
    motionBtn.setAttribute('aria-pressed', String(reduced));
  };
  paintMotion(store.getState().ui.reducedMotion);
  const unsubMotion = store.subscribe((s) => s.ui.reducedMotion, paintMotion);
  const onMotionClick = (): void => store.update((draft) => { draft.ui.reducedMotion = !draft.ui.reducedMotion; });
  motionBtn.addEventListener('click', onMotionClick);

  const onPause = (): void => { togglePause(store); };
  const onSkip = (): void => { if (!requestSkip(store).ok) flashRefused(); };
  pauseBtn.addEventListener('click', onPause);
  skipBtn.addEventListener('click', onSkip);
  const offKeys = registerTimeKeys(store, { onSkipRefused: flashRefused });

  // --- ?debug ladder (decades between ×1 and DEBUG_WARP_MAX) ---
  const onAuto = (): void => setDebugWarp(store, null);
  const onUp = (): void => {
    const clock = store.getState().clock;
    const base = clock.debugWarp ?? Math.max(1, clock.speedTarget);
    setDebugWarp(store, Math.min(DEBUG_WARP_MAX, Math.pow(10, Math.floor(Math.log10(base)) + 1)));
  };
  const onDown = (): void => {
    const clock = store.getState().clock;
    const base = clock.debugWarp ?? Math.max(1, clock.speedTarget);
    setDebugWarp(store, Math.max(1, Math.pow(10, Math.ceil(Math.log10(base)) - 1)));
  };
  if (debug) {
    autoBtn.addEventListener('click', onAuto);
    upBtn.addEventListener('click', onUp);
    downBtn.addEventListener('click', onDown);
  }

  // Patch text and classes only when they change: this runs at 20 Hz.
  const last = { pace: '', chip: '', hazard: '', skip: '', ladder: '', clock: '', crumbs: '' };

  function paint(): void {
    const state = store.getState();
    // The crumbs and the countdown read what the instruments show (WP4); SKIP reads the truth,
    // because that is what pace (the only SKIP rule) acts on.
    const pred = getSensedPrediction();
    const truth = getPrediction();

    const crumbs = headerCrumbs(state, pred);
    const crumbsKey = `${crumbs.unit}|${crumbs.wave}|${crumbs.ship}|${crumbs.phase.text}|${crumbs.phase.tone}`;
    if (crumbsKey !== last.crumbs) {
      last.crumbs = crumbsKey;
      crumbUnit.textContent = crumbs.unit;
      crumbWave.textContent = crumbs.wave;
      crumbShip.textContent = crumbs.ship;
      crumbPhase.textContent = crumbs.phase.text;
      crumbPhase.className = `crumb phase tone-${crumbs.phase.tone}`;
      document.title = `${crumbs.unit} · ${crumbs.ship}`;
    }

    const pace = paceLabel(state);
    if (pace !== last.pace) {
      paceEl.textContent = pace;
      paceEl.classList.toggle('overclock', state.clock.overclock && !state.clock.paused);
      last.pace = pace;
    }

    // While landing the chip counts the next window (01-landing §4), from the drop solution.
    const chip = countdownChip(state, pred, state.run.phase === 'landing' ? getDropSolution() : null);
    const chipKey = chip ? `${chip.label}|${chip.time}|${chip.urgent}|${chip.fastForward}|${chip.slow}|${chip.kind}` : '';
    if (chipKey !== last.chip) {
      last.chip = chipKey;
      chipEl.hidden = chip === null;
      if (chip) {
        chipLabel.textContent = chip.label;
        chipTime.textContent = chip.time;
        chipFastForward.hidden = !chip.fastForward;
        chipSlow.hidden = !chip.slow;
        chipEl.classList.toggle('urgent', chip.urgent);
        chipEl.dataset.kind = chip.kind;
      }
    }

    // The next hazard (a phone shows it here; the stylesheet hides it on a desktop, where the strip lists it).
    const hazard = nextHazard(state, pred);
    if (hazard !== last.hazard) {
      last.hazard = hazard;
      hazardEl.hidden = hazard === '';
      hazardEl.textContent = hazard;
    }

    const skip = skipButton(state, truth);
    const skipKey = `${skip.active}|${skip.blockedReason}`;
    if (skipKey !== last.skip) {
      last.skip = skipKey;
      skipBtn.classList.toggle('active', skip.active);
      skipBtn.classList.toggle('blocked', skip.blockedReason !== null);
      // Glows while a skip is available, so a kid waiting out a coast discovers it.
      skipBtn.classList.toggle('ready', !skip.active && skip.blockedReason === null);
      skipBtn.title = skip.active
        ? 'Skipping to the next event'
        : skip.blockedReason ?? 'Skip ahead to the next event (F)';
      skipReasonEl.textContent = skip.blockedReason ?? (skip.active ? 'SKIPPING…' : '');
    }

    pauseBtn.classList.toggle('active', state.clock.paused);

    if (debug) {
      const ladderKey = `${state.clock.debugWarp}|${formatWarp(state.clock.speed)}`;
      if (ladderKey !== last.ladder) {
        last.ladder = ladderKey;
        ladderReadout.textContent = formatWarp(state.clock.speed);
        autoBtn.classList.toggle('active', state.clock.debugWarp === null);
        upBtn.disabled = (state.clock.debugWarp ?? 0) >= DEBUG_WARP_MAX;
        downBtn.disabled = state.clock.debugWarp !== null && state.clock.debugWarp <= 1;
      }
    }

    const clockText = formatClock(state.clock.tSec);
    if (clockText !== last.clock) { clockEl.textContent = clockText; last.clock = clockText; }
  }

  // Ticks paint the live countdown; ticks stop while paused or after the flight, so the
  // discrete changes (pause, pace, skip, firing, status) repaint directly.
  const unsub = store.subscribe(
    (s) => `${s.run.phase}|${s.clock.paused}|${s.clock.pace}|${s.clock.overclock}|${s.clock.skipWarp}|${s.clock.debugWarp}|${s.clock.speedTarget}|${s.burn.firing}|${s.burn.status}`,
    () => paint(),
  );
  const offTick = onGameTick(() => paint());
  paint();

  return () => {
    muteBtn.removeEventListener('click', onMuteClick);
    motionBtn.removeEventListener('click', onMotionClick);
    unsubMotion();
    offMute();
    pauseBtn.removeEventListener('click', onPause);
    skipBtn.removeEventListener('click', onSkip);
    if (flashTimer !== null) clearTimeout(flashTimer);
    if (debug) {
      autoBtn.removeEventListener('click', onAuto);
      upBtn.removeEventListener('click', onUp);
      downBtn.removeEventListener('click', onDown);
    }
    offKeys();
    unsub();
    offTick();
  };
}
