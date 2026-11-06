// Slice 4c–4e review fixes, AUTODROP (docs/phase3/impl/slice-4cde-review.md; the plan's "Deviations (review fixes, landing)"),
// on run 1's arm (autodrop-arm: a constructed lock, no capture flown). The review's probes, made checks.
// • B2: VESPER with healthy drivers and its own Sensor Interp damage (LZ-C NEVER FITS, the plan's last rows leftovers into the
//   full LZs), a kid who obeys the strip ([G], [L], [F]): the plan ends with no pod left aboard, every AUTODROP launch at
//   TACTICAL (its controller names its next launch to pace, so no SKIP jumps it).
// • m7: a row whose moment passes with no launch (every thread busy) is re-planned, not held as row 0.
// • M1: v1 held, the next pod's drop WIDE: the hold lets go, and `press [L]` launches it by hand.
// • M3: an obedient ship 1 (by the strip, by hand) trains AIM ≥ 90%: demos are measured against the slot the strip cued.
// • M4: on CORMORANT as arrived (every window WIDE) v2's and v3's [G] refuse `NO SURE WINDOW — REPAIR …`, flashed on the
//   strip, and their lessons are not due.
// • m5, m6: a 'merge' resolver wrapping AUTODROP answers as itself (no throw), and AUTODROP's own machinery stands aside.
// (M2 and the AUTOBURN v3 integration: skills/landing-v3.)
import { check, finish } from '../landing/checks';
import { createHarness7 } from '../wp7/harness7';
import { armLanding, ARM } from './autodrop-arm';
import { followLanding } from '../landing/harness-landing';
import { landingKid, VESPER_ROUTE } from './landing-kid';
import { planLanding } from '@systems/autodrop-plan';
import { autodropController, autodropLineOf, autodropTutorialDue } from '@systems/autodrop';
import { activeLandingController, controllerLaunchInSec, registerLandingController } from '@systems/landing-controller';
import { getDropSolution } from '@systems/drop-cache';
import { releaseThread, reserveThread, threadsBusy, threadsTotal } from '@systems/ops-core';
import { demoSkill, AUTODROP_DEMO_TUNING } from '@systems/skill-tree';
import { on } from '@systems/events';
import { AUTODROP_TEXT } from '@data/autodrop-text';
import { WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';

const h = createHarness7(1);
const { st, shown, ad, viewNow, aboard, landedPct, launches, obey } = landingKid(h);

// --- B2: the plan ends when only leftovers are left (healthy drivers, the ship's own Sensor Interp damage) ----------------------
{
  armLanding(h, VESPER_ROUTE, { autodrop: 3, demos: [0.05, -0.05], healDrivers: true, healInstruments: false });
  h.step();
  const plan = planLanding(st(), viewNow());
  const leftovers = plan.rows.filter((row) => row.mislanded > 0).length;
  check('B2\'s ship: LZ-C NEVER FITS and the plan\'s last rows are leftovers into the LZs it fills', plan.neverFits.some((never) => never.lz === 'LZ-C')
    && leftovers > 0 && plan.rows.slice(-leftovers).every((row) => row.mislanded > 0), plan.rows.map((row) => `${row.lz}×${row.n}${row.mislanded ? '¾' : ''}`).join(' '));
  launches.length = 0;
  let named = true;
  let tacticalNear = true;
  const wall = obey(1500, {
    each: () => {
      if (ad().armed !== 'plan') return;
      const controller = activeLandingController(st());
      const rows = planLanding(st(), viewNow()).rows;
      if (rows[0] !== undefined && controller?.nextLaunchAtTSec?.(st()) !== rows[0].atTSec) named = false;
      const inSec = controllerLaunchInSec(st());
      if (inSec !== null && inSec > 0 && inSec / st().level.tacticalWarp < WINDOW_TACTICAL_LEAD_TAC - 0.5 && st().clock.pace !== 'tactical') tacticalNear = false;
    },
  });
  const flown = launches.filter((launch) => launch.source === 'autodrop');
  console.log(`INFO B2 (VESPER, drivers healthy, Sensor Interp ×2.5): ${flown.length} AUTODROP launches, ${launches.length - flown.length} by hand, `
    + `end ${ad().end}, ${aboard()} aboard, ${landedPct()}% landed, ${wall.toFixed(0)} wall s`);
  check('B2: the controller names the plan\'s next row to pace, and the world is TACTICAL inside its lead', named && tacticalNear);
  check('…every AUTODROP launch left at TACTICAL (no SKIP jumped a row\'s moment)', flown.length > 0 && flown.every((launch) => launch.pace === 'tactical'),
    flown.filter((launch) => launch.pace !== 'tactical').map((launch) => `${launch.pod}@${launch.pace}`).join(' '));
  check('…the plan ends (PLAN DONE) with no pod left aboard, well inside the 1,500 s the review\'s kid ran into', ad().end === 'plan-done' || st().landing.ended !== null
    ? aboard() === 0 && wall < 1500 : false, `end ${ad().end} · ${aboard()} aboard · ${wall.toFixed(0)} s`);
}

// --- m7: a row whose moment passed with no launch is re-planned --------------------------------------------------------------
{
  armLanding(h, VESPER_ROUTE, { autodrop: 3, demos: [0.05, -0.05], healDrivers: true, healInstruments: true });
  h.step();
  h.press('KeyG');
  const busy: string[] = [];
  for (let i = threadsBusy(); i < threadsTotal(); i++) { const owner = `test-busy-${i}`; if (reserveThread(owner)) busy.push(owner); }
  const first = planLanding(st(), viewNow()).rows[0]!;
  h.stepUntil(() => st().clock.tSec > first.untilTSec + 1, 400);
  const row = planLanding(st(), viewNow()).rows[0];
  check('m7: with every thread busy the first row\'s moment passes unflown, and the plan re-plans it from now (not row 0 for ever)',
    st().landing.pods.every((record) => record.fate.kind === 'aboard') && row !== undefined && row.atTSec > st().clock.tSec
      && !/LAUNCHING/.test(shown()), `${JSON.stringify(row)} now ${st().clock.tSec.toFixed(0)} · ${shown()}`);
  for (const owner of busy) releaseThread(owner);
}

// --- M1: v1 held, the next pod WIDE: the hold lets go, `press [L]` launches it -------------------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON], { autodrop: 1, demos: [0.05, -0.05], healDrivers: true, healInstruments: true });
  // Every pod after the first gets a failing driver: its dot is wider than HALCYON's brackets (a WIDE DROP).
  h.store.update((draft) => { for (const seg of draft.memory) if (seg.type === 'driver' && seg.pod !== 1) seg.integrity = 25; draft.ui.memoryRev++; });
  h.stepUntil(() => /hold \[L\]/.test(shown()), 900);
  launches.length = 0;
  h.keyDown('KeyL');
  h.stepUntil(() => launches.length >= 1, 60);
  h.stepUntil(() => !ad().held || st().landing.window === null, 30);
  const letGo = !ad().held && st().landing.window !== null;
  h.stepUntil(() => /press \[L\]/.test(shown()), 5);
  const asks = /press \[L\]/.test(shown());
  h.keyUp('KeyL');
  h.press('KeyL');
  h.step();
  check('M1: held, the first pod went by AUTODROP; with the next pod WIDE the hold lets go inside the window', launches[0]?.source === 'autodrop' && letGo,
    `${JSON.stringify(launches)} held ${ad().held}`);
  check('…the strip\'s `press [L]` is then true: [L] launches the WIDE pod by hand', asks && launches[1]?.source === 'player', `${shown()} · ${JSON.stringify(launches)}`);
}

// --- M3: an obedient ship 1 trains a centred AUTODROP ------------------------------------------------------------------------
{
  armLanding(h, [ARM.ARES], { autodrop: null, demos: [], healDrivers: true, healInstruments: true });
  followLanding(h, { maxWall: 600 });
  const skill = demoSkill(st().run.stats.dropDemos, AUTODROP_DEMO_TUNING);
  console.log(`INFO M3 ship 1 by the strip: demos ${st().run.stats.dropDemos.map((demo) => demo.offsetTac.toFixed(2)).join(' ')} → AIM ${skill.accuracy}% `
    + `(learned ${skill.learnedOffsetTac.toFixed(2)} tac s; 60% and −1.00 before the fix)`);
  check('M3: an obedient ship 1 (by the strip) trains AIM ≥ 90%: its demos are measured against the slot the strip cued',
    st().run.stats.dropDemos.length >= 3 && skill.accuracy >= 90, `AIM ${skill.accuracy}`);
}

// --- M4: CORMORANT as arrived (every window WIDE): [G] says why, and names the fix ---------------------------------------------
for (const version of [2, 3] as const) {
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT], { autodrop: version, demos: [0.05, -0.05], healDrivers: false });
  h.step();
  const refusals: string[] = [];
  const off = on('refused', (payload) => { refusals.push(payload.reason); });
  const due = autodropTutorialDue(st(), version);
  h.press('KeyG');
  h.step();
  off();
  const word = refusals[0]?.replace('AUTODROP|', '') as keyof typeof AUTODROP_TEXT.refusal | undefined;
  const text = word === undefined ? '' : AUTODROP_TEXT.refusal[word] ?? '';
  check(`M4 v${version}: [G] with no sure window anywhere refuses \`NO SURE WINDOW — REPAIR …\`, flashed on the strip, and its lesson was not due`,
    !due && ad().armed === null && word !== undefined && word.startsWith('NO SURE WINDOW') && /REPAIR/.test(text) && shown() === text,
    `${refusals.join(',')} · strip "${shown()}" · due ${due}`);
}

// --- m5, m6: a 'merge' resolver wrapping AUTODROP; AUTODROP stands aside under it -----------------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON], { autodrop: 3, demos: [0.05, -0.05], healDrivers: true, healInstruments: true });
  h.step();
  h.press('KeyG');
  const off = registerLandingController('merge', (state) => autodropController(state, { version: 3, queue: [], source: 'merge' }));
  launches.length = 0;
  let claimed = false;
  let lines = false;
  let threw = false;
  try {
    h.stepUntil(() => {
      if (ad().claimed) claimed = true;
      if (autodropLineOf(st(), getDropSolution()!) !== null) lines = true;
      return launches.length > 0;
    }, 900);
  } catch (error) {
    threw = true;
    console.log(String(error));
  }
  const active = activeLandingController(st());
  off();
  check('m6: a \'merge\' resolver wrapping AUTODROP (source \'merge\') answers as itself: no throw, and its launches are MERGE\'s',
    !threw && active?.source === 'merge' && launches.length > 0 && launches.every((launch) => launch.source === 'merge'), JSON.stringify(launches));
  check('m5: under it AUTODROP\'s own machinery stands aside: no Core thread claimed, no strip rows', !claimed && !lines, `claimed ${claimed} lines ${lines}`);
}

finish();
