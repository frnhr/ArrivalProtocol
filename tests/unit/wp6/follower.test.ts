// WP6 acceptance 5, as slice 2 plays it (slice-2-plan §6.2: "the calm ship-1 follower"): run 1's ship 1 end to end,
// flown by the WP1 literal follower (it obeys the flight table), plus a scripted kid in the mind. Ship 1 is calm since
// slice 2 (04 §3.2): HOLLOW's first fight moved to VESPER, so the MIND's work here is maintenance (01-landing §2):
// the ENGINE I/O FAULT and POD 02 BRANDT at 44 (it would land hard).
// • The kid who never repairs: it locks, the landing lands all three pods (instantly: support/landing-instant.ts, which
//   writes every touchdown soft; POD 02's hard landing by the strip is landing/flow's); the LANDING REPORT comes with no
//   story; HOLLOW never says a word.
// • The kid who does everything (REPAIRs the engine at its fault, POD 02 when the hurt-driver lesson asks): all 600 land
//   soft in LZ-A.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { colonistCounts, getByRole } from '@state/selectors';
import { podRecord } from '@systems/landing-rules';

const h = createHarness6(1, { soulsFound: false });

const hollowSaid = (): string[] => h.log().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text);

function landToReport(): void {
  h.stepUntil(() => h.store.getState().run.phase === 'report', 200);
}

// --- The kid who never repairs: everyone lands, POD 02 hard ----------------------------------------------------------
{
  h.resetTo('flight');
  followStrip(h, 0.4, 400, () => undefined);
  check('the never-repair kid locks', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  check('…nothing bit on the way (no HOLLOW block, no infection)', h.hollowBlocks().length === 0
    && !h.events.some((event) => event.name === 'hollow-infect'));
  landToReport();
  const state = h.store.getState();
  const pod2 = podRecord(state, 2).fate;
  check('…the LANDING REPORT follows with all three pods down', state.run.phase === 'report' && colonistCounts(state).down === 600
    && pod2.kind === 'down', `${state.run.phase} ${JSON.stringify(colonistCounts(state))}`);
  check('…with no story: HOLLOW said nothing on ship 1', hollowSaid().length === 0 && state.hollow.story !== 'pending', hollowSaid().join(' | '));
  h.checkMemory();
}

// --- The kid who does everything ------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  let repairedPod2 = false;
  followStrip(h, 0.4, 400, () => {
    const state = h.store.getState();
    const line = state.director.shown;
    // The ENGINE I/O FAULT's tutorial (WP4): REPAIR the engine when the strip asks.
    if (line?.id === 'tut-repair-engine' || line?.id === 'tut-engine-weak') {
      const engine = getByRole(state, 'engine-io');
      if (engine && engine.type === 'tool' && engine.state !== 'repairing') actionRepair(h.store, engine);
    }
    if (!repairedPod2 && line?.id === 'tut-hurt-driver-tab') {
      if (!state.run.licences.includes('repair')) installTool(h.store, 'repair');
      repairedPod2 = actionRepair(h.store, h.soul('POD 02')) === null;
    }
  });
  check('the thorough kid locks, having repaired POD 02 on the way', h.status() === 'locked' && repairedPod2);
  landToReport();
  const state = h.store.getState();
  const pod2 = podRecord(state, 2).fate;
  check('…and all 600 land in LZ-A, POD 02 launched healthy (soft)', colonistCounts(state).landedInLz === 600
    && pod2.kind === 'down' && pod2.launch.driverIntegrity === 100 && pod2.touchdown.touch === 'soft', JSON.stringify(colonistCounts(state)));
}

finish();
