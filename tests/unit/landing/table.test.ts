// Slice 1a, Track SIM: the landing guidance table (01-landing §3.11, plan §1.5; landing-guidance.ts), from crafted
// contexts: each row L0–L7, L11, L12 (and its NO LZ IN THE LAUNCH BAND twin), L12b and L13 with its first-match order;
// the MIND wordings; every line within MAX_LINE_CHARS with worst-case values; none of the never-say words; and a context
// no row matches throws. Pure: no store.
import { check, finish } from './checks';
import { landingObjective, type LandingContext, type LandingObjective, type LandingRow } from '@systems/landing-guidance';
import {
  LANDING_LINES, LANDING_ASKS, LANDING_LESSONS, LANDING_BEATS, LANDING_SKIP_REFUSAL, LAUNCH_REFUSAL_TEXT, LAUNCH_CONFIRM_TEXT,
  LANDING_ECHO, POD_STATE_TEXT, groundRadioLine,
} from '@data/landing-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { MAX_LINE_CHARS, PODS_MAX, WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';

// The next window: in band with room unless said otherwise.
function next(lz: string, inTac: number, launchInTac: number, inBand = true, full = false): NonNullable<LandingContext['next']> {
  return { lz, inTac, launchInTac, inBand, full };
}

// A quiet moment between windows on a two-LZ ship: L13.
function ctx(over: Partial<LandingContext> = {}): LandingContext {
  return {
    inMind: false, heldTool: null, finalShip: false, rootToDelete: false, everyPodDown: false, aboard: 3, falling: 0, block: false,
    thrust: false, open: null, nextWithRoom: 'LZ-B', roomInBand: true, canLaunch: true, bayReady: true, bayReadyInTac: 0, stuckPod: null,
    anyCanEver: true, next: next('LZ-A', 130, 132), noBandWindow: false, skipAvailable: true, ...over,
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

// --- L2 (1b) is asserted absent ---------------------------------------------------------------------------------------
{
  let threw = false;
  try { landingObjective(ctx({ thrust: true })); } catch { threw = true; }
  check('L2: thrust during the landing throws in dev (the engine is closed in 1a)', threw);
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
    );
  }
  const long = lines.filter((text) => text.length > MAX_LINE_CHARS);
  check(`every landing line is at most ${MAX_LINE_CHARS} chars with worst-case values`, long.length === 0, long.join(' | '));

  // The never-say words (landing-text's header): no scatter, deorbit or insertion anywhere, and IMPACT is the ship's crash.
  const words = [
    ...lines, ...Object.values(LAUNCH_REFUSAL_TEXT), ...Object.values(LANDING_SKIP_REFUSAL), ...Object.values(POD_STATE_TEXT),
    LANDING_ASKS.hurtDriver(PODS_MAX), LANDING_ASKS.mindClear(longLz), LANDING_LESSONS.dot,
    LANDING_LESSONS.split([{ lz: 'LZ-A', pods: 3 }, { lz: 'LZ-B', pods: 2 }]), LANDING_BEATS.start, LANDING_BEATS.firstDown,
    LAUNCH_CONFIRM_TEXT.offSite('PLAINS', 100), LAUNCH_CONFIRM_TEXT.full(longLz, 150), LAUNCH_CONFIRM_TEXT.endLanding(3),
    LANDING_ECHO.launch(PODS_MAX, null), LANDING_ECHO.touchdown(3, 'off-site', null, 'hard'), LANDING_ECHO.parked(3),
    groundRadioLine(PODS_MAX, 'Okafor', 'Is it morning?'),
  ];
  const banned = words.filter((text) => /scatter|deorbit|insertion|impact/i.test(text) || /\blost\b|offline|not recovered/i.test(text));
  check('none of the never-say words (scatter, deorbit, insertion, IMPACT; a pod is never lost, offline or not recovered)',
    banned.length === 0, banned.join(' | '));
  const tooLong = words.filter((text) => text.length > MAX_LINE_CHARS);
  check('the landing\'s other strip and TERMINAL words fit too', tooLong.length === 0, tooLong.join(' | '));
}

finish();
