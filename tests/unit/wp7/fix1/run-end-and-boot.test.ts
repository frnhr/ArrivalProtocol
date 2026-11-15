// WP7 fix round 1: the run's end and the hand-over, headless.
// • A lost last ship (a crash, a BEAM OUT, a flyby) ends the run as 'last-ship-lost': a sombre RUN END
//   (`HALCYON LOST · END OF THE FLEET`, not hopeful), never END OF THE FLEET · FOR NOW's hope, which is
//   only for a last ship that printed (wp11/full-run checks the victory RUN END).
// • EMERGENCY TRANSMIT's why line says the Core's real toll (−25 from 100, −5 from 30, nothing at 25).
// • A skipped arrival boot never cuts out what the crossing did (playtest 1, C-UNROLL: the SELF-CHECK): the first press hurries
//   the stage, the second shows every finding at once (the ECC record and the ship's own damage said, each hit file and the
//   ship's damaged file tagged and its step sounded once), and the cut to amber waits until they have been seen.
// • NEXT BITE on a sleeping root whose wake the coast can bring forward shows no time until the coast fixes the wake (no
//   0:22 → 0:05 jump). Slice 2: HALCYON is calm, so phase 2's HALCYON root and HOLLOW (the WALLS stage's coast-tied wake)
//   are planted there (support/hollow-world.ts plantHalcyonRoot).
import { check, finish } from '../../wp1/harness';
import { fixtureShip } from '../../support/arm-ship';
import { createHarness7 } from '../harness7';
import { plantHalcyonRoot } from '../../support/hollow-world';
import { lossPlan } from '@systems/run';
import { continueAfterLoss } from '../../support/desk';
import { runEndModel } from '@systems/run-end';
import { transmitModel } from '@systems/transmit';
import { skipBoot } from '@systems/boot';
import { biteClock } from '@systems/hollow-hud';
import { setIntegrity } from '@state/actions';
import { scriptedDamageLine, bootLinePlan, TRANSMIT_TEXT, BEAM_OUT_TEXT } from '@data/script';
import { checkView } from '@systems/self-check';
import { HOLLOW_HUD_TEXT } from '@data/hollow-text';
import { AUTHORED_SLOTS } from '@systems/arm-fixture';
import {
  BOOT_SKIP_GRACE_SEC, SELF_CHECK_SKIP_SEEN_SEC, EMERGENCY_EXTRA_HITS,
} from '@data/tuning';

const h = createHarness7(9, { soulsFound: false });
const state = () => h.store.getState();

function crash(): void {
  const radius = state().level.planet.R + 20;
  h.store.mutate((d) => { d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; d.ui.mode = 'tools'; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
}

// --- A lost last ship --------------------------------------------------------------------------------
// WP9: the last ship was KESTREL (ship 3); WP10: it is VESPER (ship 4). Read off the fleet, so the next ship changes nothing.
// WP11: the last ship is LAST LIGHT, the flagship: its loss is §4.3's FLAGSHIP LOST, worded FINAL SHIP LOST since slice 3a (WP7's interim 'last-ship-lost' and
// its `… LOST · END OF THE FLEET` title are gone with the fleet that ended early), and RUN END's tone is sombre.
const LAST = AUTHORED_SLOTS.length - 1;
const LAST_NAME = fixtureShip(LAST).name;
{
  h.shipAlone(LAST, 9);
  crash();
  const plan = lossPlan(state());
  check(`a crash on ${LAST_NAME} (the last ship, the flagship, comms up): the run ends as flagship-lost`, plan.kind === 'end'
    && plan.cause === 'flagship-lost' && fixtureShip(LAST).final, JSON.stringify(plan));
  continueAfterLoss(h.store);
  const model = runEndModel(state());
  check('…RUN END is sombre: FINAL SHIP LOST', model.title === 'FINAL SHIP LOST' && model.tone === 'sombre' && model.cause === 'flagship-lost',
    `${model.title} tone ${model.tone}`);
  check('…its why line says what was lost', model.why === 'The final ship never made it.', model.why);
  check('BEAM OUT\'s question on the last ship says the run ends (no transit hits that never come)',
    BEAM_OUT_TEXT.detail('HALCYON', 2000, true) === '2,000 colonists stay on HALCYON. The run ends.'
    && /transit hits/.test(BEAM_OUT_TEXT.detail('HALCYON', 2000, false)));
}

// --- EMERGENCY TRANSMIT's why line -------------------------------------------------------------------
for (const [coreAt, toll] of [[100, 25], [30, 5], [25, 0]] as const) {
  h.newRun(9);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; });
  h.store.update((d) => { const core = d.memory.find((seg) => seg.type === 'core'); if (core) setIntegrity(core, coreAt); });
  crash();
  continueAfterLoss(h.store);
  const why = transmitModel(state()).why;
  check(`a crash with the Core at ${coreAt}: the why line says AI CORE −${toll}`, why === TRANSMIT_TEXT.why.crashed(toll)
    && (toll === 0 ? !/AI CORE/.test(why ?? '') : why?.includes(`AI CORE −${toll}`) === true), why ?? 'null');
  if (coreAt === 25) {
    h.transmit();
    check('…and the Core arrives where the line said (25, before the transit hits)', state().run.arrival?.hits.every((hit) => hit.role !== 'core' || hit.from <= 25) === true,
      JSON.stringify(state().run.arrival?.hits));
  }
}
check('the crash\'s why line keeps the extra hits either way', TRANSMIT_TEXT.why.crashed(0).includes(`+${EMERGENCY_EXTRA_HITS} TRANSIT HITS`));

// --- Skipping an arrival boot ------------------------------------------------------------------------
{
  h.newRun(9);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; });
  crash();
  continueAfterLoss(h.store);
  h.transmit();
  check('EMERGENCY TRANSMIT → HALCYON\'s boot', state().run.phase === 'boot' && state().run.shipIndex === 1 && state().run.arrival !== null);
  const arrival = state().run.arrival!;
  const found = [...new Set([...arrival.hits, ...arrival.scripted].map((hit) => hit.segId))];
  const stepsOf = (id: string): number => h.events.filter((event) => event.name === 'self-check-step'
    && (event.payload as { cue: string; segIds: string[] }).cue === 'fault' && (event.payload as { segIds: string[] }).segIds.includes(id)).length;
  h.stepFor(BOOT_SKIP_GRACE_SEC + 0.05);
  check('…a press after the grace hurries the SELF-CHECK\'s stage instead of cutting to amber', skipBoot(h.store) && state().run.phase === 'boot'
    && state().ui.mode === 'memory', `${state().run.phase} ${state().ui.mode}`);
  check('…a second press shows every finding at once, still in blue', skipBoot(h.store) && state().run.phase === 'boot' && state().ui.mode === 'memory');
  // Track RETIRE: on run 1's arm a hop that ECC corrected says its own ECC line (the hits that landed), and the ship's own
  // arrival damage (HALCYON's Sensor Interp) its own line after it. Since C-UNROLL both are marks: logged, never typed, and
  // the files they name carry the SELF-CHECK's tags.
  const plan = bootLinePlan(state(), 0);
  const eccSaid = state().log.entries.some((entry) => entry.text.startsWith('> ECC:') && entry.mark === true)
    && (!plan.includes('scripted') || state().log.entries.some((entry) => entry.text === scriptedDamageLine(arrival.scripted) && entry.mark === true));
  const tagged = found.filter((id) => checkView().tags.get(id)?.tone === 'fault' && stepsOf(id) === 1);
  check('…the ECC record (and the ship\'s own damage) are said as marks, and every file they name is tagged with its step sounded once',
    eccSaid && found.length >= 1 && tagged.length === found.length, `${eccSaid} ${tagged.length} of ${found.length} · ${plan.join(',')}`);
  check('…a third press right after is ignored (the findings are still being seen)', !skipBoot(h.store) && state().run.phase === 'boot');
  h.stepFor(SELF_CHECK_SKIP_SEEN_SEC + 0.05);
  check('…once they have been seen, a press cuts to amber (long before the check would have ended)',
    skipBoot(h.store) && state().run.phase === 'flight', state().run.phase);
  check('…each finding was sounded once (one step per file)', found.every((id) => stepsOf(id) === 1));
}

// --- NEXT BITE before HALCYON's coast --------------------------------------------------------------------
{
  h.shipAlone(1, 9);
  h.store.update(plantHalcyonRoot);
  check('HALCYON\'s HOLLOW sleeps, the coast not begun', state().hollow.phase === 'asleep' && state().burn.coastAtAi === null);
  const early = biteClock(state());
  check('…NEXT BITE shows no time yet (the coast could still bring the wake sooner)', early.secLeft === null
    && early.time === HOLLOW_HUD_TEXT.noTimer, early.text);
  h.store.mutate((d) => { d.burn.coastAtAi = d.clock.aiSec; });
  const atCoast = biteClock(state());
  check('…the coast begins: 0:05, and it only counts down from there', atCoast.secLeft !== null && Math.abs(atCoast.secLeft - 5) < 1e-6, atCoast.text);
  h.store.mutate((d) => { d.burn.coastAtAi = null; d.clock.aiSec = 26; });
  const late = biteClock(state());
  check('…past 25 s with no coast the wake is fixed at 30 s: 0:04', late.secLeft !== null && Math.abs(late.secLeft - 4) < 1e-6, late.text);
}

finish();
