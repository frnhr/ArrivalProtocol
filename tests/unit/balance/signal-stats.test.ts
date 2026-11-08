// BALANCE_ONLY: slice 8 Step 0 (slice-8-plan §2.9, G6b): how often a route of run 1's arm can collect CONTACT's signals (pure, no flight; the balance report's).
// OD 84: CONTACT is priced at SIGNALS_FOR_CONTACT fragments, found by SCANning the signal `?` ship's `▓▓░▓` file (2), the gone
// resident's note (1) and two departed residents' notes (1 each): 02 §3.5's reservations, which the generator lays on the arm
// (map-generator.ts topUpReservations: `reserved.fragments` by slot). Run 1 has no CONTACT stops (no last unit's trace), so
// a route can collect what its ships hold. Over 200 run-1 arms (seeds 1–200: the authored table, the reservations rolled
// per arm) × every route of the arm (map-route.ts routes, 907 on every run-1 arm), and on the four pinned routes
// (balance/routes.ts): the share where the route flown passes ships holding ≥ SIGNALS_FOR_CONTACT fragments, so a kid who
// SCANs every signal file and note it meets can open CONTACT. Emits `contact.reach` (all routes, every route weighed alike),
// `contact.reach.<route>` and the mean fragments on a route. The playthrough's `contact.open` is what a kid then holds.
import { check, finish } from '../wp1/harness';
import { createRunMap } from '@systems/map-run';
import { routes } from '@systems/map-route';
import { UNKNOWN_EVENTS_BUILT } from '@data/unknown';
import { SIGNALS_FOR_CONTACT } from '@data/tuning';
import type { RunMapState } from '@/types/map';
import { writeMetrics } from '../support/balance-out';
import { ROUTE_SET, ROUTE_NAMES } from './routes';

const ARMS = Number(process.env.SIGNAL_ARMS ?? 200);
const started = Date.now();

const fragmentsOn = (map: Readonly<RunMapState>, route: readonly number[]): number => route.reduce((sum, slot) => {
  const ship = map.arm[slot];
  return sum + (ship === undefined || ship === null ? 0 : ship.reserved.fragments);
}, 0);

let reach = 0;
let total = 0;
let fragmentSum = 0;
let fullArms = 0;
const pinned = new Map<string, number>(ROUTE_NAMES.map((name) => [name, 0]));
for (let seed = 1; seed <= ARMS; seed++) {
  const map = createRunMap({ wave: 1 }, seed);
  const all = routes(map);
  const armFragments = map.arm.reduce((sum, ship) => sum + (ship === undefined || ship === null ? 0 : ship.reserved.fragments), 0);
  if (armFragments >= SIGNALS_FOR_CONTACT) fullArms++;
  for (const route of all) {
    const n = fragmentsOn(map, route);
    total++;
    fragmentSum += n;
    if (n >= SIGNALS_FOR_CONTACT) reach++;
  }
  for (const name of ROUTE_NAMES) if (fragmentsOn(map, ROUTE_SET[name]) >= SIGNALS_FOR_CONTACT) pinned.set(name, pinned.get(name)! + 1);
}

const pct = (part: number, whole: number): number => (whole === 0 ? NaN : (100 * part) / whole);
console.log(`signals on run 1's arm, ${ARMS} arms × their routes (${total} arm-routes), CONTACT at ${SIGNALS_FOR_CONTACT} fragments`);
console.log(`  arms holding ≥ ${SIGNALS_FOR_CONTACT} fragments anywhere: ${fullArms} of ${ARMS}`);
console.log(`  a route can collect ≥ ${SIGNALS_FOR_CONTACT}: ${pct(reach, total).toFixed(1)}% (mean ${(fragmentSum / total).toFixed(2)} fragments on a route)`);
for (const name of ROUTE_NAMES) console.log(`  the ${name} route (${ROUTE_SET[name].join(',')}): ${pinned.get(name)} of ${ARMS} arms`);
check('the `?` ships are built, so the signal ship\'s file holds its fragments', UNKNOWN_EVENTS_BUILT);
writeMetrics('signal-stats', {
  'contact.reach': pct(reach, total),
  'contact.fragments': fragmentSum / total,
  ...Object.fromEntries(ROUTE_NAMES.map((name) => [`contact.reach.${name}`, pct(pinned.get(name)!, ARMS)])),
}, { arms: ARMS, armRoutes: total });
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
finish();
