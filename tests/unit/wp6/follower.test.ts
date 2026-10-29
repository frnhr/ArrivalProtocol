// WP6 acceptance 5, slice 1a: run 1's ship 1 end to end with HOLLOW, flown by the WP1 literal follower (it obeys the
// flight table), plus a scripted kid in the mind. No sealed archive any more: HOLLOW's first bite takes POD 01 OKAFOR
// (Ada's family, right after the root) the first time the loop closes, and the strip names it.
// • The kid who repairs POD 01 when the strip says SOMETHING IS EATING POD 01: it locks, the landing lands all three
//   pods (instantly: tests/unit/support/landing-instant.ts), and the story (`> ...047?`, then CONTROL) holds the LANDING
//   REPORT until it is told.
// • The kid who repairs POD 01 the moment it is bitten (mid-capture): the fight is decided in flight; same ending.
// • The kid who never repairs: POD 01's driver is eaten, the other two land, POD 01 is parked in orbit (eaten,
//   restorable by MERGE later).
// • The kid who does everything (REPAIRs the engine at its fault, POD 02 when the hurt-driver lesson asks, POD 01 at the
//   bite): all 600 land in LZ-A.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { colonistCounts, getByRole } from '@state/selectors';
import { podRecord } from '@systems/landing-rules';
import { HOLLOW_STORY } from '@data/hollow-text';

const h = createHarness6(1, { soulsFound: false });

const said = (): string[] => h.log().map((entry) => `${entry.speaker}: ${entry.text}`);
const repairPod1 = (): boolean => {
  const pod1 = h.maybeSoul('POD 01');
  if (pod1 === null) return false;
  if (!h.store.getState().run.licences.includes('repair')) installTool(h.store, 'repair');
  return actionRepair(h.store, pod1) === null;
};

// The strip names POD 01 as being eaten: the mind-urgent line, or the alarm when it is close.
const asksForPod1 = (): boolean => {
  const id = h.store.getState().director.shown?.id ?? '';
  return id.startsWith('hollow-eating') || id.startsWith('alarm-eaten');
};

function landToReport(saves: boolean): void {
  h.stepUntil(() => {
    if (saves && asksForPod1() && h.maybeSoul('POD 01')?.state !== 'repairing') repairPod1();
    return h.store.getState().run.phase === 'report';
  }, 200);
}

// --- The kid who repairs when the strip asks -------------------------------------------------------------------------
{
  h.resetTo('flight');
  let bitten = false;
  followStrip(h, 0.4, 400, () => {
    if (h.maybeSoul('POD 01')?.infected) bitten = true;
    if (asksForPod1() && h.maybeSoul('POD 01')?.state !== 'repairing') repairPod1();
  });
  check('the strip-asked kid locks', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  check('HOLLOW bit POD 01 (Ada\'s family, right after the root) in flight', bitten);
  landToReport(true);
  const state = h.store.getState();
  const counts = colonistCounts(state);
  check('…the LANDING REPORT follows with all three pods down (POD 01 saved, Ada landed)', state.run.phase === 'report'
    && counts.landedInLz === 600 && podRecord(state, 1).fate.kind === 'down', `${state.run.phase} ${JSON.stringify(counts)}`);
  check('…and HOLLOW noticed: `> ...047?`, then CONTROL, before the report', said().includes(`hollow: ${HOLLOW_STORY.noticed(47)}`)
    && said().includes(`control: ${HOLLOW_STORY.control}`) && state.hollow.story === 'told', state.hollow.story);
  h.checkMemory();
}

// --- The kid who repairs at the bite: the fight ends in flight ------------------------------------------------------
{
  h.resetTo('flight');
  let repairedAt: number | null = null;
  followStrip(h, 0.4, 400, () => {
    const pod1 = h.maybeSoul('POD 01');
    if (repairedAt === null && pod1?.infected && pod1.state !== 'repairing' && repairPod1()) repairedAt = h.wall();
  });
  check('repair-at-the-bite kid: locks, having repaired POD 01 in flight', h.status() === 'locked' && repairedAt !== null,
    `${h.status()} at ${h.wall().toFixed(1)} s`);
  landToReport(true);
  const state = h.store.getState();
  check('…the LANDING REPORT with all 600 down and the story told', state.run.phase === 'report' && colonistCounts(state).landedInLz === 600
    && state.hollow.story === 'told', `${state.run.phase} ${JSON.stringify(colonistCounts(state))}`);
}

// --- The kid who never repairs: POD 01 is eaten and parked ----------------------------------------------------------
{
  h.resetTo('flight');
  followStrip(h, 0.4, 400, () => undefined);
  check('the never-repair kid locks', h.status() === 'locked', h.status());
  landToReport(false);
  const state = h.store.getState();
  const pod1 = podRecord(state, 1);
  check('POD 01\'s driver was eaten; its pod is parked in orbit (eaten, restorable)', pod1.driverLost === 'eaten'
    && pod1.fate.kind === 'parked' && pod1.fate.why === 'eaten' && pod1.fate.restorable, JSON.stringify({ lost: pod1.driverLost, fate: pod1.fate }));
  check('…the other two landed (400), and the report came', state.run.phase === 'report' && colonistCounts(state).landedInLz === 400,
    `${state.run.phase} ${JSON.stringify(colonistCounts(state))}`);
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
    const pod1 = h.maybeSoul('POD 01');
    if (pod1?.infected && pod1.state !== 'repairing') repairPod1();
  });
  check('the thorough kid locks, having repaired POD 02 on the way', h.status() === 'locked' && repairedPod2);
  landToReport(true);
  const state = h.store.getState();
  const pod2 = podRecord(state, 2).fate;
  check('…and all 600 land in LZ-A, POD 02 launched healthy (soft)', colonistCounts(state).landedInLz === 600
    && pod2.kind === 'down' && pod2.launch.driverIntegrity === 100 && pod2.touchdown.touch === 'soft', JSON.stringify(colonistCounts(state)));
}

finish();
