// WP9: every line this package adds fits the strip (≤ MAX_LINE_CHARS) with worst-case values, and says what the
// glossary (§3.5) says: the debris's TERMINAL lines, the scripted arrival damage, the boot's skill lines, the
// strip's AUTOBURN rows and alarms, the seed and debris rules, TOO WIDE's dodge, the capture lines' AUTO tail, the
// SKIP refusals near a zone, INSPECT's seed text. Also: the ECC line for the arrival damage falls back to the
// files alone when the consequence does not fit (VESPER's Thrust Ctrl, WP10).
import { check, finish } from '../wp1/harness';
import { debrisHitLine, beltHitLine, zoneLostLine } from '@data/zone-text';
import { scriptedDamageLine, GUIDE_RULES, SEED_RULES, DEBRIS_RULES, AUTOBURN_RULES, WORST_CASE_VARS } from '@data/script';
import { AUTOBURN_TEXT, AUTOBURN_DROP_TEXT, AUTOBURN_DROP_TAB, AUTOBURN_REFUSAL, AUTO_REFUSAL_LINES } from '@data/skill-text';
import { skipRefusalZoneAhead, skipRefusalInZone } from '@systems/pace';
import { flightObjective, type FlightContext } from '@systems/guidance';
import { HOLLOW_INSPECT, HOLLOW_DESC, HOLLOW_STORY, HOLLOW_ECHO, HOLLOW_ALERT_TEXT, hollowUnitName } from '@data/hollow-text';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';
import { podCode } from '@data/landing-text';
import { MAX_LINE_CHARS, SEG_NAME_MAX_CHARS } from '@data/tuning';

const fits = (line: string): boolean => line.length <= MAX_LINE_CHARS;
const long = 'W'.repeat(SEG_NAME_MAX_CHARS);

// --- The zones' TERMINAL lines -------------------------------------------------------------------------------
{
  // Slice 1a: files are named by fileLabel, a pod's driver `POD 07`.
  const sixteen = Array.from({ length: 16 }, (_unused, i) => ({ label: podCode(i + 1), lost: 25 }));
  const mixed = [{ label: long, lost: 25 }, { label: 'POD 07', lost: 12.5 }, { label: long, lost: 25 }];
  check('the debris line names the rack and the pods, `+n` for the rest, ≤ 70', fits(debrisHitLine('C', sixteen))
    && /^> DEBRIS HIT RACK C: POD 01 .* \+\d+ −25%$/.test(debrisHitLine('C', sixteen)), debrisHitLine('C', sixteen));
  check('…worst-case names and a straddling file\'s own loss, ≤ 70', fits(debrisHitLine('B', mixed)), debrisHitLine('B', mixed));
  check('…KESTREL\'s rack C: as many pods as fit, then +n', debrisHitLine('C', [7, 8, 9, 10, 11, 12].map((pod) => ({ label: podCode(pod), lost: 25 })))
    === '> DEBRIS HIT RACK C: POD 07 POD 08 POD 09 POD 10 POD 11 POD 12 −25%', debrisHitLine('C', [7, 8, 9, 10, 11, 12].map((pod) => ({ label: podCode(pod), lost: 25 }))));
  check('the belt\'s line and a driver the zone took to 0, ≤ 70', fits(beltHitLine({ label: long, lost: 8 })) && fits(zoneLostLine('POD 16'))
    && zoneLostLine('POD 03') === '> POD 03 ... DRIVER LOST · CAN\'T LAUNCH', zoneLostLine('POD 03'));
}

// --- The arrival damage's line -----------------------------------------------------------------------------------
{
  const sensor = scriptedDamageLine([{ segId: 'x', fileName: 'Sensor Interp', role: 'sensor', from: 60, to: 45 }]);
  check('KESTREL\'s own arrival damage: `> ECC: SENSOR INTERP 45% — PATH UNCERTAIN` (§5.1 4:40)', sensor === '> ECC: SENSOR INTERP 45% — PATH UNCERTAIN', sensor);
  const thrust = scriptedDamageLine([{ segId: 'y', fileName: 'Thrust Controller', role: 'thrust-ctrl', from: 100, to: 31 }]);
  check('…a consequence that does not fit leaves the file alone (VESPER\'s, WP10), ≤ 70', fits(thrust) && thrust.startsWith('> ECC: THRUST CONTROLLER 31%'), thrust);
}

// --- AUTOBURN ---------------------------------------------------------------------------------------------------
{
  const lines = [
    AUTOBURN_TEXT.trained(9, 99), AUTOBURN_TEXT.retrained(12, 99), AUTOBURN_TEXT.armed('99:59'), AUTOBURN_TEXT.burning, AUTOBURN_TEXT.burningMind,
    // WP9 fix round 1: the hand-back is CAPTURED (a trim left for later) or IN THE RING; refused [B]s have strip lines.
    AUTOBURN_TEXT.braked, AUTOBURN_TEXT.brakedTab, AUTOBURN_TEXT.inRing, AUTOBURN_TEXT.ready, AUTOBURN_TEXT.off,
    ...Object.values(AUTOBURN_DROP_TEXT).map((text) => `${text}${AUTOBURN_DROP_TAB}`), ...Object.values(AUTOBURN_REFUSAL),
    ...Object.values(AUTO_REFUSAL_LINES).map((line) => line!.text),
  ];
  const bad = lines.filter((line) => !fits(line));
  check('every AUTOBURN line fits (boot, strip, alarms with [TAB], radio, refusals)', bad.length === 0, bad.join(' | '));
  check('the drop line says §6.10\'s words', AUTOBURN_DROP_TEXT.lost === 'AUTOBURN.skl LOST — MANUAL');
  check('the file name fits a segment name', UPGRADE_FILE_TEXT.autoburn.name.length <= SEG_NAME_MAX_CHARS && UPGRADE_FILE_TEXT.autoburn.name === 'AUTOBURN.skl');
}

// --- The strip's WP9 rules, rendered with worst-case vars ---------------------------------------------------------
{
  const rules = [...SEED_RULES, ...DEBRIS_RULES, ...AUTOBURN_RULES];
  const rendered = rules.map((rule) => rule.text({ vars: WORST_CASE_VARS }));
  const bad = rendered.filter((line) => !fits(line));
  check('every WP9 strip rule fits with worst-case vars', bad.length === 0 && rendered.length === 8, bad.join(' | ') || rendered.join(' | '));
  check('…and all of them are in GUIDE_RULES', rules.every((rule) => GUIDE_RULES.includes(rule)));
  check('the debris rule names the rack and the countdown', DEBRIS_RULES[0]!.text({ vars: { ...WORST_CASE_VARS, debrisRack: 'C', debrisInTac: 70 } })
    === 'DEBRIS HITS RACK C IN 1:10 — [TAB], MOVE drivers out of it', DEBRIS_RULES[0]!.text({ vars: { ...WORST_CASE_VARS, debrisRack: 'C', debrisInTac: 70 } }));
}

// --- TOO WIDE's dodge and the capture's AUTO tail, every variant ---------------------------------------------------
{
  const ring = { min: 5000, max: 7000 };
  const base: FlightContext = {
    status: 'approaching', landing: false, offer: null, goLow: null, outcome: 'open', rp: 9000, inRing: false, outbound: false, ring,
    // WP12 p3 (strict test tsc): the fields added after this test (F4's lift preset, WP10's spare controller), none here.
    liftPreset: null, spareController: null,
    // WP12 p3: ▼'s rate under thrust (F6's early RELEASE); 0 keeps this test's rows as written.
    rpRateTac: 0,
    sweetLo: 5500, sweetHi: 6500, sasMode: 'retrograde', firing: false, firingFor: null, thrustOn: false,
    outOfFuel: false, fuelShort: false, acceptOnly: false, strandedAnyway: false, cannotClose: false, presetsAvailable: true,
    plotFault: null, engineFault: null, inMind: false, skipAvailable: true,
    burnPoint: {
      reason: 'capture', preset: 'retrograde', event: 'peri', eventInSec: 9000, inSec: 8000, dvKmS: 1.2, estBurnSec: 240,
      // LEAD-2: BurnPoint no longer has lastFuel / emptiesTank (the last FUEL is gone).
      approaching: true, firstOfTwo: false, inTac: 320, burnTac: 9.6,
    },
    // WP9 fix round 1: the dodge carries its deadline (null once it has run out).
    periTac: 330, showAccept: false, debris: { rack: 'C', dodgeInTac: 5999 },
    autoburn: { phase: 'idle', sinceSec: 0, armedInTac: 0, end: null }, autoAvailable: false,
  };
  const wide = [
    flightObjective({ ...base, sasMode: 'radial-in' }), flightObjective(base), flightObjective({ ...base, presetsAvailable: false }),
  ];
  check('TOO WIDE with a dodgeable cloud: its countdown `· 99:59 to dodge DEBRIS C` on every wording (short: `· 99:59 to dodge`), urgent, ≤ 70',
    wide.every((line) => line !== null && fits(line.text) && line.urgency === 'now' && line.id.startsWith('F8-debris-')
      && (line.text.endsWith('· 99:59 to dodge DEBRIS C') || line.text.endsWith('· 99:59 to dodge'))), wide.map((line) => line?.text).join(' | '));
  const late = [
    flightObjective({ ...base, sasMode: 'radial-in', debris: { rack: 'C', dodgeInTac: null } }), flightObjective({ ...base, debris: { rack: 'C', dodgeInTac: null } }),
    flightObjective({ ...base, presetsAvailable: false, debris: { rack: 'C', dodgeInTac: null } }),
  ];
  check('…once it has run out: `· too late to dodge DEBRIS C` (short: `· DEBRIS C will hit`), ≤ 70', late.every((line) => line !== null && fits(line.text)
    && line.id.startsWith('F8-debris-late') && (line.text.endsWith('· too late to dodge DEBRIS C') || line.text.endsWith('· DEBRIS C will hit'))),
  late.map((line) => line?.text).join(' | '));
  check('…without the cloud, plain TOO WIDE', flightObjective({ ...base, debris: null })?.text === 'TOO WIDE — press [A] (IN), hold [SPACE]');
  const capture = { ...base, rp: 6000, debris: null, autoAvailable: true };
  const lines = [
    flightObjective({ ...capture, sasMode: 'radial-in' }), flightObjective(capture),
    flightObjective({ ...capture, burnPoint: { ...capture.burnPoint!, inTac: 5 } }), flightObjective({ ...capture, burnPoint: { ...capture.burnPoint!, inTac: -1 } }),
    flightObjective({ ...capture, burnPoint: { ...capture.burnPoint!, inTac: 5999 }, presetsAvailable: false, sasMode: 'radial-in' }),
  ];
  check('the capture lines offer AUTO (` · or [B] AUTO`, B lit) when it can take over, ≤ 70', lines.every((line) => line !== null && fits(line.text))
    && lines.slice(0, 4).every((line) => line!.text.endsWith(' · or [B] AUTO') && line!.keys.includes('B')), lines.map((line) => line?.text).join(' | '));
  const armed = flightObjective({ ...capture, autoburn: { phase: 'armed', sinceSec: 1, armedInTac: 5999, end: null } });
  const burning = flightObjective({ ...capture, autoburn: { phase: 'burning', sinceSec: 1, armedInTac: 0, end: null }, firing: true, thrustOn: true });
  const done = flightObjective({ ...capture, outcome: 'closed', autoburn: { phase: 'done', sinceSec: 1, armedInTac: 0, end: 'braked' }, inMind: true });
  check('AUTOBURN\'s rows: ARMED (wait, with SKIP), BRAKING (soon), CAPTURED (now, [TAB] in blue), all ≤ 70',
    armed?.id === 'AUTO-armed' && armed.urgency === 'wait' && fits(armed.text) && armed.text.includes('[F] SKIP')
    && burning?.id === 'AUTO-burning' && burning.urgency === 'soon' && done?.id === 'AUTO-done' && done.urgency === 'now' && done.text === AUTOBURN_TEXT.brakedTab,
  `${armed?.text} | ${burning?.text} | ${done?.text}`);
  // Final fix pass (final review): the words keep `[B] to cancel` and `[SPACE] takes over`, but neither key glows as the
  // next step while AUTOBURN flies; only F, where SKIP is offered.
  const armedNoSkip = flightObjective({ ...capture, skipAvailable: false, autoburn: { phase: 'armed', sinceSec: 1, armedInTac: 5999, end: null } });
  check('…ARMED lights only F (SKIP), never B; BRAKING lights nothing, never SPACE',
    armed?.keys.join() === 'F' && armedNoSkip?.keys.length === 0 && burning?.keys.length === 0
    && armed.text.includes('[B] to cancel') && burning.text.includes('[SPACE] takes over'),
    `${armed?.keys.join()} / ${armedNoSkip?.keys.join()} / ${burning?.keys.join()}`);
}

// --- HOLLOW's WP9 words, SKIP refusals ---------------------------------------------------------------------------
{
  const unit = hollowUnitName([998, 999]);
  const lines = [HOLLOW_STORY.sorry, HOLLOW_ECHO.seed('0x17F', unit), HOLLOW_ALERT_TEXT.seedIncoming, HOLLOW_ALERT_TEXT.seedThreat,
    HOLLOW_INSPECT.seed, skipRefusalZoneAhead('debris'), skipRefusalInZone('debris'), skipRefusalZoneAhead('belt'), skipRefusalInZone('belt')];
  check('HOLLOW\'s seed lines, its alerts, INSPECT\'s state, the SKIP refusals: ≤ 70', lines.every(fits), lines.join(' | '));
  check('`> sorry. i\'m so hungry.` (§9 WP9 item 4)', HOLLOW_STORY.sorry === "> sorry. i'm so hungry.");
  check('INSPECT\'s seed text never says HOLLOW (a kid never reads that name)', !/HOLLOW/i.test(HOLLOW_DESC.seed));
}

finish();
