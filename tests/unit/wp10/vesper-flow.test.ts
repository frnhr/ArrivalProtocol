// WP10 acceptance 2 (the follower part) and item 2's DOM-free logic (§9 WP10), headless with every DOM-free system:
// • the ship's FIRST uncommanded burst: the alarm `UNCOMMANDED THRUST` (an alarm alert: the klaxon, the red vignette),
//   the strip's alarm line, TACTICAL during the burst, SWAP licensed in that moment; a SKIP running then lands on the
//   burst's start (the only burst that stops a SKIP);
// • LATER bursts: no new alarm (no klaxon), no pace change (the world stays at CRUISE through them), a warning counter
//   `UNCOMMANDED THRUST ×n`;
// • after the second burst the lesson: in amber `THE ENGINE IS FIRING BY ITSELF — click the THRUST CTRL pip` (lighting
//   the pip), in the MIND `… SWAP THRUST CTRL to Thrust.alt` (lighting SWAP, then the file); a SWAP silences the engine,
//   ends the counter and the lesson;
// • edge cases: a ghost burst during the lock hold resets it; none while paused; a sticky burst (a dead controller) holds
//   TACTICAL, refuses SKIP, and ends on a SPACE press and release;
// • the strip follower with a scripted pip → SWAP defender (and the WP9 defender for HOLLOW) locks VESPER.
import { check, finish } from '../wp1/harness';
import { createHarness10 } from './harness10';
import { skipBlockReason } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { setPaused } from '@systems/clock';
import { setMode } from '@systems/mode';
import { stateFromElements } from '@/types/orbit';
import { GHOST_ALARM_ID, GHOST_WARN_ID } from '@systems/alerts';
import { GHOST_TEXT } from '@data/ghost-text';
import { pipHintTarget, fileHintTarget, TOOL_HINT_TARGET } from '@data/fs-tools';
import { hasIntegrity } from '@state/selectors';

const h = createHarness10(21);
const state = () => h.store.getState();
const alert = (id: string) => state().alerts.list.find((entry) => entry.id === id);
const shownId = () => state().director.shown?.id ?? '';
const setThrustIntegrity = (integrity: number): void => {
  h.store.update((d) => {
    for (const seg of d.memory) if (seg.role === 'thrust-ctrl' && hasIntegrity(seg)) seg.integrity = integrity;
    d.ui.memoryRev++;
  });
};

// --- The first burst: a SKIP lands on it, then the alarm ------------------------------------------------------------
{
  h.vesper(21, { hollowAsleep: true });
  h.step();
  check('VESPER opens on a WAIT with SKIP offered (HOLLOW asleep here)', /^WAIT/.test(state().director.shown?.text ?? '')
    && skipBlockReason(state(), getPrediction()) === null, state().director.shown?.text);
  h.press('KeyF');
  let landedAt: number | null = null;
  h.stepUntil(() => {
    const clock = state().clock;
    if (clock.skipWarp !== null && clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) landedAt = clock.tSec;
    return state().burn.ghostBursts > 0;
  }, 60);
  const ghost = state().burn.ghost;
  check('a SKIP lands exactly on the first burst\'s start', landedAt !== null && ghost !== null && Math.abs(ghost.startTSec - landedAt) < 1e-6,
    `landed ${landedAt} burst ${ghost?.startTSec}`);
  h.step();
  check('the first burst: the alarm UNCOMMANDED THRUST (klaxon), TACTICAL during it', alert(GHOST_ALARM_ID)?.severity === 'alarm'
    && alert(GHOST_ALARM_ID)?.text === GHOST_TEXT.alarm && state().clock.pace === 'tactical');
  check('…the strip\'s alarm line', state().director.shown?.text === GHOST_TEXT.alarmLine && state().director.shown?.urgency === 'now',
    state().director.shown?.text);
  check('…SWAP is licensed with it', state().run.licences.includes('swap') && h.events.some((event) => event.name === 'licence'
    && (event.payload as { kind: string }).kind === 'swap'));
  check('…SKIP refused during it', skipBlockReason(state(), getPrediction()) !== null);
  h.stepUntil(() => alert(GHOST_ALARM_ID) === undefined, 10);
  check('the alarm clears after the burst (it stood ≥ 3 AI s), and the counter takes over: UNCOMMANDED THRUST ×1',
    alert(GHOST_WARN_ID)?.severity === 'warn' && alert(GHOST_WARN_ID)?.text === GHOST_TEXT.counter(1) && alert(GHOST_WARN_ID)?.inhibitsSkip === false);
}

// --- Later bursts: no klaxon, no pace change, the counter --------------------------------------------------------------
{
  const alarmsBefore = h.events.filter((event) => event.name === 'ghost-start').length;
  let paceDuring: string[] = [];
  let newAlarm = false;
  const warnTexts = new Set<string>();
  h.stepUntil(() => {
    if (state().burn.ghost !== null && state().clock.skipWarp === null) paceDuring.push(state().clock.pace);
    if (alert(GHOST_ALARM_ID) !== undefined) newAlarm = true;
    const warn = alert(GHOST_WARN_ID);
    if (warn) warnTexts.add(warn.text);
    return state().burn.ghostBursts >= 3;
  }, 120);
  h.stepUntil(() => state().burn.ghost === null, 5);
  paceDuring = [...new Set(paceDuring)];
  check('later bursts: no new alarm (no klaxon), the world stays at CRUISE through them', !newAlarm && paceDuring.length > 0
    && paceDuring.every((pace) => pace === 'cruise'), paceDuring.join(','));
  check('…the counter counts them: ×2, ×3', warnTexts.has(GHOST_TEXT.counter(2)) && warnTexts.has(GHOST_TEXT.counter(3)), [...warnTexts].join(' | '));
  check('…each later burst still announced (ghost-start), with its count', h.events.filter((event) => event.name === 'ghost-start').length > alarmsBefore);
}

// --- The lesson after the second burst, pip → SWAP ------------------------------------------------------------------
{
  h.vesper(22, { hollowAsleep: true });
  let pipShown = false;
  h.stepUntil(() => {
    if (shownId() === 'tut-ghost-pip') pipShown = true;
    return pipShown;
  }, 120);
  check('after the second burst, amber: THE ENGINE IS FIRING BY ITSELF — click the THRUST CTRL pip (the pip lit)', pipShown
    && state().burn.ghostBursts >= 2 && state().director.shown?.text === GHOST_TEXT.pipLesson
    && state().director.shown?.highlight === pipHintTarget('thrust-ctrl'), `${state().burn.ghostBursts} ${state().director.shown?.text}`);
  // The pip: the MIND with the file selected (WindowGrip's click does this).
  setMode(h.store, 'memory');
  h.stepFor(0.5);
  check('…in the MIND: SWAP THRUST CTRL to Thrust.alt, lighting SWAP', shownId() === 'tut-ghost-swap'
    && state().director.shown?.text === GHOST_TEXT.swapLesson && state().director.shown?.highlight === TOOL_HINT_TARGET.swap, state().director.shown?.text);
  h.store.update((d) => { d.ui.activeTool = { kind: 'swap', toolSegId: d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap')!.id }; });
  h.stepFor(0.1);
  check('…then, SWAP in hand, the file', state().director.shown?.highlight === fileHintTarget('thrust-ctrl'), String(state().director.shown?.highlight));
  h.store.update((d) => { d.ui.activeTool = null; });
  setMode(h.store, 'tools');
  check('the pip → SWAP defender swaps', h.pipSwap());
  h.stepFor(2.2);
  const bursts = state().burn.ghostBursts;
  h.stepFor(60);
  check('…the engine is silent for good, the counter and the lesson gone', state().burn.ghostBursts === bursts && alert(GHOST_WARN_ID) === undefined
    && state().director.done.includes('tut-ghost-swap') && !shownId().startsWith('tut-ghost'), `${bursts} → ${state().burn.ghostBursts}`);
}

// --- Edge cases ----------------------------------------------------------------------------------------------------
{
  // A burst during the lock hold resets it: VESPER in its ring (a circular orbit at 6,000 km), until a burst comes in
  // the hold.
  let resetSeen = false;
  for (let seed = 30; seed < 90 && !resetSeen; seed++) {
    h.vesper(seed, { hollowAsleep: true });
    const orbit = stateFromElements(6000, 0, 0, 0, state().level.planet.mu);
    h.store.update((d) => { d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; });
    setThrustIntegrity(10);  // dead: a burst every 12 tac s
    for (let i = 0; i < 400 && state().burn.status === 'approaching'; i++) {
      const before = state().burn.lockHoldAiSec;
      h.step();
      if (before > 0 && state().burn.lastTickDvKmS > 0 && state().burn.lockHoldAiSec === 0) { resetSeen = true; break; }
    }
  }
  check('a ghost burst during the lock hold resets it (HOLD STEADY starts over)', resetSeen);

  // None while paused.
  h.vesper(23, { hollowAsleep: true });
  setThrustIntegrity(10);
  setPaused(h.store, true);
  const before = state().burn.ghostBursts;
  h.stepFor(30);
  check('no ghost burst while paused (30 s)', state().burn.ghostBursts === before && state().burn.ghost === null);
  setPaused(h.store, false);

  // A sticky burst (a dead controller): TACTICAL, SKIP refused, ends on SPACE pressed and released.
  let sticky = false;
  for (let seed = 40; seed < 120 && !sticky; seed++) {
    h.vesper(seed, { hollowAsleep: true });
    setThrustIntegrity(10);
    h.stepUntil(() => state().burn.ghost?.sticky === true || state().burn.ghostBursts >= 6, 120);
    sticky = state().burn.ghost?.sticky === true;
  }
  h.stepFor(3);
  check('a sticky burst (dead controller) keeps firing, at TACTICAL, with SKIP refused', sticky && state().burn.ghost?.sticky === true
    && state().clock.pace === 'tactical' && skipBlockReason(state(), getPrediction()) === 'ENGINE FIRING');
  check('…the strip says how to stop it: THE ENGINE IS STUCK FIRING — tap [SPACE] to stop it', state().director.shown?.text === GHOST_TEXT.stuckLine
    || /DON'T HIT THE PLANET/.test(state().director.shown?.text ?? ''), state().director.shown?.text);
  h.keyDown('Space');
  h.step();
  h.keyUp('Space');
  h.step();
  check('…SPACE pressed and released ends it', state().burn.ghost === null);
}

// --- The follower with the pip → SWAP defender locks VESPER --------------------------------------------------------
{
  h.vesper(24);
  const texts = h.flyDefending10(900);
  const swapped = state().memory.some((seg) => seg.name === 'Thrust.old');
  check('the strip follower with the pip → SWAP defender (and the WP9 defender) locks VESPER', h.status() === 'locked' && swapped,
    `${h.status()} swapped ${swapped} bursts ${state().burn.ghostBursts} FUEL ${state().burn.fuelPct.toFixed(1)} | ${texts.slice(-5).join(' | ')}`);
}

finish();
