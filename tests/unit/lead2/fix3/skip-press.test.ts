// LEAD-2 review round 3: a press during a SKIP keeps its meaning under a line that asks for it (any ship: AP_SHIP=1, 2;
// tests/unit/lead2/per-ship.test.ts runs it on HALCYON and KESTREL). Round 2's ruling dropped every press that stopped a
// SKIP, but a SKIP also runs under lines that ask for SPACE: the opening's ▼ correction (TOO WIDE on HALCYON and
// KESTREL; ▼ TOO LOW on ship 1 once the lift has cleared the planet) and the SKIP to FLEW AWAY under
// `MISSED ▼ — hold [SPACE] NOW`. There the kid who held SPACE as the strip said burned nothing, and the ship flew away
// (or, on KESTREL, rack C was hit) under a line still asking for SPACE (the verifier's literal-hold, missed-literal-hold
// and kestrel-skip-dodge probes in tests/unit/lead2/verify2/probes/).
//  1. the opening: F, then SPACE held 0.5, 2 and 4 s into the SKIP under the correction's line: the SKIP stops and the
//     burn starts on the same tick; obeyed from there, the flight locks or is accepted;
//  2. the SKIP to FLEW AWAY after an ignored MISSED ▼: SPACE held during it brakes at once (TACTICAL), and obeyed
//     from there the ship does not fly away;
//  3. the WAIT-line case round 2 fixed stays fixed: far out on the long WAIT a held SPACE stops the SKIP and burns
//     nothing — checked in tests/unit/lead2/coast-skip.test.ts (check 4, three points into the SKIP; far-lift check 1
//     flies the full grid), which flies the long WAIT anyway: it is half an hour of hands-off flight to set up, too
//     long to fly in a second process for two checks;
//  4. [B] during a SKIP when it can't engage AUTOBURN (this unit's refusal, not SKIPPING) buzzes that refusal and the
//     SKIP runs on (the verifier's minor: it used to cut the SKIP short in silence) — in coast-skip too, beside 3;
//  5. a hold that only stopped a SKIP (SPACE pressed under WAIT as the SKIP to the capture lands) burns once the line
//     asks for SPACE: held through GET READY, it burns at `HOLD [SPACE] NOW` (before: the strip said HOLD [SPACE] NOW,
//     then MISSED ▼, over a held SPACE that burned nothing, and ship 1 flew away with 73% FUEL;
//     tests/unit/lead2/fix3/logs/early-hold-before.log).
import { createHarness, check, finish, HARNESS_SHIP } from '../../wp1/harness';
import { getPrediction } from '@systems/predict';
import { asksToHoldSpace, isReleaseRow } from '@systems/guidance';
import { flyToCapture, idle, obey, text, stepUntil } from '../../wp1-rules/flows';

const harness = createHarness(1);
const state = () => harness.store.getState();
const ship = `ship ${HARNESS_SHIP + 1}`;
const { planet, ring } = state().level;
const asksSpace = (): boolean => { const objective = harness.objective(); return objective !== null && asksToHoldSpace(objective); };
const pressNamedPreset = (): void => {
  const key = text(harness).match(/press \[([WASD])\]/)?.[1];
  if (key) harness.press(`Key${key}`);
};
// Holds SPACE (already down) while the line asks for it, then lets go and obeys the strip to the end of the flight.
function holdThenObey(maxHoldWall: number): void {
  const end = harness.wall() + maxHoldWall;
  while (harness.wall() < end && harness.status() === 'approaching') {
    const objective = harness.objective();
    if (objective === null || isReleaseRow(objective.id) || !asksToHoldSpace(objective)) break;
    harness.step();
  }
  harness.keyUp('Space');
  obey(harness, 900);
}

// The opening, up to a line that asks for SPACE with a SKIP allowed. Ship 1 opens on an impact course (no SKIP there):
// its lift is held until ▼ is out of the planet and halfway up to the ring, so the line is ▼ TOO LOW.
// WP10: VESPER opens in the ring on the capture's WAIT (no correction, no SPACE asked), so its correction is made:
// ▼ lowered with IN to halfway between the surface and the ring, as ship 1's lift leaves it (▼ TOO LOW), at 10% POWER
// (one full-POWER tick of RADIAL at 25,000 km moves ▼ about 190 km on VESPER's ×30).
function openingUnderSpaceLine(): void {
  harness.reset(1);
  harness.step();
  const halfway = planet.R + (ring.min - planet.R) / 2;
  if (/DON'T HIT THE PLANET/.test(text(harness))) {
    harness.keyDown('Space');
    stepUntil(harness, () => harness.rp() > halfway, 30);
    harness.keyUp('Space');
  } else if (/^WAIT/.test(text(harness))) {
    harness.press('KeyA');
    harness.store.mutate((d) => { d.burn.thrustPct = 10; });
    harness.keyDown('Space');
    stepUntil(harness, () => harness.rp() < halfway, 60);
    harness.keyUp('Space');
    harness.store.mutate((d) => { d.burn.thrustPct = 100; });
    // The fix's preset already turned to, as HALCYON's and KESTREL's openings start on theirs: the press under the
    // line then burns on its tick (a 180° turn from IN would hold the thrust for the turn).
    harness.press('KeyD');
    stepUntil(harness, () => !state().burn.presetAligning, 10);
  }
  idle(harness, 0.5);
}

// --- 1. The opening's correction during a SKIP ----------------------------------------------------------------
{
  const rows: string[] = [];
  let bad = '';
  for (const intoSkipSec of [0.5, 2, 4]) {
    openingUnderSpaceLine();
    const lineBefore = text(harness);
    harness.press('KeyF');
    idle(harness, intoSkipSec);
    const skipping = state().clock.skipWarp !== null;
    pressNamedPreset();
    const lineAtPress = text(harness);
    const asked = asksSpace();
    const fuelBefore = state().burn.fuelPct;
    harness.keyDown('Space');
    const firingAtPress = state().burn.firing;
    const stoppedAtPress = state().clock.skipWarp === null;
    harness.step();
    const burnedOneTick = state().burn.fuelPct < fuelBefore && harness.pace() === 'tactical';
    holdThenObey(60);
    const row = `${intoSkipSec} s into the SKIP ("${lineBefore}" before F): skipping ${skipping}, "${lineAtPress}", `
      + `asks SPACE ${asked}; at the press firing ${firingAtPress}, SKIP stopped ${stoppedAtPress}; one tick later burned `
      + `${burnedOneTick}; obeyed: ${harness.status()} with ${state().burn.fuelPct.toFixed(1)}% FUEL`;
    rows.push(row);
    const ok = skipping && asked && firingAtPress && stoppedAtPress && burnedOneTick && ['locked', 'accepted'].includes(harness.status());
    if (!ok) bad ||= row;
  }
  check(`${ship}: SPACE held during the opening's SKIP under the correction's line stops the SKIP and burns on the same tick; `
    + 'obeyed, the flight locks or is accepted', bad === '', bad || rows.join(' | '));
}

// --- 2. The SKIP to FLEW AWAY after an ignored MISSED ▼ ---------------------------------------------------------
{
  flyToCapture(harness);   // "HOLD [SPACE] NOW" for the capture, ignored
  stepUntil(harness, () => getPrediction().outbound, 60);
  stepUntil(harness, () => harness.pace() === 'cruise', 60);
  const lineIgnored = text(harness);
  harness.press('KeyF');
  stepUntil(harness, () => state().clock.skipWarp !== null, 2);
  harness.step();
  const skipping = state().clock.skipWarp !== null;
  const lineAtPress = text(harness);
  const asked = asksSpace();
  const fuelBefore = state().burn.fuelPct;
  harness.keyDown('Space');
  const firingAtPress = state().burn.firing && state().clock.skipWarp === null;
  harness.step();
  const tactical = harness.pace() === 'tactical' && state().burn.fuelPct < fuelBefore;
  holdThenObey(120);
  check(`${ship}: SPACE held during the SKIP to FLEW AWAY under MISSED ▼ brakes at once; obeyed, the ship does not fly away`,
    /^MISSED ▼ — hold \[SPACE\] NOW · hold \[F\]$/.test(lineIgnored) && skipping && asked && firingAtPress && tactical
    && ['locked', 'accepted'].includes(harness.status()),
    `ignored: "${lineIgnored}"; during the SKIP ${skipping}: "${lineAtPress}", asks SPACE ${asked}; firing at the press `
    + `${firingAtPress}, TACTICAL and burning a tick later ${tactical}; obeyed: ${harness.status()} with ${state().burn.fuelPct.toFixed(1)}% FUEL`);
}

// --- 3 and 4 (the long WAIT's SKIP: a held SPACE only stops it; [B] refused for its own reason) are coast-skip's ---

// --- 5. A hold that only stopped a SKIP burns once the line asks for SPACE ---------------------------------------
{
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(harness, () => /^RELEASE/.test(text(harness)), 30);
  harness.keyUp('Space');
  stepUntil(harness, () => /TURN AROUND/.test(text(harness)), 5);
  harness.press('KeyS');
  stepUntil(harness, () => /^WAIT/.test(text(harness)), 10);
  harness.press('KeyF');
  // The SKIP's last game minute (tactical), under the WAIT line: the kid presses SPACE early and keeps holding.
  const tacticalWarp = state().level.tacticalWarp;
  stepUntil(harness, () => state().clock.skipEndTSec !== null && state().clock.skipEndTSec! - state().clock.tSec < 60 * tacticalWarp, 60);
  const skipping = state().clock.skipWarp !== null;
  const lineAtPress = text(harness);
  const fuelBefore = state().burn.fuelPct;
  harness.keyDown('Space');
  let quietUntilAsked = true;
  let unburnedAskSec = 0;
  let sawReady = false;
  const end = harness.wall() + 200;
  while (harness.wall() < end && harness.status() === 'approaching') {
    harness.step();
    const objective = harness.objective();
    const asked = objective !== null && asksToHoldSpace(objective);
    if (state().burn.firing && objective !== null && isReleaseRow(objective.id)) break;
    if (/^GET READY/.test(text(harness))) sawReady = true;
    if (!asked && state().burn.firing) quietUntilAsked = false;
    if (asked && !state().burn.firing) unburnedAskSec += 0.05;
  }
  harness.keyUp('Space');
  const burned = fuelBefore - state().burn.fuelPct;
  obey(harness, 900);
  check(`${ship}: SPACE pressed as the SKIP lands under WAIT and held: nothing burns until the line asks for SPACE, then it burns at once; `
    + 'obeyed, the flight locks or is accepted',
    skipping && /^WAIT/.test(lineAtPress) && sawReady && quietUntilAsked && unburnedAskSec === 0 && burned > 0
    && ['locked', 'accepted'].includes(harness.status()),
    `skipping ${skipping} under "${lineAtPress}"; GET READY seen ${sawReady}, quiet until asked ${quietUntilAsked}, `
    + `asked without a burn ${unburnedAskSec.toFixed(2)} s, burned ${burned.toFixed(1)}% to RELEASE; obeyed: ${harness.status()}`);
}

finish();
