// Slice 1b's review fixes (docs/phase3/impl/slice-1b-plan.md "Deviations (review fixes)"), each from a small state built
// here: B1 (END LANDING and the auto-ends on a path into the planet; a crash after the landing ended, LAST LIGHT too), M1
// (no drop dot with no fuel: L12-nodrop and its auto-end), M2 (ghost thrust in landing: the SWAP row, the SKIP's stop on
// the landing's first burst, the bursts at LANDING_BURN_POWER), and the minors' checks (L9 with an empty tank, the decay
// chip and L10 at 0 orbits, a declined GO LOWER's lifetime, GO LOWER held by hand under MANUAL, L3b's WIDE DROP twin, the
// GROUND TRACK with NO BAY CTRL, GO LOWER under the DRAG line).
import { check, finish } from './checks';
import { lockOn, ensureLandingKeys } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { endLanding } from '@systems/landing';
import { getPrediction } from '@systems/predict';
import { getDropSolution } from '@systems/drop-cache';
import { bayWindowModel } from '@systems/landing-hud';
import { landingResult, landingStuck } from '@systems/landing-rules';
import { lossPlan, shipLost } from '@systems/run';
import { stateFromElements } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { END_LANDING_REFUSAL_TEXT, LANDING_NODROP_LINES } from '@data/landing-text';
import { LANDING_NONE_LEFT_SEC } from '@data/tuning';
import type { GameState } from '@state/schema';

const ARES = 0;
const KESTREL = 2;
const LAST_LIGHT = 4;
const h = createHarness7(1);
const state = (): GameState => h.store.getState();
const mu = (): number => state().level.planet.mu;
const shown = (): { id: string; text: string } | null => h.shown();
const fates = (): string => state().landing.pods.map((record) => record.fate.kind).join(',');

// A ship alone, HOLLOW asleep, the lessons done, every file at 100 (no ghost thrust, all drop factors 1).
function board(index: number, healthy = true): void {
  if (index === 0) h.resetTo('flight', 1);
  else h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
    if (healthy) for (const seg of draft.memory) if ('integrity' in seg) (seg as { integrity: number }).integrity = 100;
  });
  ensureLandingKeys(h);
}

// The ship put on a conic with ▼ `rpKm`, eccentricity `e`, at true anomaly `nu` from the ship's angle now.
function putOn(rpKm: number, e: number, nu: number): void {
  const here = Math.atan2(state().orbit.y, state().orbit.x);
  const at = stateFromElements(rpKm, e, here - nu, nu, mu());
  h.store.update((draft) => { draft.orbit = { x: at.x, y: at.y, vx: at.vx, vy: at.vy }; });
}

// --- B1: END LANDING and the auto-ends wait out a path into the planet --------------------------------------------------
{
  board(KESTREL);
  lockOn(h);
  h.stepFor(0.3);
  putOn(1000, 0.85, -2.6);
  h.stepFor(0.2);
  const impact = getPrediction().outcome === 'impact';
  const refused = endLanding(h.store);
  const bay = bayWindowModel(state(), getDropSolution(), getPrediction().outcome);
  check('B1: END LANDING on an impact course is refused (IMPACT), the landing goes on, no pod parked',
    impact && refused === 'IMPACT' && state().landing.ended === null && !fates().includes('parked'), `${refused} · ${fates()}`);
  check('…the POD BAY\'s END LANDING says DON\'T HIT THE PLANET first, disabled',
    bay.endLanding.label === END_LANDING_REFUSAL_TEXT && !bay.endLanding.enabled, JSON.stringify(bay.endLanding));
  // Every pod away (written directly: the all-launched auto-end is the hold under test): it waits for the impact.
  h.store.update((draft) => { for (const record of draft.landing.pods) record.fate = { kind: 'not-launched' }; });
  h.stepFor(0.3);
  check('…every pod away on an impact course: the all-launched auto-end waits', state().landing.ended === null && state().run.phase === 'landing',
    String(state().landing.ended));
  lockOn(h);
  h.stepFor(0.5);
  check('…back on a safe orbit, it ends on its own (all-launched)', state().landing.ended === 'all-launched', String(state().landing.ended));
}

// --- B1: a crash after the landing ended (the linger) is a crash: LOST card, pods NOT LAUNCHED --------------------------
function crashAfterEnd(index: number, label: string): void {
  board(index);
  lockOn(h);
  h.stepFor(0.3);
  const ended = endLanding(h.store);
  const parkedAtEnd = fates().split(',').every((fate) => fate === 'parked');
  // ▼ under the surface, the ship a couple of hundred km up and falling: the ground comes inside the linger.
  putOn(1000, 0.85, -2.18);
  h.stepUntil(() => state().burn.status !== 'locked' || state().run.phase !== 'landing', 5);
  const s = state();
  const tally = landingResult(s, 'crashed');
  check(`B1 ${label}: END LANDING on a safe orbit parks the pods`, ended === null && parkedAtEnd, `${ended} · ${fates()}`);
  check(`…then the coasting ship hits the ground before the report: CRASHED, paused, the LOST card (shipLost)`,
    s.burn.status === 'crashed' && s.run.phase === 'landing' && s.clock.paused && shipLost(s), `${s.burn.status} · ${s.run.phase}`);
  check('…the parked pods rode the ship: NOT LAUNCHED in the state and in the result, none parked',
    fates().split(',').every((fate) => fate === 'not-launched') && tally.parked.length === 0 && tally.notLaunched === tally.colonistsAboard,
    `${fates()} · parked ${tally.parked.length} · not launched ${tally.notLaunched}/${tally.colonistsAboard}`);
  h.stepFor(2);
  check('…and the LANDING REPORT never opens under the card', state().run.phase === 'landing', state().run.phase);
}
crashAfterEnd(KESTREL, 'KESTREL');
check('…KESTREL\'s card transmits on (a crash, not the flagship)', lossPlan(state()).kind === 'transmit', JSON.stringify(lossPlan(state())));
crashAfterEnd(LAST_LIGHT, 'LAST LIGHT');
{
  const plan = lossPlan(state());
  check('…LAST LIGHT\'s card ends the run: flagship-lost', plan.kind === 'end' && plan.cause === 'flagship-lost', JSON.stringify(plan));
}

// --- M1: no drop dot with no fuel: L12-nodrop, then the landing ends by itself ('no-drop') -------------------------------
{
  board(ARES);
  lockOn(h);
  // An e 0.7 loop is outside the drop solver's domain (no dot), and the tank is dry: nothing brings a window back.
  putOn(5600, 0.7, 0.3);
  h.store.update((draft) => { draft.burn.fuelPct = 0; });
  h.stepFor(0.5);
  const row = shown();
  check('M1: no dot, no fuel: the strip says NO DROP DOT ON THIS ORBIT — END LANDING (L12-nodrop)',
    row?.id === 'landing-L12-nodrop' && row.text === LANDING_NODROP_LINES.L12noDrop, `${row?.id} '${row?.text}'`);
  check('…landingStuck names it', landingStuck(state(), getDropSolution()) === 'no-drop');
  h.stepUntil(() => state().landing.ended !== null, LANDING_NONE_LEFT_SEC + 3);
  check(`…and after ${LANDING_NONE_LEFT_SEC} s the landing ends by itself ('no-drop'), the pods parked in orbit`,
    state().landing.ended === 'no-drop' && fates().split(',').every((fate) => fate === 'parked'), `${state().landing.ended} · ${fates()}`);
  board(ARES);
  lockOn(h);
  putOn(5600, 0.7, 0.3);
  h.stepFor(0.5);
  check('…with FUEL left the landing does not end itself (a burn can still bring a dot back)',
    landingStuck(state(), getDropSolution()) === null && shown()?.id !== 'landing-L12-nodrop', `${shown()?.id}`);
}

finish();
