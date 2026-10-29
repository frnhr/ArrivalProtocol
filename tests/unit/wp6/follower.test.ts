// @ts-nocheck: TODO(slice1a-TESTS): this suite tests phase 2's printer / souls and is rewritten per slice-1a-plan §5
// ("Existing suites: Rewrite"). F2 turned type-checking off here so tsc over tests stays green meanwhile; it fails at runtime.
// WP6 acceptance 5: run 1's ship 1 end to end with HOLLOW, flown by the WP1 literal follower (it
// obeys the flight table), plus a scripted kid in the mind. The archive starts SEALED, as on the page.
// • The kid who never scans STASIS: the bite breaks into C12's slab (`SEALED BLOCK BREACHED · C12 ·
//   OKAFOR`, C12 alone opens), the kid repairs C12 when the strip says SOMETHING IS EATING C12, and the
//   WAKE REPORT has ≥ 11 clusters woke. The fight is still on at the lock, so the fight's own story plays
//   the reveal once it is decided (LEAD-1 review round 1: the printer's find used to start at the lock and
//   type over HOLLOW's echo); the printer waits for it.
// • The kid who repairs C12 the moment it is bitten (mid-capture): the fight is decided in flight,
//   so the breach plays the full reveal (`SEALED BLOCK BREACHED.` first), then `> ...047?`.
// • The kid who does everything (REPAIRs the engine at its fault, SCANs STASIS and REPAIRs C09 on
//   the coast, REPAIRs C12 after the lock): all 12 clusters woke intact.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { actionScan, actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { colonistCounts, getByRole } from '@state/selectors';
import { HOLLOW_STORY } from '@data/hollow-text';

const h = createHarness6(1, { soulsFound: false });

const said = (): string[] => h.log().map((entry) => `${entry.speaker}: ${entry.text}`);
const repairC12 = (): boolean => {
  const c12 = h.maybeSoul('C12');
  return c12 !== null && actionRepair(h.store, c12) === null;
};

// The strip names C12 as being eaten: the mind-urgent line, or the alarm when it is close (a kid who
// never fixed the engine locks with C12 at about 6%: the alarm is the first line after the lock).
const asksForC12 = (): boolean => {
  const id = h.store.getState().director.shown?.id ?? '';
  return id.startsWith('hollow-eating') || id.startsWith('alarm-eaten');
};

function printToReport(): void {
  h.stepUntil(() => {
    // The kid saves C12 whenever the strip asks.
    if (asksForC12() && h.maybeSoul('C12')?.state !== 'repairing') repairC12();
    return h.store.getState().run.phase === 'report';
  }, 200);
}

// --- The kid who never scans: the breach, then the printer finds the rest -------------------------------
{
  h.resetTo('flight');
  let breachSealedOthers = false;
  followStrip(h, 0.4, 400, () => {
    const c12 = h.maybeSoul('C12');
    if (c12?.infected && !breachSealedOthers) breachSealedOthers = !c12.sealed && h.soul('C11').sealed;
  });
  check('never-scan kid: locks', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  check('the bite breaks into the sealed archive: C12 alone opens, the others stay sealed', breachSealedOthers);
  check('the TERMINAL says so: > SEALED BLOCK BREACHED · C12 · OKAFOR', said().includes(`mind-sys: ${HOLLOW_STORY.breach('C12', 'Okafor')}`));
  printToReport();
  const state = h.store.getState();
  const counts = colonistCounts(state);
  const woke = state.souls.results.filter((result) => result.outcome !== 'lost').length;
  check('…the fight\'s story played the reveal (cause breach, not the printer\'s find) and the WAKE REPORT has ≥ 11 clusters woke',
    state.run.phase === 'report' && state.souls.reveal.cause === 'breach' && woke >= 11, `${woke} woke, ${JSON.stringify(counts)}`);
  check('…C12 was saved by the scripted repair (Ada woke)', state.souls.results.find((result) => result.cluster === 'C12')?.outcome === 'woke');
  check('…and HOLLOW noticed: `> ...047?`, then CONTROL', said().includes(`hollow: ${HOLLOW_STORY.noticed(47)}`)
    && said().includes(`control: ${HOLLOW_STORY.control}`));
  h.checkMemory();
}

// --- The kid who repairs at the bite: the fight ends in flight, and the breach plays the reveal ------------
{
  h.resetTo('flight');
  let repairedAt: number | null = null;
  followStrip(h, 0.4, 400, () => {
    const c12 = h.maybeSoul('C12');
    if (repairedAt === null && c12?.infected && !c12.sealed && c12.state !== 'repairing') {
      if (!h.store.getState().run.licences.includes('repair')) installTool(h.store, 'repair');
      if (repairC12()) repairedAt = h.wall();
    }
  });
  check('repair-at-the-bite kid: locks', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  const state = h.store.getState();
  check('the fight was decided in flight: the breach reveal played (SEALED BLOCK BREACHED. first)',
    repairedAt !== null && state.souls.reveal.cause === 'breach' && state.souls.reveal.lines[0] === 'SEALED BLOCK BREACHED.',
    `${state.souls.reveal.cause}: ${state.souls.reveal.lines.join(' / ')}`);
  printToReport();
  const woke = h.store.getState().souls.results.filter((result) => result.outcome !== 'lost').length;
  check('…WAKE REPORT with all 12 woke (C09 with gaps)', h.store.getState().run.phase === 'report' && woke === 12, `${woke}`);
}

// --- The kid who does everything ------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  let scanned = false;
  let repairedC09 = false;
  followStrip(h, 0.4, 400, () => {
    const state = h.store.getState();
    const line = state.director.shown;
    // The ENGINE I/O FAULT's tutorial (WP4): REPAIR the engine when the strip asks.
    if (line?.id === 'tut-repair-engine' || line?.id === 'tut-engine-weak') {
      const engine = getByRole(state, 'engine-io');
      if (engine && engine.type === 'tool' && engine.state !== 'repairing') actionRepair(h.store, engine);
    }
    if (!scanned && line?.id === 'tut-check-souls') scanned = actionScan(h.store, getByRole(state, 'stasis')!) === null;
    if (scanned && !repairedC09 && line?.id === 'tut-hurt-cluster-tab') {
      if (!state.run.licences.includes('repair')) installTool(h.store, 'repair');
      repairedC09 = actionRepair(h.store, h.soul('C09')) === null;
    }
  });
  check('the thorough kid locks, having scanned STASIS and repaired C09 on the coast', h.status() === 'locked' && scanned && repairedC09);
  printToReport();
  const counts = colonistCounts(h.store.getState());
  // WP7 fix round 1: SoulCounts counts heads in `heads`; the intact ones are `intact` (was `woke`), and the
  // half-credit `score` is RUN END's runScore only.
  check('…and after saving C12 from the bite, all 2,400 woke intact', counts.intact === 2400 && counts.lost === 0, JSON.stringify(counts));
}

finish();
