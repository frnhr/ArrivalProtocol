// WP9 acceptance 5 (§6.10, §9 WP9 item 5): AUTOBURN, headless, on KESTREL.
// • Training: the captures teach the skill (learned offset = half their mean START BURN offset, clamped ±8; ACCURACY
//   100 − 8 × |offset|, within 40..99). (Slice 4: the skill is bought at a desk now; phase 2's install after two captures,
//   its retrain and its reinstall asserts went with that path. The file is given by tests/unit/support/skills.ts.)
// • From KESTREL's geometry after the IN correction, AUTOBURN alone reaches loop-closed with FUEL ≥ 25% for learned
//   offsets −8, 0 and +8: it holds a Core thread (reserveThread) and the throttle (firingSource 'auto'), turns RETRO,
//   fires at the START BURN tick + its offset, and hands back; its captures are no demos. (WP9 fix round 1: it no
//   longer stops the moment the loop closes but flies the capture through, while the plan's next burn is still
//   this RETRO burn: so the FUEL is measured at loop-closed, and the end is the ring or a trim left for later.)
// • The file consumed mid-burn: dropped, `AUTOBURN.skl LOST — MANUAL`, an alarm (the klaxon), the throttle and the
//   thread let go; the alarm clears after AUTOBURN_LOST_ALARM_SEC.
// • With the mode set to blue the burn continues (the only burn the MIND can make), under OVERCLOCK.
// • Edge cases: pause (it takes the throttle again after), a dead engine (dropped, ENGINE NOT RESPONDING), SPACE
//   (a takeover: the player has the throttle, no gap), B again (cancel), the refusals, and (LEAD-2 review round 2) a
//   SKIP inside the window: [B] only stops it; armed, [B] during a SKIP cancels it as its line says (review round 3).
import { byDepth } from '../depth';
import { check, finish } from '../wp1/harness';
import { createHarness9 } from './harness9';
import { autoburnRefusal, engageAutoburn, skillFiles, autoburnFireInTac } from '@systems/autoburn';
import { autoburnDemoSkill } from '@systems/skill-tree';
import { getPrediction } from '@systems/predict';
import { threadsBusy } from '@systems/ops-core';
import { isThrustOn } from '@systems/orbit-sim';
import { setMode } from '@systems/mode';
import { setPaused } from '@systems/clock';
import { infectNow } from '@systems/hollow';
import { ringFit, elementsFromState } from '@/types/orbit';
import { AUTOBURN_TEXT, AUTOBURN_REFUSAL } from '@data/skill-text';
import { AUTOBURN_LOST_ALARM_SEC, AUTO_THREAD_CLAIM_TAC } from '@data/tuning';

const h = createHarness9(5);
const state = () => h.store.getState();
const phase = () => state().burn.auto.phase;
const closed = (): boolean => ringFit(elementsFromState(state().orbit, state().level.planet.mu), state().level.ring).closed;

// --- Training ----------------------------------------------------------------------------------------------------
{
  const demos = (offsets: number[]) => ({ demos: offsets.map((offsetTac) => ({ offsetTac })) });
  const skill = autoburnDemoSkill(demos([4, 4]));
  check('…it learns half the mean offset: [4, 4] → +2 tac s, ACCURACY 84% (§5.1\'s example)', skill.learnedOffsetTac === 2 && skill.accuracy === 84,
    JSON.stringify(skill));
  check('…clamped to ±8 tac s, its ACCURACY floored at 40 and capped at 99', autoburnDemoSkill(demos([30, 30])).learnedOffsetTac === 8
    && autoburnDemoSkill(demos([-30, -20])).learnedOffsetTac === -8 && autoburnDemoSkill(demos([30, 30])).accuracy === 40
    && autoburnDemoSkill(demos([0, 0])).accuracy === 99);
  // Slice 4 (plan §7 R3): no demos is UNTRAINED, 7.5 tac s late, which is what 40% means by the formula.
  const untrained = autoburnDemoSkill(demos([]));
  check('…no demos: UNTRAINED, 40%, firing 7.5 tac s late', untrained.untrained && untrained.accuracy === 40 && untrained.learnedOffsetTac === 7.5,
    JSON.stringify(untrained));
}

// --- Flying a capture --------------------------------------------------------------------------------------------
// KESTREL after the IN correction (held by hand until the strip says RELEASE), coasting toward the capture.
function correctedKestrel(offsets: number[]): void {
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.giveSkill(offsets);
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.step();
}

function untilOffered(maxWall = 200): boolean {
  return h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, maxWall) < maxWall;
}

// Quick depth flies offset 0 (slice 3b review, the unit tier's budget); −8 and +8 at full depth (npm run balance).
// Slice 4 (plan §7 R11): offset 0 moved to skills/autoburn-modes (its trained run checks the same at quick depth), so
// quick depth flies none here; the claim's checks fly with the full run.
for (const learned of byDepth([] as number[], [-8, 0, 8])) {
  correctedKestrel([2 * learned, 2 * learned]);
  const demosBefore = state().run.stats.demos.length;
  check(`learned ${learned}: before the window, B is refused (TOO FAR FROM ▼)`, autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.tooFar,
    String(autoburnRefusal(state(), getPrediction())));
  untilOffered();
  const inTac = (getPrediction().burnPoint!.inSec - (state().clock.tSec - getPrediction().asOfTSec)) / state().level.tacticalWarp;
  check(`learned ${learned}: offered within 90 tac s of the capture's START BURN`, inTac <= 90 && inTac > 85, inTac.toFixed(1));
  h.press('KeyB');
  h.step();
  // Slice 4 (03 §3.6): armed, it holds no thread and turns nothing while it only waits; it claims a thread and selects
  // RETRO AUTO_THREAD_CLAIM_TAC before it fires.
  check(`learned ${learned}: [B] engages it: armed in CAPTURE, no thread held while it waits`, phase() === 'armed' && state().burn.auto.mode === 'capture'
    && threadsBusy() === 0 && !state().burn.auto.claimed, `${phase()} ${state().burn.auto.mode} threads ${threadsBusy()}`);
  check(`learned ${learned}: …the strip: AUTOBURN ARMED`, /^AUTOBURN ARMED — it brakes at ▼ in \d+:\d\d/.test(h.objective()?.text ?? ''), h.objective()?.text);
  h.stepUntil(() => state().burn.auto.claimed || phase() !== 'armed', 120);
  const claimIn = autoburnFireInTac(state(), getPrediction());
  check(`learned ${learned}: …it claims a thread and selects RETRO ${AUTO_THREAD_CLAIM_TAC} tac s before it fires`, state().burn.auto.claimed && threadsBusy() === 1
    && state().burn.sasMode === 'retrograde' && claimIn !== null && claimIn <= AUTO_THREAD_CLAIM_TAC && claimIn > AUTO_THREAD_CLAIM_TAC - 1,
    `claimed ${state().burn.auto.claimed} threads ${threadsBusy()} ${state().burn.sasMode} fire in ${claimIn?.toFixed(2)}`);
  let firedAtTac: number | null = null;
  let sourceAuto = false;
  let burningLine = '';
  let fuelAtLoopClosed: number | null = null;
  let burningAfterClosed = false;
  const end = h.wall() + 300;
  while (h.wall() < end && phase() !== 'done' && phase() !== 'dropped' && phase() !== 'idle') {
    const before = phase();
    h.step();
    if (fuelAtLoopClosed === null && closed()) fuelAtLoopClosed = state().burn.fuelPct;
    else if (fuelAtLoopClosed !== null && phase() === 'burning' && isThrustOn(state())) burningAfterClosed = true;
    if (before === 'armed' && (phase() === 'burning' || phase() === 'pointing')) {
      const bp = getPrediction().burnPoint;
      firedAtTac = bp ? -(bp.inSec - (state().clock.tSec - getPrediction().asOfTSec)) / state().level.tacticalWarp : null;
    }
    if (phase() === 'burning' && isThrustOn(state())) { sourceAuto ||= state().burn.firingSource === 'auto'; burningLine = h.objective()?.text ?? burningLine; }
  }
  h.step();  // the 10 Hz prediction catches up with the hand-back
  const fuel = state().burn.fuelPct;
  // +8 is later than ▼ itself on KESTREL (the tick is half a burn, ~4.8 tac s, before ▼, and ▼ passes about 7 tac
  // s after it): there the capture turns MISSED ▼, due now, and it fires at once.
  const firedOk = firedAtTac !== null && (Math.abs(firedAtTac - learned) < 0.6 || (learned === 8 && firedAtTac > 6 && firedAtTac < learned + 0.6));
  check(`learned ${learned}: it fired at the START BURN tick ${learned >= 0 ? '+' : ''}${learned} tac s (or at ▼, if that comes first)`, firedOk,
    String(firedAtTac?.toFixed(2)));
  check(`learned ${learned}: it burned with the throttle as its own ('auto'), the strip saying AUTOBURN BRAKING`, sourceAuto
    && burningLine === AUTOBURN_TEXT.burning, burningLine);
  check(`learned ${learned}: AUTOBURN alone reaches loop-closed with FUEL ≥ 25%`, fuelAtLoopClosed !== null && fuelAtLoopClosed >= 25,
    `FUEL at loop-closed ${fuelAtLoopClosed?.toFixed(1)}%`);
  const autoEnd = state().burn.auto.end;
  check(`learned ${learned}: …it flies the capture through (braking on past loop-closed) to the ring or a later trim, FUEL ≥ 20%`,
    burningAfterClosed && phase() === 'done' && (autoEnd === 'in-ring' || autoEnd === 'braked') && closed() && fuel >= 20,
    `${phase()} ${autoEnd} FUEL ${fuel.toFixed(1)}%`);
  // In the ring the strip's HOLD STEADY comes first (the lock needs no hands); a trim left for later is the strip's
  // hand-back line. The radio says either.
  const handBack = autoEnd === 'in-ring' ? AUTOBURN_TEXT.inRing : AUTOBURN_TEXT.braked;
  const stripOk = autoEnd === 'in-ring' ? h.objective()?.id === 'F3b' : h.objective()?.text === AUTOBURN_TEXT.braked;
  check(`learned ${learned}: …and hands back: throttle and thread let go, the strip and the radio say so`, !state().burn.firing && threadsBusy() === 0
    && stripOk && state().log.entries.some((entry) => entry.text === handBack), `${h.objective()?.text}`);
  check(`learned ${learned}: …its capture is not a demo (it learns from the kid only)`, state().run.stats.demos.length === demosBefore);
}

// --- The file consumed mid-burn ------------------------------------------------------------------------------------
{
  correctedKestrel([0, 0]);
  untilOffered();
  engageAutoburn(h.store);
  h.stepUntil(() => phase() === 'burning' && isThrustOn(state()), 60);
  check('setup: burning', phase() === 'burning');
  const file = skillFiles(state().memory)[0]!;
  infectNow(h.store, file);
  h.store.update((d) => { const skill = d.memory.find((seg) => seg.id === file.id); if (skill && skill.type === 'upgrade') skill.integrity = 0.05; });
  h.stepFor(0.2);
  const alarm = state().alerts.list.find((alert) => alert.id === 'autoburn-lost');
  check('its file eaten mid-burn: dropped (lost), the throttle and the thread let go', phase() === 'dropped' && state().burn.auto.end === 'lost'
    && !state().burn.firing && threadsBusy() === 0 && skillFiles(state().memory).length === 0, `${phase()} ${state().burn.auto.end}`);
  check('…with an alarm (the klaxon): `AUTOBURN.skl LOST — MANUAL` on the strip', alarm?.severity === 'alarm' && h.shown()?.text === 'AUTOBURN.skl LOST — MANUAL',
    `${alarm?.severity} | ${h.shown()?.text}`);
  check('…TACTICAL while it stands', state().clock.pace === 'tactical');
  h.stepFor(AUTOBURN_LOST_ALARM_SEC + 0.3);
  check('…the alarm clears after AUTOBURN_LOST_ALARM_SEC, and the flight\'s own line is back', !state().alerts.list.some((alert) => alert.id === 'autoburn-lost')
    && !/AUTOBURN/.test(h.shown()?.text ?? ''), h.shown()?.text);
}

// --- In blue, the burn continues ------------------------------------------------------------------------------
{
  correctedKestrel([0, 0]);
  untilOffered();
  engageAutoburn(h.store);
  setMode(h.store, 'memory');
  let thrustInBlue = false;
  let overclock = false;
  let mindLine = '';
  h.stepUntil(() => {
    if (state().ui.mode === 'memory' && isThrustOn(state())) { thrustInBlue = true; overclock ||= state().clock.overclock; mindLine = h.objective()?.text ?? mindLine; }
    return phase() === 'done' || phase() === 'dropped';
  }, 300);
  check('with the mode set to blue, the burn continues (the only burn the MIND can make), at OVERCLOCK', thrustInBlue && overclock && phase() === 'done'
    && closed(), `${phase()} overclock ${overclock}`);
  check('…the strip in blue: AUTOBURN BRAKING — it flies the ship while you fight', mindLine === AUTOBURN_TEXT.burningMind, mindLine);
  h.step();  // the 10 Hz prediction catches up with the hand-back
  const blueEnd = state().burn.auto.end;
  check('…the hand-back in blue: [TAB] for a trim left to fly, HOLD STEADY in the ring', blueEnd === 'in-ring'
    ? h.objective()?.id === 'F3b' : h.objective()?.text === AUTOBURN_TEXT.brakedTab, `${blueEnd} ${h.objective()?.text}`);
}

// --- Pause, a dead engine, SPACE, B again ----------------------------------------------------------------------
{
  correctedKestrel([0, 0]);
  untilOffered();
  engageAutoburn(h.store);
  h.stepUntil(() => phase() === 'burning' && isThrustOn(state()), 60);
  setPaused(h.store, true);
  h.stepFor(0.5);
  check('paused mid-burn: nothing fires, it waits', !state().burn.firing && phase() === 'burning');
  setPaused(h.store, false);
  h.stepFor(0.2);
  check('…resumed: it takes the throttle again', state().burn.firing && state().burn.firingSource === 'auto' && phase() === 'burning');
  h.keyDown('Space');
  h.step();
  check('SPACE mid-burn is a takeover: the player has the throttle, no gap; AUTOBURN lets go and says so',
    state().burn.firing && state().burn.firingSource === 'player' && phase() === 'idle' && state().burn.auto.end === 'takeover' && threadsBusy() === 0
    && state().log.entries.some((entry) => entry.text === AUTOBURN_TEXT.off), `${state().burn.firingSource} ${phase()}`);
  h.keyUp('Space');
  h.step();
  check('…letting go of SPACE stops the burn', !state().burn.firing);
}
{
  correctedKestrel([0, 0]);
  untilOffered();
  engageAutoburn(h.store);
  h.press('KeyB');
  h.step();
  check('B again while armed: it lets go (idle, cancel), the thread is free', phase() === 'idle' && state().burn.auto.end === 'cancel' && threadsBusy() === 0);
  engageAutoburn(h.store);
  h.stepUntil(() => phase() === 'burning' && isThrustOn(state()), 60);
  h.store.update((d) => { const engine = d.memory.find((seg) => seg.role === 'engine-io'); if (engine && 'integrity' in engine) engine.integrity = 10; });
  h.step();
  h.step();
  check('the engine dead mid-burn: dropped (ENGINE NOT RESPONDING), with the alarm', phase() === 'dropped' && state().burn.auto.end === 'engine'
    && state().alerts.list.some((alert) => alert.id === 'autoburn-lost' && alert.text === 'AUTOBURN OFF — ENGINE NOT RESPONDING'));
}

// --- Refusals ---------------------------------------------------------------------------------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  // WP12 p3: a unit that never trained AUTOBURN is refused as NOT TRAINED YET (nothing of it is "gone"); one whose
  // trained file was lost keeps NO AUTOBURN.skl (`AUTOBURN.skl IS GONE — …`).
  check('no skill file, never trained: NOT TRAINED YET', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.untrained);
  h.store.update((d) => { d.run.skills.bought.push({ skill: 'autoburn', kind: 'train', to: { version: 1, lock: 0 }, cost: 0, visit: 0 }); });
  check('no skill file, trained before: NO AUTOBURN.skl', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.noFile);
  h.store.update((d) => { d.run.skills.bought = []; });
  h.giveSkill([0, 0]);
  h.store.update((d) => { const skill = d.memory.find((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn'); if (skill && 'integrity' in skill) skill.integrity = 40; });
  check('its file below 50: AUTOBURN.skl DAMAGED', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.damaged);
  h.store.update((d) => { const skill = d.memory.find((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn'); if (skill && 'integrity' in skill) skill.integrity = 100; });
  setPaused(h.store, true);
  check('paused: PAUSED', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.paused);
  setPaused(h.store, false);
  const refused = engageAutoburn(h.store);
  check('far from ▼: B is refused with its reason (a buzz), nothing changes', refused === AUTOBURN_REFUSAL.tooFar && phase() === 'idle' && threadsBusy() === 0);
}

// --- A SKIP inside the window (LEAD-2 review round 2, the lead's ruling: a press during a SKIP only stops it) --------
// While a SKIP runs, AUTO is not offered (SKIPPING, last of the refusals), so the strip never says ` · or [B] AUTO`
// over a press that would only stop the SKIP; [B] then stops the SKIP and engages nothing; the next [B] engages it.
{
  correctedKestrel([0, 0]);
  untilOffered();
  h.press('KeyF');
  h.step();
  const skipping = state().clock.skipWarp !== null;
  const refusal = autoburnRefusal(state(), getPrediction());
  const line = h.objective()?.text ?? '';
  h.press('KeyB');
  h.step();
  const stopped = state().clock.skipWarp === null && phase() === 'idle' && threadsBusy() === 0;
  const offeredAfter = autoburnRefusal(state(), getPrediction()) === null && / · or \[B\] AUTO$/.test(h.objective()?.text ?? '');
  h.press('KeyB');
  h.step();
  check('a SKIP inside the window: AUTO not offered (SKIPPING, no `or [B] AUTO`); [B] only stops the SKIP; the next [B] engages it',
    skipping && refusal === AUTOBURN_REFUSAL.skipping && !line.includes('[B] AUTO') && stopped && offeredAfter && phase() === 'armed',
    `skipping ${skipping}, refusal ${refusal}, "${line}"; after [B]: stopped ${stopped}, offered ${offeredAfter}; after [B] again: ${phase()}`);
  // LEAD-2 review round 3: armed, a SKIP runs under `AUTOBURN ARMED — … · [B] to cancel` (the button: `[B] OFF`). [B]
  // then does what both say: it cancels, and the SKIP stops with it.
  h.press('KeyF');
  h.step();
  const skippingArmed = state().clock.skipWarp !== null && phase() === 'armed';
  const armedLine = h.objective()?.text ?? '';
  h.press('KeyB');
  h.step();
  check('armed, a SKIP under `[B] to cancel`: [B] cancels AUTOBURN (its thread let go) and stops the SKIP',
    skippingArmed && /· \[B\] to cancel$/.test(armedLine) && phase() === 'idle' && state().burn.auto.end === 'cancel'
    && threadsBusy() === 0 && state().clock.skipWarp === null,
    `skipping while armed ${skippingArmed}, "${armedLine}"; after [B]: ${phase()} (${state().burn.auto.end}), threads ${threadsBusy()}, `
    + `skipWarp ${state().clock.skipWarp}`);
}

finish();
