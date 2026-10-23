// WP12 part 3 (LEAD_NOTES `Leftovers from WP4`, the WP4 fixer's proposal): the BRAKE IN countdown across ship 1's ENGINE
// I/O lesson. The START BURN tick sits half the burn before ▼, so any change of engine power moves it; while the kid's
// REPAIR held Engine I/O offline the plan saw no engine at all, and the countdown leapt 161.7 → 173.5 → 163.6 tac s.
// Now the plan uses the healing file's own band while its driver is offline for the kid's op (planningThrustCap): the
// countdown may still step up a little as power comes back (a freed thread, a better band), never by much.
// Also: the strip still says the engine is offline while it is (the burn itself waits for the driver).
import { check, finish } from '../../wp1/harness';
import { createHarness4 } from '../../wp4/harness4';
import { mainCountdown } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { pickUpTool, applyTool } from '@systems/fs-tools';
import { getOps } from '@systems/ops-core';
import { capabilitiesNow, thrustCap, planningThrustCap } from '@systems/capabilities';

// The most a power change may move the countdown up at once (tactical s). The healing file's step from failing (40% of
// thrust) to degraded (75%) shortens ship 1's capture burn enough to move its tick by about 5.8 s; that is the engine
// getting stronger, as with any change of power. The old offline leap was 11.8, and then fell back 9.9.
const MAX_RISE_TAC = 6;
// A countdown that falls by more than this in one tick jumped down (it runs at most a tick's worth a tick).
const MAX_TICK_DROP_TAC = 0.5;

const h = createHarness4(1);
const countdown = (): number | null => {
  const shown = mainCountdown(h.store.getState(), getPrediction());
  return shown && shown.kind === 'burn' ? shown.tacSec : null;
};
h.resetTo('flight');
h.keyDown('Space');
while (!/^RELEASE/.test(h.shown()?.text ?? '') && h.wall() < 60) h.step();
h.keyUp('Space');
h.press('KeyS');
for (let i = 0; i < 40; i++) h.step();
const before = countdown();
check('setup: ship 1 coasting to its capture with Engine I/O hurt (the lesson), a BRAKE IN countdown shown',
  before !== null && h.file('engine-io').integrity < 50, `${before} · Engine I/O ${h.file('engine-io').integrity}`);
h.press('Tab');
for (let i = 0; i < 4; i++) h.step();
pickUpTool(h.store, 'repair');
applyTool(h.store, h.file('engine-io'), { ask: () => { throw new Error('no confirm expected'); } });
let previous = countdown() ?? 0;
let worstRise = 0;
let worstDrop = 0;
let offlineSeen = false;
let plannedWhileOffline = true;
let stripSaysOffline = true;
const samples: string[] = [];
while (getOps().length > 0 && h.wall() < 60) {
  h.step();
  const now = countdown();
  if (now === null) continue;
  worstRise = Math.max(worstRise, now - previous);
  worstDrop = Math.max(worstDrop, previous - now);
  if (now - previous > 0.05) samples.push(`${previous.toFixed(1)}→${now.toFixed(1)}`);
  previous = now;
  const caps = capabilitiesNow(h.store.getState());
  if (caps.engine.offline === 'repairing') {
    offlineSeen = true;
    if (!(thrustCap(caps) === 0 && planningThrustCap(h.store.getState(), caps) > 0)) plannedWhileOffline = false;
    if (!/ENGINE OFFLINE/.test(h.objective()?.text ?? '')) { stripSaysOffline = false; samples.push(`[${h.shown()?.text} | ${h.objective()?.text}]`); }
  }
}
for (let i = 0; i < 6; i++) {
  h.step();
  const now = countdown();
  if (now === null) continue;
  worstRise = Math.max(worstRise, now - previous);
  worstDrop = Math.max(worstDrop, previous - now);
  if (now - previous > 0.05) samples.push(`${previous.toFixed(1)}→${now.toFixed(1)} (after)`);
  previous = now;
}
console.log(`      countdown ${before?.toFixed(1)} → ${previous.toFixed(1)}; rises: ${samples.join(', ') || 'none'}`);
check('the repair held Engine I/O offline: the engine delivered nothing, the plan used the healing file\'s band',
  offlineSeen && plannedWhileOffline);
check(`the BRAKE IN countdown never rose by more than one band step (${MAX_RISE_TAC} tac s) across the repair (it leapt 11.8 before)`,
  worstRise <= MAX_RISE_TAC, `worst rise ${worstRise.toFixed(2)} tac s`);
check('…and never jumped down (before, it fell back 9.9 tac s when the engine came back online)', worstDrop <= MAX_TICK_DROP_TAC,
  `worst one-tick drop ${worstDrop.toFixed(2)} tac s`);
check('…and the strip said the engine is offline while it was (the burn waits for the driver)', stripSaysOffline);

finish();
