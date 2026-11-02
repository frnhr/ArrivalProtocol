// Slice 3b foundation: the delivery rule (02-map §3.9, §3.14; slice-3b-plan §4.2), pure. Every cell of the worked route's
// request table: detours, first lateness, the receiver years, forwarding along the route; the forecasts the REPOSITORY
// shows at each desk (IN TIME, `SHIP n AT THE EARLIEST`, NEVER into the final ship); and the one light rule messages ride
// (05 §3.12's stamps). Track TESTS extends it (the INFO profile over fresh arms).
import { check, finish } from '../landing/checks';
import {
  detourYears, firstLateness, arrivedYear, forwardLateness, receiverYear, deliveryForecast, lightArrival,
} from '@systems/delivery-rule';
import { hopBetween } from '@systems/map-hop';
import type { RouteStop } from '@/types/map';
import { run1Map, WORKED_ROUTE } from './run1-fixture';

const map = run1Map();
const [ARES, HALCYON, KESTREL, VESPER, CORMORANT, LAST_LIGHT] = WORKED_ROUTE as [number, number, number, number, number, number];
const hop = (from: number, to: number) => hopBetween(map, from, to);

// The table's rows: requested at → for the next ship of the worked route.
const rows: [string, number, number][] = [
  ['ARES-VII → HALCYON (Mv)', ARES, HALCYON],
  ['HALCYON → KESTREL (Rm)', HALCYON, KESTREL],
  ['KESTREL → VESPER (Swap)', KESTREL, VESPER],
  ['VESPER → CORMORANT (Cp)', VESPER, CORMORANT],
  ['CORMORANT → LAST LIGHT (any)', CORMORANT, LAST_LIGHT],
];
const col = (pick: (from: number, to: number) => number): string => rows.map(([, from, to]) => pick(from, to)).join();

check('detour: 8+29−21 = 16, 29+55−26 = 58, 55+107−55 = 107, 107+129−30 = 206, 129+180−54 = 255',
  col(detourYears.bind(null, map)) === '16,58,107,206,255', col(detourYears.bind(null, map)));
check('first lateness = detour − slack: −15, −31, +4, +44, +106',
  col(firstLateness.bind(null, map)) === '-15,-31,4,44,106', col(firstLateness.bind(null, map)));
check('in the first receiver: A(S0) + |S0−SOL| + |SOL−S1| = 2337, 2436, 2629, 2861, 3126',
  col(arrivedYear.bind(null, map)) === '2337,2436,2629,2861,3126', col(arrivedYear.bind(null, map)));
check('…the receiver year is also approach + lateness (2352 − 15 = 2337 … 2817 + 44 = 2861)',
  rows.every(([, from, to]) => receiverYear(hop(from, to).approachYear, firstLateness(map, from, to)) === arrivedYear(map, from, to)));

// Forwarding (02 §3.9: lateness − the next ship's slack, until it reaches 0).
const swapAtCormorant = forwardLateness(firstLateness(map, KESTREL, VESPER), hop(VESPER, CORMORANT));
check('Swap: 4 late at VESPER (2629 > 2625), then 4 − 162 = −158 at CORMORANT, its receiver in 2659',
  firstLateness(map, KESTREL, VESPER) === 4 && hop(KESTREL, VESPER).approachYear === 2625 && swapAtCormorant === -158
  && receiverYear(hop(VESPER, CORMORANT).approachYear, swapAtCormorant) === 2659, `${swapAtCormorant}`);
const cpAtLastLight = forwardLateness(firstLateness(map, VESPER, CORMORANT), hop(CORMORANT, LAST_LIGHT));
// The plan's §4.2 row reads "2861 at LAST LIGHT": 2861 is CORMORANT's receiver; forwarded by the rule it reaches LAST
// LIGHT's in 3020 − 105 = 2915 (the foundation's deviation 3).
check('Cp: 44 late at CORMORANT (its receiver 2861), then 44 − 149 = −105 at LAST LIGHT, its receiver in 2915',
  receiverYear(2817, 44) === 2861 && cpAtLastLight === -105 && receiverYear(hop(CORMORANT, LAST_LIGHT).approachYear, cpAtLastLight) === 2915,
  `${cpAtLastLight}`);

// The forecasts at each desk of the worked route (the destination at depth 2 … 6).
const forecasts = rows.map(([, from, to], index) => deliveryForecast(map, from, to, index + 2));
const [mv, rm, swap, cp, last] = forecasts;
check('Mv from ARES-VII: IN TIME, arrives 2337, HALCYON approach 2352',
  mv?.kind === 'in-time' && mv.arrivedYear === 2337 && mv.approachYear === 2352, JSON.stringify(mv));
check('Rm from HALCYON: IN TIME, arrives 2436, KESTREL approach 2467',
  rm?.kind === 'in-time' && rm.arrivedYear === 2436 && rm.approachYear === 2467, JSON.stringify(rm));
check('Swap from KESTREL: 4 YRS LATE → SHIP 5 AT THE EARLIEST',
  swap?.kind === 'late' && swap.yearsLate === 4 && swap.earliestDepth === 5 && swap.approachYear === 2625, JSON.stringify(swap));
check('Cp from VESPER: 44 YRS LATE → SHIP 6 AT THE EARLIEST',
  cp?.kind === 'late' && cp.yearsLate === 44 && cp.earliestDepth === 6, JSON.stringify(cp));
check('anything from CORMORANT into LAST LIGHT: NEVER (no ship after the final one), 106 late',
  last?.kind === 'never' && last.yearsLate === 106, JSON.stringify(last));
check('the default depth is the next ship from the route\'s current one (ARES-VII: depth 2)',
  JSON.stringify(deliveryForecast(map, ARES, KESTREL)) === JSON.stringify(deliveryForecast(map, ARES, KESTREL, 2)));

// The light rule (plan §2.4): it reproduces 05 §3.12's stamps.
let stops: RouteStop[] = [{ slot: ARES, depth: 1, hop: null }];
for (let i = 1; i < WORKED_ROUTE.length; i++) stops = [...stops, { slot: WORKED_ROUTE[i]!, depth: i + 1, hop: hop(WORKED_ROUTE[i - 1]!, WORKED_ROUTE[i]!) }];
const welcome = lightArrival(map, { kind: 'sol' }, 2280, stops, 0);
check('the welcome: SENT 2280 · RECEIVED 2288, read on ARES-VII', welcome?.depth === 1 && welcome.receivedYear === 2288, JSON.stringify(welcome));
const kestrelReply = lightArrival(map, { kind: 'sol' }, 2467 + 55, stops, 3);
check('the KESTREL reply: SENT 2522 · RECEIVED 2651, read at CORMORANT (two ships later; VESPER is 4 years too early)',
  kestrelReply?.depth === 5 && kestrelReply.receivedYear === 2651, JSON.stringify(kestrelReply));
const riverside = lightArrival(map, { kind: 'world', worldSlot: ARES }, 2301, stops, 1);
check('RIVERSIDE\'s year-1 postcard: SENT 2301 · RECEIVED 2322, read at HALCYON', riverside?.depth === 2 && riverside.receivedYear === 2322,
  JSON.stringify(riverside));
const armComplete = lightArrival(map, { kind: 'sol' }, 2280, stops.slice(-1), 0);
check('the arm-complete letter at the final ship: SENT 2280 · RECEIVED 2460', armComplete?.depth === 6 && armComplete.receivedYear === 2460,
  JSON.stringify(armComplete));
check('a message no stop of the route can take yet is null (a later stop may)',
  lightArrival(map, { kind: 'sol' }, 2900, stops.slice(0, 3), 0) === null);

finish();
