// Slice 4, Track FLIGHT (plan §6; 03 §3.7): AUTOBURN's rows and tails on the strip, from pure contexts (no store).
// • Precedence: the ▼ correction rows (F6, F6-resume, F7, F8, F8-debris) outrank the ARMED row and carry ` · AUTO ARMED`
//   when it fits; ARMED keeps `wait` and names the burn it waits for (`brakes at ▼`, `trims at ▲`, `rounds it at ▼`).
// • The thread wait is ARMED's urgent variant: `AUTOBURN NEEDS A THREAD IN 0:08 — × AN OP` ([TAB] first from the ship),
//   and NOW once overdue.
// • The tails: ` · or [B] AUTO` (v1) / ` · or [B] GREEN` (v2) on the capture and trim lines; HOLD STEADY's ` · or [B]
//   ROUND`; L13's ` · or [B] ROUND` in LANDING, and ` · AUTO ARMED` while it waits; tails never change the winning row.
// • v2's flying rows (TRIMMING, ROUNDING) and hand-backs (GREEN ORBIT, SAVING FUEL, a downgrade).
// • Every line ≤ 70, with worst-case numbers.
import { check, finish } from '../wp1/harness';
import { flightObjective, landingFlightRow, type FlightContext } from '@systems/guidance';
import { landingObjective, type LandingContext } from '@systems/landing-guidance';
import { AUTOBURN_TEXT } from '@data/skill-text';
import { MAX_LINE_CHARS } from '@data/tuning';

const fits = (text: string | undefined): boolean => text !== undefined && text.length <= MAX_LINE_CHARS;
const ring = { min: 5000, max: 7000 };
const capture: NonNullable<FlightContext['burnPoint']> = {
  reason: 'capture', preset: 'retrograde', event: 'peri', eventInSec: 9000, inSec: 8000, dvKmS: 1.2, estBurnSec: 240,
  approaching: true, firstOfTwo: false, inTac: 60, burnTac: 9.6,
};
const idle: FlightContext['autoburn'] = { phase: 'idle', sinceSec: 0, armedInTac: 0, end: null };
const armedFor = (kind: 'capture' | 'trim' | 'round', inTac: number, glyph: '▼' | '▲' = '▼', waiting = false): FlightContext['autoburn'] => (
  { phase: 'armed', sinceSec: 1, armedInTac: Math.max(0, inTac), end: null, armed: { kind, glyph, inTac, waiting }, flying: null, doneLine: null });
// KESTREL-like: an open path inbound, ▼ in the ring, the capture 60 tac s off.
const base: FlightContext = {
  status: 'approaching', landing: false, offer: null, goLow: null, outcome: 'open', rp: 6000, inRing: false, outbound: false, ring,
  liftPreset: null, spareController: null, rpRateTac: 0, sweetLo: 5500, sweetHi: 6500, sasMode: 'retrograde', firing: false, firingFor: null,
  thrustOn: false, outOfFuel: false, fuelShort: false, acceptOnly: false, strandedAnyway: false, cannotClose: false, presetsAvailable: true,
  plotFault: null, engineFault: null, inMind: false, skipAvailable: true, burnPoint: capture, periTac: 70, showAccept: false, debris: null,
  autoburn: idle, autoAvailable: false, autoOffer: null,
};

// --- Precedence: the correction rows over ARMED, with its tail -----------------------------------------------------------
{
  const armed = armedFor('capture', 60);
  const wide = flightObjective({ ...base, rp: 9000, sasMode: 'radial-in', autoburn: armed });
  const low = flightObjective({ ...base, rp: 4000, sasMode: 'radial-out', autoburn: armed });
  const keep = flightObjective({ ...base, rp: 9000, sasMode: 'radial-in', firing: true, thrustOn: true, autoburn: armed });
  const debris = flightObjective({ ...base, rp: 9000, sasMode: 'radial-in', debris: { rack: 'C', dodgeInTac: 42 }, autoburn: armed });
  check('armed: TOO WIDE outranks ARMED and carries ` · AUTO ARMED`', wide?.id === 'F8-hold' && wide.text === 'TOO WIDE — hold [SPACE] · AUTO ARMED', wide?.text);
  check('…▼ TOO LOW too', low?.id === 'F7-hold' && low.text.endsWith(AUTOBURN_TEXT.armedTail), low?.text);
  check('…and the running correction (F6-keep)', keep?.id === 'F6-keep' && keep.text.endsWith(AUTOBURN_TEXT.armedTail), keep?.text);
  check('…the debris dodge keeps its countdown, and the tail only where it fits', debris?.id.startsWith('F8-debris') === true && fits(debris?.text)
    && debris!.text.includes('to dodge'), debris?.text);
  const quiet = flightObjective({ ...base, autoburn: armed });
  check('with ▼ in the ring: the ARMED row (wait, SKIP lit)', quiet?.id === 'AUTO-armed' && quiet.urgency === 'wait'
    && quiet.text === 'AUTOBURN ARMED — it brakes at ▼ in 1:00 · [B] to cancel · [F] SKIP' && quiet.keys.join() === 'F', quiet?.text);
  const unarmedWide = flightObjective({ ...base, rp: 9000, sasMode: 'radial-in' });
  check('…not armed: plain TOO WIDE (no tail)', unarmedWide?.text === 'TOO WIDE — hold [SPACE]', unarmedWide?.text);
}

// --- ARMED's variants and the thread wait ----------------------------------------------------------------------------------
{
  const trimBurn: NonNullable<FlightContext['burnPoint']> = { ...capture, reason: 'rp-high', preset: 'retrograde', event: 'apo', inTac: 432, approaching: true };
  const closed = { ...base, outcome: 'closed' as const, rp: 7600, burnPoint: trimBurn };
  const trim = flightObjective({ ...closed, autoburn: armedFor('trim', 432, '▲') });
  check('between GREEN\'s burns: `AUTOBURN ARMED — trims at ▲ in 7:12 · [B] to cancel · [F] SKIP`',
    trim?.text === 'AUTOBURN ARMED — trims at ▲ in 7:12 · [B] to cancel · [F] SKIP' && trim.urgency === 'wait', trim?.text);
  const wait = flightObjective({ ...base, autoburn: armedFor('capture', 8, '▼', true) });
  const waitMind = flightObjective({ ...base, inMind: true, autoburn: armedFor('capture', 8, '▼', true) });
  const late = flightObjective({ ...base, autoburn: armedFor('capture', -3, '▼', true) });
  check('every thread busy at the claim: urgent, [TAB] from the ship, `× AN OP`', wait?.id === 'AUTO-thread' && wait.urgency === 'now'
    && wait.text === 'AUTOBURN NEEDS A THREAD IN 0:08 — [TAB], × AN OP' && wait.keys.join() === 'TAB' && wait.layer === 'mind', wait?.text);
  check('…in the MIND without the [TAB]', waitMind?.text === 'AUTOBURN NEEDS A THREAD IN 0:08 — × AN OP' && waitMind.keys.length === 0, waitMind?.text);
  check('…overdue: NOW', late?.text === AUTOBURN_TEXT.threadWaitLateShip, late?.text);
  const flyingTrim = flightObjective({ ...closed, firing: true, thrustOn: true, autoburn: { phase: 'burning', sinceSec: 1, armedInTac: 0, end: null, flying: 'trim' } });
  check('flying a trim: TRIMMING (soon, no keys)', flyingTrim?.text === AUTOBURN_TEXT.trimming && flyingTrim.urgency === 'soon' && flyingTrim.keys.length === 0,
    flyingTrim?.text);
  const inRingRound = flightObjective({ ...base, outcome: 'closed', inRing: true, firing: true, thrustOn: true,
    autoburn: { phase: 'burning', sinceSec: 1, armedInTac: 0, end: null, flying: 'round' } });
  check('rounding in the ring: ROUNDING, not the kid\'s RELEASE', inRingRound?.text === AUTOBURN_TEXT.rounding, inRingRound?.text);
  for (const doneLine of [AUTOBURN_TEXT.reserveCaptured, AUTOBURN_TEXT.downgradedCaptured]) {
    const done = flightObjective({ ...closed, autoburn: { phase: 'done', sinceSec: 1, armedInTac: 0, end: 'reserve', doneLine } });
    check(`a hand-back on a loop still to trim: \`${doneLine}\` (now)`, done?.id === 'AUTO-done' && done.text === doneLine && done.urgency === 'now', done?.text);
  }
}

// --- The tails -----------------------------------------------------------------------------------------------------------
{
  const v1 = flightObjective({ ...base, autoAvailable: true, autoOffer: 'capture' });
  const v2 = flightObjective({ ...base, autoAvailable: true, autoOffer: 'green' });
  const v2Turn = flightObjective({ ...base, sasMode: 'radial-in', autoAvailable: true, autoOffer: 'green' });
  check('the capture timeline: ` · or [B] AUTO` for v1, ` · or [B] GREEN` for v2, B lit', v1?.text.endsWith(' · or [B] AUTO') === true
    && v2?.text.endsWith(' · or [B] GREEN') === true && v2Turn?.text.endsWith(' · or [B] GREEN') === true && v2!.keys.includes('B'),
    `${v1?.text} | ${v2?.text} | ${v2Turn?.text}`);
  const trimBurn: NonNullable<FlightContext['burnPoint']> = { ...capture, reason: 'rp-high', preset: 'retrograde', event: 'apo', inTac: 200, approaching: true };
  const trim = flightObjective({ ...base, outcome: 'closed', rp: 7600, burnPoint: trimBurn, autoAvailable: true, autoOffer: 'green' });
  check('v2: the trim lines take it too (` · or [B] GREEN`)', trim?.id.startsWith('F11') === true && trim.text.endsWith(' · or [B] GREEN') && fits(trim.text), trim?.text);
  const hold = flightObjective({ ...base, outcome: 'closed', inRing: true, burnPoint: null, autoAvailable: true, autoOffer: 'round' });
  const holdNone = flightObjective({ ...base, outcome: 'closed', inRing: true, burnPoint: null });
  check('HOLD STEADY gains ` · or [B] ROUND` once v2 could round it (a tail: still F3b)', hold?.id === 'F3b' && hold.text === 'HOLD STEADY… · or [B] ROUND'
    && holdNone?.text === 'HOLD STEADY…', `${hold?.text} | ${holdNone?.text}`);
}

// --- LANDING: the L2 rows and L13's tail ------------------------------------------------------------------------------------
{
  const roundBurn: NonNullable<FlightContext['burnPoint']> = { ...capture, reason: 'round', preset: 'retrograde', event: 'peri', inTac: 50 };
  const landing = { ...base, landing: true, status: 'locked' as const, outcome: 'closed' as const, inRing: true, burnPoint: roundBurn };
  const armed = landingFlightRow({ ...landing, autoburn: armedFor('round', 50) });
  const flying = landingFlightRow({ ...landing, firing: true, thrustOn: true, autoburn: { phase: 'burning', sinceSec: 1, armedInTac: 0, end: null, flying: 'round' } });
  check('LANDING: armed in ROUND, L2\'s row is `rounds it at ▼`', armed?.text === 'AUTOBURN ARMED — rounds it at ▼ in 0:50 · [B] to cancel · [F] SKIP', armed?.text);
  check('…rounding: ROUNDING', flying?.text === AUTOBURN_TEXT.rounding, flying?.text);
  const lctx = (over: Partial<LandingContext> = {}): LandingContext => ({
    inMind: false, heldTool: null, finalShip: false, rootToDelete: false, everyPodDown: false, aboard: 3, falling: 0, block: false,
    thrust: false, open: null, nextWithRoom: 'LZ-B', roomInBand: true, canLaunch: true, bayReady: true, bayReadyInTac: 0, stuckPod: null,
    anyCanEver: true, next: { lz: 'LZ-B', inTac: 128, launchInTac: 130, inBand: true, full: false }, noBandWindow: false, skipAvailable: true,
    noDrop: false, firing: false, flight: null, flightBurnInTac: null, uncertain: null, tooWide: null, decay: null, bayOffline: false, lavaInReach: null,
    impact: false, tankShort: false, ghostSwap: null, ...over,
  });
  const plain = landingObjective(lctx());
  const offered = landingObjective(lctx({ autoTail: { text: AUTOBURN_TEXT.offerMode('round'), key: 'B' } }));
  const waiting = landingObjective(lctx({ autoTail: { text: AUTOBURN_TEXT.armedTail, key: null } }));
  check('L13 gains ` · or [B] ROUND` (B lit), and stays L13', offered.row === 'L13' && offered.text === `${plain.text} · or [B] ROUND`
    && offered.keys.includes('B'), offered.text);
  check('…` · AUTO ARMED` while it waits', waiting.row === 'L13' && waiting.text === `${plain.text}${AUTOBURN_TEXT.armedTail}`, waiting.text);
  const launch = landingObjective(lctx({ open: { lz: 'LZ-A', sure: true, sureInTac: null, full: false, down: 1, count: 3 }, autoTail: { text: AUTOBURN_TEXT.offerMode('round'), key: 'B' } }));
  check('…a launch still outranks it (no tail on L4)', launch.row === 'L4' && !launch.text.includes('ROUND'), launch.text);
}

// --- Every new line fits, worst case -------------------------------------------------------------------------------------
{
  const lines = [
    AUTOBURN_TEXT.armedTrim('▲', '13:30') + ' · [F] SKIP', AUTOBURN_TEXT.armedRound('▼', '13:30') + ' · [F] SKIP', AUTOBURN_TEXT.threadWaitShip('13:30'),
    AUTOBURN_TEXT.green, AUTOBURN_TEXT.round, AUTOBURN_TEXT.reserveCaptured, AUTOBURN_TEXT.downgradedCaptured, AUTOBURN_TEXT.roundCostsWindow('LZ-WWW'),
    `WAIT — LZ-WWW in 99:59 ▸▸ · [F] to SKIP · OUT OF BAND${AUTOBURN_TEXT.offerMode('round')}`,
  ];
  const tooLong = lines.filter((text) => !fits(text));
  // The last is the longest L13 with the tail (withAutoTail drops a tail that would not fit; this one does).
  check('every AUTOBURN line fits ≤ 70 (worst case LOCK 810\'s 13:30), the longest L13 with its tail too', tooLong.length === 0, tooLong.join(' | '));
}

finish();
