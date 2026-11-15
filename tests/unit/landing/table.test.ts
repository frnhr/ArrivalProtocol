// Slice 1a, Track SIM: the landing guidance table (01-landing §3.11, plan §1.5; landing-guidance.ts), from crafted
// contexts: each row L0–L7, L11, L12 (and its NO LZ IN THE LAUNCH BAND twin), L12b and L13 with its first-match order;
// the MIND wordings; every line within MAX_LINE_CHARS with worst-case values; none of the never-say words; and a context
// no row matches throws. Pure: no store.
// Slice 1b foundation: L2 (the flight's row) replaces 1a's thrust throw, and the new rows L5-nogo, L8, L9, L10 and
// L12-bay are wired to their context fields. Track DROP: L9 says TAB from the ship when it names a REPAIR (as L1, L8 and
// L11 do), its GO LOWER alone says [TAB] from the MIND; and a fuzz pass of crafted contexts (every one, drawn under the
// context's own invariants, matches a row that fits the strip).
import { check, finish } from './checks';
import { landingObjective, type LandingContext, type LandingObjective, type LandingRow } from '@systems/landing-guidance';
import type { FlightObjective } from '@systems/guidance';
import {
  LANDING_LINES, LANDING_ASKS, LANDING_LESSONS, LANDING_SKIP_REFUSAL, LAUNCH_REFUSAL_TEXT, LAUNCH_CONFIRM_TEXT,
  LANDING_ECHO, POD_STATE_TEXT, groundRadioLine, LANDING_DROP_LINES, LANDING_DECAY_LINES, LANDING_FLIGHT_LINES, LANDING_END_TEXT,
  LANDING_LESSONS_1B, DRAG_STAMP_TEXT, LANDING_NODROP_LINES, END_LANDING_REFUSAL_TEXT,
} from '@data/landing-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { createRng, type Rng } from '@systems/rng';
import { MAX_LINE_CHARS, PODS_MAX, WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';

// The next window: in band with room unless said otherwise.
function next(lz: string, inTac: number, launchInTac: number, inBand = true, full = false): NonNullable<LandingContext['next']> {
  return { lz, inTac, launchInTac, inBand, full };
}

// GO LOWER's fit when L9 offers it (its numbers are not read by the table).
const FIT = { targetRadiusKm: 7000, floorKm: 5100, sureTacAtTarget: 4 } as const;

// A quiet moment between windows on a two-LZ ship: L13.
function ctx(over: Partial<LandingContext> = {}): LandingContext {
  return {
    inMind: false, heldTool: null, finalShip: false, rootToDelete: false, everyPodDown: false, aboard: 3, falling: 0, block: false,
    thrust: false, open: null, nextWithRoom: 'LZ-B', roomInBand: true, canLaunch: true, bayReady: true, bayReadyInTac: 0, stuckPod: null,
    anyCanEver: true, next: next('LZ-A', 130, 132), noBandWindow: false, skipAvailable: true,
    noDrop: false, firing: false, flight: null, flightBurnInTac: null, uncertain: null, tooWide: null, decay: null, bayOffline: false, lavaInReach: null,
    impact: false, tankShort: false, autodrop: null, v3Lower: null, v3Decay: null,
    ...over,
  };
}
const open = (over: Partial<NonNullable<LandingContext['open']>> = {}): LandingContext['open'] => (
  { lz: 'LZ-A', sure: true, sureInTac: null, full: false, down: 1, count: 3, ...over });

function expect(name: string, c: LandingContext, row: LandingRow, text: string | RegExp, more: (o: LandingObjective) => boolean = () => true): void {
  const o = landingObjective(c);
  const textOk = typeof text === 'string' ? o.text === text : text.test(o.text);
  check(`${row}: ${name}`, o.row === row && textOk && more(o), `${o.row} '${o.text}' keys [${o.keys.join(',')}] ${o.urgency} ${o.layer}`);
}

// --- Each row --------------------------------------------------------------------------------------------------------
expect('the final ship, every pod down, the root to delete', ctx({ finalShip: true, aboard: 0, rootToDelete: true, everyPodDown: true }), 'L0',
  'EVERY POD IS DOWN — now DELETE THE ROOT', (o) => o.urgency === 'now' && o.layer === 'mind');
expect('...some parked (END LANDING, the auto-end): it does not claim every pod is down (review)', ctx({ finalShip: true, aboard: 0, rootToDelete: true }),
  'L0', HOLLOW_FINALE.stripWaitsNobody, (o) => o.urgency === 'now' && o.layer === 'mind');
expect('...lights the DELETE chip in the MIND', ctx({ finalShip: true, aboard: 0, rootToDelete: true, everyPodDown: true, inMind: true }), 'L0', LANDING_LINES.L0,
  (o) => o.highlight === 'tool-delete' || (o.highlight ?? '').length > 0);
expect('Nav Plotter dead', ctx({ block: true, open: open() }), 'L1', LANDING_LINES.L1,
  (o) => o.urgency === 'now' && o.layer === 'mind' && o.repairs === 'navplot' && o.keys.join() === 'TAB');
expect('...in the MIND, the TAB is done', ctx({ block: true, inMind: true }), 'L1', LANDING_LINES.L1Mind, (o) => o.keys.length === 0);
expect('an open window whose LZ is full', ctx({ open: open({ full: true }) }), 'L3', 'LZ-A FULL — hold the pods for LZ-B', (o) => o.urgency === 'now');
expect('...with no LZ left with room', ctx({ open: open({ full: true }), nextWithRoom: null }), 'L3', 'LZ-A FULL — hold the pods');
// Review M1: no LZ whose window is in the band has room (a PARTIAL orbit's other LZ is out of band).
expect('open, full, no room in the band, the launch moment come: the mislanded launch', ctx({ open: open({ full: true }), nextWithRoom: null, roomInBand: false,
  next: next('LZ-A', 0, 0, true, true) }), 'L3b', LANDING_LINES.L3b(0.75), (o) => o.keys.join() === 'L' && o.id === 'landing-L3b' && /¾/.test(o.text));
expect('...in the MIND it says [TAB] first', ctx({ inMind: true, open: open({ full: true }), nextWithRoom: null, roomInBand: false,
  next: next('LZ-A', 0, 0, true, true) }), 'L3b', /^NO ROOM IN THE BAND — \[TAB\]/, (o) => o.keys.join() === 'TAB,L');
// Review minor 8: the full LZ's dot does not fit either: the twin says WIDE DROP.
expect('minor 8: …the dot never fits this pass: WIDE DROP', ctx({ open: open({ full: true, sure: false }), nextWithRoom: null, roomInBand: false,
  next: next('LZ-A', 0, 0, true, true) }), 'L3b', LANDING_DROP_LINES.L3bWide, (o) => o.keys.join() === 'L' && o.id === 'landing-L3b-wide');
expect('minor 8: …in the MIND it says [TAB] first', ctx({ inMind: true, open: open({ full: true, sure: false }), nextWithRoom: null, roomInBand: false,
  next: next('LZ-A', 0, 0, true, true) }), 'L3b', /^NO ROOM IN THE BAND — \[TAB\], \[L\] lands in a full LZ, WIDE DROP$/);
expect('...the bay reloading: RELOADING', ctx({ open: open({ full: true }), roomInBand: false, bayReady: false, bayReadyInTac: 1.2,
  next: next('LZ-A', 0, 0, true, true) }), 'L6', 'RELOADING — next pod in 0:02');
expect('...the whole dot not in yet: the wait counts to it, no [L]', ctx({ open: open({ full: true, sure: false, sureInTac: 3 }), roomInBand: false,
  next: next('LZ-A', 0, 3, true, true) }), 'L13', 'NO ROOM IN THE BAND — LZ-A in 0:03 · [F] to SKIP, or END LANDING',
  (o) => o.id === 'landing-L13-noroom' && !o.text.includes('[L]'));
expect('no room in the band, between windows: NO ROOM IN THE BAND, the wait to the full window, never GET READY',
  ctx({ roomInBand: false, nextWithRoom: null, next: next('LZ-A', 5, 5, true, true) }), 'L13',
  'NO ROOM IN THE BAND — LZ-A in 0:05 · [F] to SKIP, or END LANDING', (o) => o.keys.join() === 'F' && o.nextLz === 'LZ-A');
expect('open, the dot fits, the bay ready', ctx({ open: open() }), 'L4', 'LAUNCH NOW — press [L] · LZ-A 1/3',
  (o) => o.keys.join() === 'L' && o.urgency === 'now' && o.layer === 'ship');
expect('...in the MIND it says [TAB] first', ctx({ open: open(), inMind: true }), 'L4', 'LAUNCH NOW — [TAB], press [L] · LZ-A 1/3',
  (o) => o.keys.join() === 'TAB,L');
expect('open, the dot\'s edges out for good (a wide drop)', ctx({ open: open({ sure: false }) }), 'L5', LANDING_LINES.L5, (o) => o.keys.join() === 'L');
expect('open, the edges coming in this pass: GET READY counts on', ctx({ open: open({ sure: false, sureInTac: 2.4 }) }), 'L7', 'GET READY — LZ-A IN 0:03');
expect('open, a pod ready, the bay reloading', ctx({ open: open(), bayReady: false, bayReadyInTac: 1.2 }), 'L6', 'RELOADING — next pod in 0:02');
expect('a launch moment within the lead', ctx({ next: next('LZ-B', 4.4, WINDOW_TACTICAL_LEAD_TAC) }), 'L7',
  'GET READY — LZ-B IN 0:08', (o) => o.urgency === 'now');
expect('...in the MIND', ctx({ inMind: true, next: next('LZ-B', 5, 5) }), 'L7', 'GET READY — [TAB], LZ-B IN 0:05');
expect('a launch moment just past the lead is still WAIT, counting to it', ctx({ next: next('LZ-B', 5, WINDOW_TACTICAL_LEAD_TAC + 0.1) }), 'L13', /^WAIT — LZ-B in 0:09/);
expect('no pod can launch now, one needs its driver repaired', ctx({ canLaunch: false, stuckPod: 7, open: open() }), 'L11',
  "POD 07 CAN'T LAUNCH — TAB, REPAIR its driver", (o) => o.urgency === 'soon' && o.layer === 'mind' && o.keys.join() === 'TAB');
expect('...in the MIND, lighting REPAIR then the driver', ctx({ canLaunch: false, stuckPod: 7, inMind: true }), 'L11', LANDING_LINES.L11Mind(7),
  (o) => o.highlight !== null && o.highlight !== undefined);
expect('...holding REPAIR, the driver itself lights', ctx({ canLaunch: false, stuckPod: 7, inMind: true, heldTool: 'repair' }), 'L11', LANDING_LINES.L11Mind(7),
  (o) => o.highlight === 'driver-pod07');
expect('pods aboard, no driver left', ctx({ canLaunch: false, anyCanEver: false }), 'L12', LANDING_LINES.L12, (o) => o.urgency === 'now' && o.id === 'landing-L12');
expect('pods aboard, no LZ ever in the band', ctx({ noBandWindow: true, roomInBand: false, next: next('LZ-A', 30, 30, false) }), 'L12',
  LANDING_LINES.L12band, (o) => o.id === 'landing-L12-band');
expect('all launched, two falling', ctx({ aboard: 0, falling: 2 }), 'L12b', 'ALL PODS AWAY · 2 FALLING', (o) => o.urgency === 'wait');
expect('all down, the linger', ctx({ aboard: 0, falling: 0 }), 'L12b', 'ALL PODS AWAY');
expect('otherwise WAIT, with the SKIP', ctx(), 'L13', 'WAIT — LZ-A in 2:12 ▸▸ · [F] to SKIP', (o) => o.keys.join() === 'F' && o.nextLz === 'LZ-A');
expect('...no [F] while a SKIP would not start', ctx({ skipAvailable: false }), 'L13', 'WAIT — LZ-A in 2:12 ▸▸', (o) => o.keys.length === 0);
expect('...an out-of-band next window says so, with no SKIP', ctx({ next: next('LZ-B', 30, 30, false) }), 'L13',
  'WAIT — LZ-B in 0:30 ▸▸ · OUT OF BAND', (o) => o.keys.length === 0 && o.nextLz === null);

// --- First match wins ------------------------------------------------------------------------------------------------
expect('L0 before L1 (the final ship waits for the root even with no drop solution)', ctx({ finalShip: true, aboard: 0, rootToDelete: true, everyPodDown: true, block: true }), 'L0', LANDING_LINES.L0);
expect('a final ship that still has pods is not L0', ctx({ finalShip: true, rootToDelete: true }), 'L13', /^WAIT/);
expect('L3 before L4 (a full LZ never says LAUNCH NOW)', ctx({ open: open({ full: true }) }), 'L3', /FULL/);
expect('L4–L6 need a pod that can launch: else L11', ctx({ open: open(), canLaunch: false, stuckPod: 2 }), 'L11', /POD 02/);
expect('a driver being repaired asks nothing: WAIT', ctx({ canLaunch: false, stuckPod: null }), 'L13', /^WAIT/);

// --- Slice 1b's rows (the foundation's wiring) ------------------------------------------------------------------------
// A flight row as guidance landingFlightRow would hand it in (a trim at ▲, 12 tac s away).
const trim: FlightObjective = { id: 'F11-rp-low', text: '▼ TOO LOW — at ▲ press [W] (PRO) and burn', keys: ['W'], urgency: 'soon', showAccept: false };
const isFlight = (o: LandingObjective): boolean => o.id === trim.id && o.text === trim.text && o.keys.join() === 'W' && o.urgency === 'soon';
expect('L2: thrust shows the flight row, its id kept', ctx({ flight: trim, thrust: true, open: open() }), 'L2', trim.text, isFlight);
expect('L2: the throttle held', ctx({ flight: trim, firing: true }), 'L2', trim.text, isFlight);
expect('L2: the offered burn within the lead', ctx({ flight: trim, flightBurnInTac: 8 }), 'L2', trim.text, isFlight);
expect('L2: the next window out of band', ctx({ flight: trim, next: next('LZ-B', 30, 30, false) }), 'L2', trim.text, isFlight);
expect('L2: no window in the band', ctx({ flight: trim, noBandWindow: true }), 'L2', trim.text, isFlight);
expect('L2: an impact course (F4) leads whatever else', ctx({ flight: { ...trim, id: 'F4-press', urgency: 'now' }, open: open() }), 'L2', trim.text);
expect('...a flight row with nothing near does not lead: L13', ctx({ flight: trim, flightBurnInTac: 8.1 }), 'L13', /^WAIT/);
expect('...thrust with no flight row no longer throws (1a\'s stub): the landing\'s own row', ctx({ thrust: true, open: open() }), 'L4', /^LAUNCH NOW/);
expect('L5\'s twin: the wide dot reaches a no-go arc', ctx({ open: open({ sure: false }), lavaInReach: 'LAVA' }), 'L5',
  'LAUNCH — press [L] · WIDE DROP, LAVA in reach', (o) => o.id === 'landing-L5-nogo' && o.keys.join() === 'L');
expect('L8: Sensor Interp hurt', ctx({ uncertain: { cause: 'hurt' } }), 'L8', LANDING_DROP_LINES.L8,
  (o) => o.urgency === 'soon' && o.layer === 'mind' && o.repairs === 'sensor' && o.keys.join() === 'TAB');
expect('...in the MIND', ctx({ uncertain: { cause: 'hurt' }, inMind: true }), 'L8', LANDING_DROP_LINES.L8Mind, (o) => o.keys.length === 0);
expect('...repairing: waited out', ctx({ uncertain: { cause: 'repairing' } }), 'L8', 'DROP UNCERTAIN — SENSOR INTERP IS REPAIRING…',
  (o) => o.id === 'landing-L8-busy' && o.keys.length === 0);
expect('...missing: no fix, the SKIP kept', ctx({ uncertain: { cause: 'missing' } }), 'L8', 'DROP UNCERTAIN — NO SENSOR INTERP · [F]',
  (o) => o.id === 'landing-L8-missing' && o.keys.join() === 'F' && o.urgency === 'wait');
const podRepair = { lz: 'LZ-B', repair: { file: 'driver', pod: 5, factor: 2 }, goLower: FIT, launchRad: 0 } as const;
expect('L9: a driver\'s REPAIR (TAB from the ship), or fly lower, with the SKIP tail', ctx({ tooWide: podRepair }),
  'L9', 'DROP TOO WIDE FOR LZ-B — TAB, REPAIR POD 05, or fly lower · [F]',
  (o) => o.urgency === 'soon' && o.keys.join() === 'TAB,F' && o.layer === 'mind');
expect('...in the MIND: no TAB, the driver lit once REPAIR is in hand', ctx({ tooWide: podRepair, inMind: true, heldTool: 'repair' }),
  'L9', 'DROP TOO WIDE FOR LZ-B — REPAIR POD 05, or fly lower · [F]', (o) => o.keys.join() === 'F' && o.highlight === 'driver-pod05');
expect('...Sensor Interp\'s REPAIR lights its chip', ctx({ tooWide: { lz: 'LZ-B', repair: { file: 'sensor', factor: 1.5 }, goLower: null, launchRad: 0 }, skipAvailable: false }),
  'L9', 'DROP TOO WIDE FOR LZ-B — TAB, REPAIR SENSOR INTERP', (o) => o.repairs === 'sensor' && o.keys.join() === 'TAB');
expect('...Nav Plotter\'s, in the MIND', ctx({ tooWide: { lz: 'LZ-A', repair: { file: 'navplot', factor: 1.5 }, goLower: null, launchRad: 0 }, inMind: true }),
  'L9', 'DROP TOO WIDE FOR LZ-A — REPAIR NAV PLOTTER · [F]', (o) => o.repairs === 'navplot' && o.keys.join() === 'F');
expect('...GO LOWER alone', ctx({ tooWide: { lz: 'LZ-C', repair: null, goLower: FIT, launchRad: 0 } }), 'L9', 'DROP TOO WIDE FOR LZ-C — fly lower · [F]',
  (o) => o.layer === 'ship' && o.keys.join() === 'F');
expect('...GO LOWER alone from the MIND says [TAB] first (the burn is flown from amber)', ctx({ tooWide: { lz: 'LZ-C', repair: null, goLower: FIT, launchRad: 0 }, inMind: true }),
  'L9', 'DROP TOO WIDE FOR LZ-C — [TAB], fly lower · [F]', (o) => o.keys.join() === 'TAB,F');
expect('...no SKIP: no tail, no [F]', ctx({ tooWide: { lz: 'LZ-C', repair: null, goLower: FIT, launchRad: 0 }, skipAvailable: false }), 'L9',
  'DROP TOO WIDE FOR LZ-C — fly lower', (o) => o.keys.length === 0);
expect('...a window open now comes first (L5 at the window, risk 12)', ctx({ tooWide: podRepair, open: open({ sure: false }) }), 'L5', LANDING_LINES.L5);
expect('L10: decay leaves the band in 2 orbits', ctx({ decay: { orbits: 2 } }), 'L10', 'ORBIT DECAYING — out of the band in 2 orbits',
  (o) => o.urgency === 'soon');
expect('L12-bay: Bay Ctrl missing', ctx({ bayOffline: true, canLaunch: false }), 'L12', LANDING_DROP_LINES.L12bay,
  (o) => o.id === 'landing-L12-bay' && o.urgency === 'now');
expect('...before L12', ctx({ bayOffline: true, canLaunch: false, anyCanEver: false }), 'L12', LANDING_DROP_LINES.L12bay);
expect('order: L8 before L9 and L11', ctx({ uncertain: { cause: 'hurt' }, tooWide: { lz: 'LZ-B', repair: null, goLower: FIT, launchRad: 0 },
  canLaunch: false, stuckPod: 3 }), 'L8', LANDING_DROP_LINES.L8);
expect('...L9 before L11', ctx({ tooWide: { lz: 'LZ-B', repair: null, goLower: FIT, launchRad: 0 }, canLaunch: false, stuckPod: 3 }), 'L9', /^DROP TOO WIDE/);
expect('...L10 before L11', ctx({ decay: { orbits: 1 }, canLaunch: false, stuckPod: 3 }), 'L10', 'ORBIT DECAYING — out of the band in 1 orbit');

// --- The foundation review's cases (its probe: .tmp/rev1b/probe.ts) ----------------------------------------------------
// B1: no drop dot (an open path, an orbit outside dropSolvable): no window, no next; the table never throws.
const capture: FlightObjective = { id: 'F10-wait', text: 'WAIT — brake at ▼ in 0:30', keys: [], urgency: 'soon', layer: 'ship', showAccept: false };
expect('B1: no dot, no flight row: L13-nodrop', ctx({ noDrop: true, next: null, nextWithRoom: null, roomInBand: false }), 'L13',
  'NO DROP DOT ON THIS PATH — fly back into the launch band', (o) => o.id === 'landing-L13-nodrop' && o.urgency === 'wait');
expect('B1: no dot, the capture 30 tac s away: L2 leads (F10-wait)', ctx({ noDrop: true, next: null, nextWithRoom: null, roomInBand: false,
  flight: capture, flightBurnInTac: 30 }), 'L2', capture.text, (o) => o.id === 'F10-wait');
// Review M1: no dot and no burn can bring one back (an empty or short tank): L12's twin says END LANDING; not on a path
// into the planet (END LANDING is refused there, the flight's row leads); a flight row that can't pay its burn yields.
expect('M1: no dot, the tank empty: L12-nodrop', ctx({ noDrop: true, tankShort: true, next: null, nextWithRoom: null, roomInBand: false }), 'L12',
  LANDING_NODROP_LINES.L12noDrop, (o) => o.id === 'landing-L12-nodrop' && o.urgency === 'now');
expect('M1: …the tank short of the trim: the unpaid trim yields to it', ctx({ noDrop: true, tankShort: true, next: null, nextWithRoom: null,
  roomInBand: false, flight: capture, flightBurnInTac: 30 }), 'L12', LANDING_NODROP_LINES.L12noDrop);
expect('M1: …on a path into the planet the flight\'s row leads', ctx({ noDrop: true, tankShort: true, impact: true, next: null, nextWithRoom: null,
  roomInBand: false, flight: capture, flightBurnInTac: 30 }), 'L2', capture.text);
expect('M1: …in the MIND it says [TAB] first', ctx({ inMind: true, noDrop: true, tankShort: true, next: null, nextWithRoom: null, roomInBand: false }),
  'L12', /^NO DROP DOT ON THIS ORBIT — \[TAB\], END LANDING/);
expect('B1: no dot and every pod away: still L12b', ctx({ noDrop: true, next: null, aboard: 0, falling: 1 }), 'L12b', 'ALL PODS AWAY · 1 FALLING');
// M2: an offered burn within the lead yields to an open window a pod can launch in.
const ready: FlightObjective = { ...trim, id: 'F11-ready', text: 'GET READY — BURN IN 0:05', keys: [], urgency: 'now' };
expect('M2: open sure window, a trim 5 tac s away: LAUNCH NOW first', ctx({ open: open(), flight: ready, flightBurnInTac: 5 }), 'L4', /^LAUNCH NOW/);
expect('M2: ...the bay reloading: RELOADING first', ctx({ open: open(), bayReady: false, bayReadyInTac: 1, flight: ready, flightBurnInTac: 5 }), 'L6', /^RELOADING/);
expect('M2: ...no pod can launch: the burn leads', ctx({ open: open(), canLaunch: false, stuckPod: 2, flight: ready, flightBurnInTac: 5 }), 'L2', ready.text);
expect('M2: ...the dot not sure yet (GET READY to it): the burn leads', ctx({ open: open({ sure: false, sureInTac: 3 }), flight: ready, flightBurnInTac: 5 }),
  'L2', ready.text);
expect('M2: ...firing still leads over the window', ctx({ open: open(), flight: ready, flightBurnInTac: 5, firing: true }), 'L2', ready.text);
// M3: Bay Ctrl missing comes before any window row ([L] refuses BAY OFFLINE) and before L11.
expect('M3: bay offline over an open sure window: L12-bay, never LAUNCH NOW', ctx({ bayOffline: true, open: open() }), 'L12', LANDING_DROP_LINES.L12bay,
  (o) => o.id === 'landing-L12-bay');
expect('M3: ...and before a driver REPAIR that can\'t help', ctx({ bayOffline: true, canLaunch: false, stuckPod: 4 }), 'L12', LANDING_DROP_LINES.L12bay);
// M4: L10 above L8 and L9; its key only from a LIFT-* row.
expect('M4: decaying with a wide dot: L10, not `fly lower`', ctx({ next: next('LZ-B', 60, 60), decay: { orbits: 1 },
  tooWide: { lz: 'LZ-B', repair: null, goLower: FIT, launchRad: 0 } }), 'L10', 'ORBIT DECAYING — out of the band in 1 orbit');
expect('M4: ...over DROP UNCERTAIN too', ctx({ decay: { orbits: 2 }, uncertain: { cause: 'hurt' } }), 'L10', /^ORBIT DECAYING/);
expect('minor 2: ▼ already under the band: ORBIT DECAYED, not `in 1 orbit`', ctx({ decay: { orbits: 0 } }), 'L10', 'ORBIT DECAYED — ▼ is out of the band');
expect('M4: ...a GO-LOW row\'s [S] is not L10\'s key', ctx({ decay: { orbits: 1 }, flight: { ...capture, id: 'GO-LOW-wait', keys: ['S'] }, flightBurnInTac: 40 }),
  'L10', /^ORBIT DECAYING/, (o) => o.keys.length === 0);
expect('M4: ...a LIFT row\'s [W] is', ctx({ decay: { orbits: 1 }, flight: { ...capture, id: 'LIFT-apo', keys: ['W'] }, flightBurnInTac: 40 }),
  'L10', /^ORBIT DECAYING/, (o) => o.keys.join() === 'W');
// The warning colour of a flight row survives L2; an L9 with neither fix throws (dropTooWide returns null then).
expect('L2 keeps the flight row\'s warn', ctx({ flight: { ...trim, warn: true }, thrust: true }), 'L2', trim.text, (o) => o.warn === true);
{
  let threw = false;
  try { landingObjective(ctx({ tooWide: { lz: 'LZ-B', repair: null, goLower: null, launchRad: 0 } })); } catch { threw = true; }
  check('L9 with neither a REPAIR nor GO LOWER throws', threw);
}

// --- The fuzz pass (Track DROP): crafted contexts under the context's own invariants all match a row -------------------
// Each draw is a situation the game can be in (buildLandingContext's shape): no solution or no dot means no window and no
// next; with a solution and a dot every LZ has a next window; dropTooWide never hands L9 neither fix; Bay Ctrl missing
// means no pod can launch; an open window counting to its sure part is not sure yet. Every one must match a row (never
// the dev throw), fit the strip, and keep L2's id from the flight row.
{
  const flights: (FlightObjective | null)[] = [
    null, trim, capture, ready,
    { id: 'F4-press', text: "DON'T HIT THE PLANET — press [W] (PRO) and burn", keys: ['W'], urgency: 'now', showAccept: false },
    { id: 'LIFT-apo', text: `${LANDING_FLIGHT_LINES.liftProblem} — at ▲ press [W] (PRO) and burn`, keys: ['W'], urgency: 'soon', showAccept: false },
    { id: 'GO-LOW-keep', text: LANDING_FLIGHT_LINES.goLowKeep('LZ-D'), keys: ['SPACE'], urgency: 'now', showAccept: false },
  ];
  const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
  const maybe = (rng: Rng, p = 0.5): boolean => rng() < p;
  const lzs = ['LZ-A', 'LZ-B', 'LZ-C', 'LZ-D'];
  type Hint = NonNullable<LandingContext['tooWide']>['repair'];
  const draw = (rng: Rng): LandingContext => {
    const drop = pick(rng, ['solved', 'solved', 'solved', 'block', 'no-dot'] as const);
    const solved = drop === 'solved';
    const aboard = maybe(rng, 0.85) ? 1 + Math.floor(rng() * PODS_MAX) : 0;
    const bayOffline = maybe(rng, 0.1);
    const anyCanEver = maybe(rng, 0.85);
    const canLaunch = !bayOffline && anyCanEver && maybe(rng, 0.75);
    const sure = maybe(rng);
    const openWin = solved && maybe(rng, 0.4) ? open({
      lz: pick(rng, lzs), sure, sureInTac: !sure && maybe(rng) ? rng() * 6 : null, full: maybe(rng, 0.2),
      down: Math.floor(rng() * 4), count: 4,
    }) : null;
    const inBand = maybe(rng, 0.85);
    const tac = rng() * 400;
    const goLower = maybe(rng);
    const repairs: Hint[] = [null, { file: 'driver', pod: 1 + Math.floor(rng() * PODS_MAX), factor: 2 }, { file: 'sensor', factor: 2.5 },
      { file: 'navplot', factor: 1.5 }];
    const repair = goLower ? pick(rng, repairs) : pick(rng, repairs.slice(1));
    return ctx({
      inMind: maybe(rng, 0.3), heldTool: maybe(rng, 0.2) ? 'repair' : null, finalShip: maybe(rng, 0.15), rootToDelete: maybe(rng, 0.3),
      everyPodDown: maybe(rng, 0.3), aboard, falling: Math.floor(rng() * 3), block: drop === 'block', noDrop: drop === 'no-dot',
      thrust: maybe(rng, 0.1), firing: maybe(rng, 0.1), open: openWin, nextWithRoom: maybe(rng) ? pick(rng, lzs) : null,
      roomInBand: maybe(rng, 0.8), canLaunch, bayReady: maybe(rng, 0.7), bayReadyInTac: rng() * 20,
      stuckPod: !canLaunch && anyCanEver && maybe(rng, 0.4) ? 1 + Math.floor(rng() * PODS_MAX) : null, anyCanEver,
      next: solved ? next(pick(rng, lzs), tac, tac + rng() * 5, inBand, maybe(rng, 0.2)) : null,
      noBandWindow: solved && !inBand && maybe(rng, 0.5), skipAvailable: maybe(rng, 0.6),
      flight: pick(rng, flights), flightBurnInTac: maybe(rng) ? rng() * 20 : null,
      uncertain: solved && maybe(rng, 0.2) ? { cause: pick(rng, ['hurt', 'repairing', 'moving', 'missing'] as const) } : null,
      tooWide: solved && maybe(rng, 0.3) ? { lz: pick(rng, lzs), repair, goLower: goLower ? FIT : null, launchRad: 0 } : null,
      decay: maybe(rng, 0.15) ? { orbits: 1 + Math.floor(rng() * 2) } : null, bayOffline,
      lavaInReach: solved && openWin !== null && maybe(rng, 0.3) ? pick(rng, ['LAVA', 'CLIFFS']) : null,
      impact: maybe(rng, 0.1), tankShort: maybe(rng, 0.3),
    });
  };
  const rng = createRng(1813);
  const failures: string[] = [];
  const rows = new Set<string>();
  const DRAWS = 2000;
  for (let i = 0; i < DRAWS; i++) {
    const c = draw(rng);
    try {
      const o = landingObjective(c);
      rows.add(o.id);
      if (o.text.length > MAX_LINE_CHARS) failures.push(`#${i} '${o.text}' is ${o.text.length} chars`);
      if (o.row === 'L2' && o.id !== c.flight?.id) failures.push(`#${i} L2 lost the flight row's id (${o.id})`);
    } catch (error) {
      failures.push(`#${i} ${(error as Error).message.slice(0, 160)}`);
    }
  }
  check(`fuzz: ${DRAWS} crafted contexts each match a row that fits the strip`, failures.length === 0, failures.slice(0, 3).join(' | '));
  const wanted = ['landing-L1', 'landing-L4', 'landing-L5', 'landing-L5-nogo', 'landing-L8', 'landing-L8-missing', 'landing-L9', 'landing-L10',
    'landing-L11', 'landing-L12', 'landing-L12-bay', 'landing-L12-nodrop', 'landing-L12b', 'landing-L13', 'landing-L13-nodrop', 'F11-rp-low'];
  const unseen = wanted.filter((id) => !rows.has(id));
  check('fuzz: …and the draws reach every kind of row (the pass is not vacuous)', unseen.length === 0, `unseen: ${unseen.join(', ')}`);
}

// --- No match throws --------------------------------------------------------------------------------------------------
{
  let message = '';
  try { landingObjective(ctx({ next: null })); } catch (error) { message = (error as Error).message; }
  check('a context no row matches throws', /no row matches/.test(message), message.slice(0, 80));
}

// --- Every line fits the strip, with worst-case values ----------------------------------------------------------------
{
  const longLz = 'LZ-D';
  const worstTac = 59 * 60 + 59;
  const lines: string[] = [];
  for (const inMind of [false, true]) {
    const worst = (over: Partial<LandingContext>): string => landingObjective(ctx({ inMind, ...over })).text;
    lines.push(
      worst({ finalShip: true, aboard: 0, rootToDelete: true }),
      worst({ block: true }),
      worst({ open: open({ lz: longLz, full: true }), nextWithRoom: longLz }),
      worst({ open: open({ lz: longLz, full: true }), roomInBand: false, nextWithRoom: null, next: next(longLz, 0, 0, true, true) }),
      worst({ roomInBand: false, nextWithRoom: null, next: next(longLz, worstTac, worstTac, true, true) }),
      worst({ finalShip: true, aboard: 0, rootToDelete: true, everyPodDown: true }),
      worst({ open: open({ lz: longLz, down: PODS_MAX, count: PODS_MAX }) }),
      worst({ open: open({ sure: false }) }),
      worst({ open: open({ lz: longLz, sure: false, sureInTac: worstTac }) }),
      worst({ open: open(), bayReady: false, bayReadyInTac: worstTac }),
      worst({ next: next(longLz, 1, worstTac) }),
      worst({ canLaunch: false, stuckPod: PODS_MAX }),
      worst({ canLaunch: false, anyCanEver: false }),
      worst({ noBandWindow: true, next: next(longLz, worstTac, worstTac, false) }),
      worst({ aboard: 0, falling: PODS_MAX }),
      worst({ next: next(longLz, worstTac, worstTac) }),
      worst({ next: next(longLz, worstTac, worstTac, false) }),
      LANDING_LINES.L13(longLz, worstTac, true, true),
      worst({ open: open({ lz: longLz, sure: false }), lavaInReach: 'CLIFFS' }),
      worst({ uncertain: { cause: 'hurt' } }),
      worst({ uncertain: { cause: 'repairing' } }),
      worst({ uncertain: { cause: 'moving' } }),
      worst({ uncertain: { cause: 'missing' } }),
      worst({ tooWide: { lz: longLz, repair: { file: 'sensor', factor: 2.5 }, goLower: FIT, launchRad: 0 } }),
      worst({ tooWide: { lz: longLz, repair: { file: 'navplot', factor: 1.5 }, goLower: FIT, launchRad: 0 } }),
      worst({ tooWide: { lz: longLz, repair: { file: 'driver', pod: PODS_MAX, factor: 2 }, goLower: FIT, launchRad: 0 } }),
      worst({ tooWide: { lz: longLz, repair: null, goLower: FIT, launchRad: 0 } }),
      worst({ decay: { orbits: 2 } }),
      worst({ bayOffline: true }),
      worst({ noDrop: true, next: null }),
      worst({ noDrop: true, next: null, tankShort: true }),
      worst({ open: open({ lz: longLz, full: true, sure: false }), roomInBand: false, nextWithRoom: null, next: next(longLz, 0, 0, true, true) }),
      LANDING_DROP_LINES.L9(longLz, 'SENSOR INTERP', true, true) + LANDING_DROP_LINES.L9skip,
      LANDING_DROP_LINES.L9(longLz, 'NAV PLOTTER', true, true) + LANDING_DROP_LINES.L9skip,
      LANDING_DROP_LINES.L9(longLz, 'POD 16', true, true) + LANDING_DROP_LINES.L9skip,
      LANDING_FLIGHT_LINES.goLow('turn to RETRO with [Q]/[E]') + LANDING_FLIGHT_LINES.forLz(longLz),
      LANDING_FLIGHT_LINES.goLowKeep(longLz), LANDING_FLIGHT_LINES.goLowRelease,
      `${LANDING_FLIGHT_LINES.liftProblem} — at ▲ turn to PRO with [Q]/[E] and burn`, LANDING_FLIGHT_LINES.liftKeep,
    );
  }
  const long = lines.filter((text) => text.length > MAX_LINE_CHARS);
  check(`every landing line is at most ${MAX_LINE_CHARS} chars with worst-case values`, long.length === 0, long.join(' | '));

  // The never-say words (landing-text's header): no scatter, deorbit or insertion anywhere, and IMPACT is the ship's crash.
  const words = [
    ...lines, ...Object.values(LAUNCH_REFUSAL_TEXT), ...Object.values(LANDING_SKIP_REFUSAL), ...Object.values(POD_STATE_TEXT),
    LANDING_ASKS.hurtDriver(PODS_MAX), LANDING_ASKS.mindClear(longLz), LANDING_LESSONS.dot,
    LANDING_LESSONS.split([{ lz: 'LZ-A', pods: 3 }, { lz: 'LZ-B', pods: 2 }]),
    LAUNCH_CONFIRM_TEXT.offSite('PLAINS', 100), LAUNCH_CONFIRM_TEXT.full(longLz, 150), LAUNCH_CONFIRM_TEXT.endLanding(3),
    LANDING_ECHO.launch(PODS_MAX, null), LANDING_ECHO.touchdown(3, 'off-site', null, 'hard'), LANDING_ECHO.parked(3),
    groundRadioLine(PODS_MAX, 'Okafor', 'Is it morning?'),
    LAUNCH_CONFIRM_TEXT.noGo('CLIFFS', 0), DRAG_STAMP_TEXT.kick('▲', 1234), LANDING_DECAY_LINES.L10(1),
    ...Object.values(LANDING_END_TEXT).filter((text): text is string => text !== null), ...Object.values(LANDING_LESSONS_1B), END_LANDING_REFUSAL_TEXT,
  ];
  const banned = words.filter((text) => /scatter|deorbit|insertion|impact/i.test(text) || /\blost\b|offline|not recovered/i.test(text));
  check('none of the never-say words (scatter, deorbit, insertion, IMPACT; a pod is never lost, offline or not recovered)',
    banned.length === 0, banned.join(' | '));
  const tooLong = words.filter((text) => text.length > MAX_LINE_CHARS);
  check('the landing\'s other strip and TERMINAL words fit too', tooLong.length === 0, tooLong.join(' | '));
}

finish();
