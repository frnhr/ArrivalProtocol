// Slice 4c–4e review fixes on run 1's VESPER (docs/phase3/impl/slice-4cde-review.md; the plan's "Deviations (review fixes,
// landing)"), whole landings by a kid who obeys the strip (skills/landing-kid).
// • M2: VESPER as arrived: in a window of an LZ the plan does not fly, LOAD NEXT is pinned to a pod outside the plan and the
//   strip asks for [L]; no hand launch while it is armed takes a pod the plan held. Measured: wall s and landed %.
// • §8.3, the integration: AUTOBURN v3 with AUTODROP v3 on healthy VESPER, [B] [G] [F] only: no launch under thrust, no
//   ENGINE FIRING refusal, AUTOBURN at its landing orbit and every pod landed (measured: FUEL and time).
// • m2: from an exactly circular lock, v3's first burn comes at the next quarter turn (no ▲ chased for minutes).
import { check, finish } from '../landing/checks';
import { createHarness7 } from '../wp7/harness7';
import { armLanding } from './autodrop-arm';
import { landingKid, VESPER_ROUTE } from './landing-kid';
import { giveSkillFile } from '../support/skills';
import { getPrediction } from '@systems/predict';
import { planLanding } from '@systems/autodrop-plan';
import { getDropSolution } from '@systems/drop-cache';
import { autoburnRefusal } from '@systems/autoburn';
import { landingOrbitAim } from '@systems/autoburn-v3';
import { on } from '@systems/events';

const h = createHarness7(1);
const { st, shown, ad, viewNow, aboard, landedPct, launches, obey } = landingKid(h);

// --- M2: the windows the plan does not use are the kid's, with a pod outside the plan (VESPER as arrived) ---------------------
{
  armLanding(h, VESPER_ROUTE, { autodrop: 3, demos: [0.05, -0.05], healDrivers: false, healInstruments: false });
  launches.length = 0;
  let held = new Set<number>();
  let outsidePin = false;
  const tookHeld: number[] = [];
  let seen = 0;
  const wall = obey(1500, {
    each: () => {
      // A hand launch on the last tick: was its pod one the plan held then?
      for (const launch of launches.slice(seen)) if (launch.source === 'player' && held.has(launch.pod)) tookHeld.push(launch.pod);
      seen = launches.length;
      held = new Set();
      if (ad().armed !== 'plan' || getDropSolution() === null) return;
      const plan = planLanding(st(), viewNow());
      for (const row of plan.rows) for (const pod of row.pods) held.add(pod);
      const pin = st().landing.loadNext;
      if (/press \[L\]/.test(shown()) && pin !== null && plan.outside.includes(pin)) outsidePin = true;
    },
  });
  const byHand = launches.filter((launch) => launch.source === 'player').length;
  console.log(`INFO M2 (VESPER as arrived, v3): ${landedPct()}% landed in ${wall.toFixed(0)} wall s; ${launches.length - byHand} AUTODROP, ${byHand} by hand `
    + '(the review measured 75% in 494 s before)');
  check('M2: in a window of an LZ the plan does not fly the strip asks for [L], with LOAD NEXT pinned to a pod outside the plan', outsidePin);
  check('…no hand launch while it was armed took a pod the plan held for a sure window', tookHeld.length === 0 && byHand > 0, `took ${tookHeld.join(',')}`);
  check('…and the landing ends with every pod away', aboard() === 0, `${aboard()} aboard`);
}

// --- §8.3: AUTOBURN v3 with AUTODROP v3 on healthy VESPER, [B] [G] [F] only ----------------------------------------------------
{
  armLanding(h, VESPER_ROUTE, { autodrop: 3, demos: [0.05, -0.05], healDrivers: true, healInstruments: true, r: 5600, e: 0.03 });
  giveSkillFile(h.store, 'autoburn', 3, 2);
  h.step();
  h.step();
  const fuel0 = st().burn.fuelPct;
  launches.length = 0;
  const refusals: string[] = [];
  const off = on('refused', (payload) => { refusals.push(payload.reason); });
  let holding = false;
  const aim = landingOrbitAim(st(), getPrediction());
  const wall = obey(1500, { withB: true, each: () => { if (st().burn.auto.holding) holding = true; } });
  off();
  const underThrust = launches.filter((launch) => launch.thrust).length;
  console.log(`INFO §8.3 (VESPER healthy, ▼ 5,600 e 0.03, AUTOBURN v3 + AUTODROP v3): R* ${aim?.targetKm}, ${landedPct()}% landed, `
    + `${wall.toFixed(0)} wall s, FUEL ${fuel0.toFixed(1)} → ${st().burn.fuelPct.toFixed(1)}%, ${underThrust} launches under thrust`);
  check('§8.3: AUTOBURN v3 reached and held its landing orbit, and AUTODROP v3 landed every pod', holding && aboard() === 0 && landedPct() === 100
    && launches.every((launch) => launch.source === 'autodrop'), `holding ${holding} · ${aboard()} aboard · ${landedPct()}%`);
  check('…no launch under thrust and no ENGINE FIRING refusal', underThrust === 0 && !refusals.some((reason) => /ENGINE FIRING/.test(reason)), refusals.join(','));
}

// --- m2: from an exactly circular lock off the grid, v3's first burn comes ------------------------------------------------------
{
  // Sensor Interp degraded, so the nearest circle that fits is 250 km under this one: a transfer from a lock with no apsis.
  armLanding(h, VESPER_ROUTE, { autodrop: 3, demos: [0.05, -0.05], healDrivers: true, healInstruments: true, r: 6850, e: 0 });
  giveSkillFile(h.store, 'autoburn', 3, 2);
  h.store.update((draft) => { for (const seg of draft.memory) if (seg.role === 'sensor' && 'integrity' in seg) seg.integrity = 70; draft.ui.memoryRev++; });
  h.step();
  h.step();
  h.stepUntil(() => autoburnRefusal(st(), getPrediction()) === null, 60);
  h.press('KeyB');
  const start = h.wall();
  const engaged = st().burn.auto.phase === 'armed';
  h.stepUntil(() => st().burn.auto.phase === 'burning' || st().burn.auto.phase === 'pointing', 300);
  const firstBurn = h.wall() - start;
  console.log(`INFO m2 (VESPER, an e = 0 lock at 6,850, Sensor Interp 70%): v3's first burn ${firstBurn.toFixed(0)} wall s after [B] (none in 150 s before)`);
  check('m2: from an e = 0 lock v3\'s first burn comes at the next quarter turn (no ▲ chased for minutes)', engaged
    && (st().burn.auto.phase === 'burning' || st().burn.auto.phase === 'pointing') && firstBurn < 60, `${firstBurn.toFixed(0)} wall s · ${st().burn.auto.phase}`);
}
finish();
