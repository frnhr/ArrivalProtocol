// WP1 stage B: the HUD model (systems/flight-hud) on the real systems. Every word, tone and
// marker the header, NAV PLOT, Engine and Telemetry show, checked at each stage of a flight:
// the opening, the OUT burn, the coast, SKIP, the capture, the lock hold, the lock, ACCEPT
// and pause. The painters only copy these into the DOM (browser checks: ui-acceptance.mjs).
import { createHarness, check, finish, type Harness } from './harness';
import { getPrediction, samplePath } from '@systems/predict';
import { setPaused } from '@systems/clock';
import { acceptOrbit } from '@systems/flight-controls';
import {
  countdownChip, paceLabel, skipButton, plotChip, plotReadouts, plotMarkers, plotViewRadius,
  burnButton, presetHint, fuelModel, acceptModel, acceptLabel, telemetryModel, PRESET_TIP,
  formatCountdown, formatWarp, splitKeyCaps, FLIGHT_OVER_LINE,
} from '@systems/flight-hud';
import { PLOT_FLYBY_TAG_FRAC } from '@data/tuning';

const harness = createHarness(1);
const store = harness.store;
const state = () => store.getState();

function stepWhile(cond: () => boolean, maxWall = 400): void {
  const end = harness.wall() + maxWall;
  while (cond() && harness.status() === 'approaching' && harness.wall() < end) harness.step();
}

// --- pure formatting ---------------------------------------------------------------------------
{
  check('formatCountdown rounds up, MM:SS', formatCountdown(163.25) === '02:44' && formatCountdown(0) === '00:00'
    && formatCountdown(59.01) === '01:00' && formatCountdown(-3) === '00:00' && formatCountdown(3600) === '60:00');
  check('formatWarp', formatWarp(20) === '×20' && formatWarp(871.4) === '×871' && formatWarp(39.04) === '×39'
    && formatWarp(2.5) === '×2.5' && formatWarp(1234) === '×1.2K' && formatWarp(1e7) === '×10M',
  [20, 871.4, 39.04, 2.5, 1234, 1e7].map(formatWarp).join(' '));
  const caps = splitKeyCaps('turn to RETRO with [Q]/[E]');
  check('splitKeyCaps: text and caps in order', JSON.stringify(caps) === JSON.stringify([
    { text: 'turn to RETRO with ', key: false }, { text: 'Q', key: true }, { text: '/', key: false }, { text: 'E', key: true },
  ]), JSON.stringify(caps));
  check('splitKeyCaps: plain text and a lone cap',
    JSON.stringify(splitKeyCaps('HOLD STEADY…')) === JSON.stringify([{ text: 'HOLD STEADY…', key: false }])
    && JSON.stringify(splitKeyCaps('[SPACE]')) === JSON.stringify([{ text: 'SPACE', key: true }]));
}

// --- the opening -----------------------------------------------------------------------------
{
  harness.reset();
  harness.step();
  const pred = getPrediction();
  const { planet } = state().level;
  const chip = countdownChip(state(), pred);
  check('open: header chip ✕ IMPACT 02:4x, red, real time', chip?.kind === 'impact' && chip.label === '✕ IMPACT'
    && /^02:4\d$/.test(chip.time) && chip.urgent && !chip.fastForward, JSON.stringify(chip));
  check('open: pace TACTICAL ×20', paceLabel(state()) === 'TACTICAL ×20', paceLabel(state()));
  const skip = skipButton(state(), pred);
  check('open: SKIP struck out with IMPACT COURSE', !skip.active && skip.blockedReason === 'IMPACT COURSE', JSON.stringify(skip));
  const plot = plotChip(state(), pred);
  check('open: plot chip IMPACT (danger)', plot.text === 'IMPACT' && plot.tone === 'danger');
  const markers = plotMarkers(state(), pred);
  const impactR = markers.impact ? Math.hypot(markers.impact.pos.x, markers.impact.pos.y) : NaN;
  check('open: ✕ IMPACT on the surface with its countdown', markers.impact !== null
    && /^IMPACT 02:4\d$/.test(markers.impact.lines[0] ?? '') && Math.abs(impactR - planet.R) < 1,
  `${markers.impact?.lines.join(' ')} at r ${impactR.toFixed(1)}`);
  const periR = markers.peri ? Math.hypot(markers.peri.pos.x, markers.peri.pos.y) : NaN;
  check('open: ghost ▼ inside the planet, UNDERGROUND', markers.peri?.tone === 'ghost' && periR < planet.R
    && markers.peri.lines.join(' ') === '▼ LOWEST: UNDERGROUND', `${markers.peri?.lines.join(' ')} at r ${periR.toFixed(0)}`);
  check('open: no ▲, START BURN or FLYBY tag', markers.apo === null && markers.startBurn === null && markers.flyby === null);
  const readouts = plotReadouts(state(), pred);
  check('open: readouts UNDERGROUND / — / 0% / COASTING', readouts.lowest.text === 'UNDERGROUND' && readouts.lowest.tone === 'danger'
    && readouts.highest.text === '—' && readouts.range.text === '0%' && readouts.status.text === 'COASTING', JSON.stringify(readouts));
  const button = burnButton(state());
  check('open: BURN button ready', button.text === 'HOLD [SPACE] · BURN' && button.look === 'ready' && !button.disabled);
  check('open: the OUT tip under the presets', presetHint(state()) === PRESET_TIP['radial-out']);
  const fuel = fuelModel(state(), pred);
  check('open: FUEL 100%, no NEEDED tick on a crash course', fuel.text === '100%' && fuel.neededPct === null && !fuel.short && fuel.needText === '');
  check('open: TIME TO ▼ is — (the planet comes first)', telemetryModel(state(), pred).timeToPeri === '—');
  check('open: no ACCEPT', !acceptModel(state(), pred).offered);
}

// --- the OUT burn ------------------------------------------------------------------------------
{
  harness.keyDown('Space');
  harness.step();
  check('burn: button BURNING… and status BURNING', burnButton(state()).look === 'burning'
    && plotReadouts(state(), getPrediction()).status.text === 'BURNING');
  stepWhile(() => harness.rp() <= state().level.planet.R);
  for (let i = 0; i < 4; i++) harness.step(); // let the 10 Hz prediction catch up
  let pred = getPrediction();
  check('burn: off the planet the chip says FLYBY', plotChip(state(), pred).text === 'FLYBY' && pred.outcome === 'open');
  const markers = plotMarkers(state(), pred);
  const tagR = markers.flyby ? Math.hypot(markers.flyby.pos.x, markers.flyby.pos.y) : NaN;
  check('burn: FLYBY tag on the line, inside the frame', markers.flyby !== null
    && tagR <= PLOT_FLYBY_TAG_FRAC * plotViewRadius(state()) + 1e-6, `r ${tagR.toFixed(0)} of view ${plotViewRadius(state()).toFixed(0)}`);
  // WP4 part 2: the markers follow the ship's instruments, and ship 1's Sensor Interp (78%) puts ≈
  // on the altitude.
  check('burn: ▼ is real now (countdown + altitude)', markers.peri !== null && markers.peri.tone !== 'ghost'
    && /^▼ \d\d:\d\d$/.test(markers.peri.lines[0] ?? '') && /^LOWEST ≈?[\d,]+ km$/.test(markers.peri.lines[1] ?? ''),
  markers.peri?.lines.join(' / '));
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  for (let i = 0; i < 4; i++) harness.step();
  pred = getPrediction();
  const periInRing = plotMarkers(state(), pred).peri;
  check('burn: ▼ in the ring turns green', periInRing?.tone === 'good' && plotReadouts(state(), pred).lowest.tone === 'good');
}

// --- the coast, START BURN and SKIP ---------------------------------------------------------------
{
  harness.press('KeyS');
  stepWhile(() => state().burn.presetAligning || state().clock.pace !== 'cruise', 20);
  let pred = getPrediction();
  const chip = countdownChip(state(), pred);
  check('coast: CRUISE ×60, chip BRAKE IN with ▸▸', paceLabel(state()) === 'CRUISE ×60'
    && chip?.kind === 'burn' && chip.label === 'BRAKE IN' && chip.fastForward && !chip.urgent, `${paceLabel(state())} ${JSON.stringify(chip)}`);
  check('coast: SKIP available', skipButton(state(), pred).blockedReason === null);
  check('coast: TIME TO ▼ counts', /^\d\d:\d\d$/.test(telemetryModel(state(), pred).timeToPeri));
  const fuel = fuelModel(state(), pred);
  check('coast: NEEDED tick shows the capture cost, enough FUEL', fuel.neededPct !== null && fuel.neededPct > 20 && !fuel.short
    && /^NEXT BURN NEEDS \d+%$/.test(fuel.needText), `${fuel.needText} of ${fuel.text}`);

  // The START BURN tick is where the ship actually is when the burn countdown reaches zero.
  const marker = plotMarkers(state(), pred).startBurn;
  check('coast: START BURN tick on the line', marker !== null && Math.abs(Math.hypot(marker.dir.x, marker.dir.y) - 1) < 1e-9);
  const sampleAt0 = samplePath(pred, 0);
  const start = pred.points[0]!;
  check('samplePath(0) is the ship as of the prediction', sampleAt0 !== null && Math.hypot(sampleAt0.pos.x - start.x, sampleAt0.pos.y - start.y) < 1e-6);
  check('samplePath past the line is null', samplePath(pred, (pred.times[pred.times.length - 1] ?? 0) + 1) === null && samplePath(pred, -1) === null);

  harness.press('KeyF');
  harness.step();
  pred = getPrediction();
  check('skip: SKIP active, pace label SKIP ▸▸', skipButton(state(), pred).active && paceLabel(state()).startsWith('SKIP ▸▸ ×'), paceLabel(state()));
  stepWhile(() => (harness.burnPointTac() ?? 0) > 0);
  const miss = marker ? Math.hypot(state().orbit.x - marker.pos.x, state().orbit.y - marker.pos.y) : NaN;
  const radius = Math.hypot(state().orbit.x, state().orbit.y);
  check('coast: the ship reaches the START BURN tick when the countdown hits zero', miss < 0.01 * radius,
    `${miss.toFixed(1)} km off at r ${radius.toFixed(0)}`);
  const chipNow = countdownChip(state(), getPrediction());
  check('burn point reached: the header falls back to ▼, red', chipNow?.kind === 'peri' && chipNow.label === '▼' && chipNow.urgent,
    JSON.stringify(chipNow));
}

// --- the capture, the lock hold and the lock ------------------------------------------------------
{
  harness.keyDown('Space');
  stepWhile(() => getPrediction().outcome !== 'closed');
  for (let i = 0; i < 2; i++) harness.step();
  let pred = getPrediction();
  const chip = plotChip(state(), pred);
  // Below the strand floor the chip names the loop's problem instead of "0% GREEN" (review r1).
  const belowFloor = pred.greenFraction < 0.1;
  check('capture: CAPTURED · n% GREEN, or the problem below the strand floor',
    belowFloor ? chip.text === 'CAPTURED · LOOP TOO BIG' : /^CAPTURED · \d+% GREEN$/.test(chip.text), chip.text);
  check('capture: ▲ appears with its altitude', plotMarkers(state(), pred).apo !== null
    && /km$/.test(plotReadouts(state(), pred).highest.text), plotReadouts(state(), pred).highest.text);
  stepWhile(() => !harness.inRing());
  harness.keyUp('Space');
  const lockDigits: string[] = [];
  let hundred = true;
  stepWhile(() => {
    pred = getPrediction();
    const text = plotChip(state(), pred).text;
    const match = text.match(/^IN RING · LOCKING (\d)$/);
    if (match && lockDigits[lockDigits.length - 1] !== match[1]) lockDigits.push(match[1]!);
    if (pred.fit.inRing && plotReadouts(state(), pred).range.text !== '100%') hundred = false;
    return true;
  }, 10);
  check('lock: the chip counts LOCKING 3, 2, 1', lockDigits.join('') === '321', lockDigits.join(','));
  check('lock: an all-green loop reads IN BAND 100%', hundred);
  pred = getPrediction();
  check('locked: chip ORBIT LOCKED, status LOCKED', plotChip(state(), pred).text === 'ORBIT LOCKED'
    && plotReadouts(state(), pred).status.text === 'LOCKED' && plotReadouts(state(), pred).range.text === '100%');
  // WP5: a lock goes on into the landing (slice 1a), where the world still coasts at TACTICAL (the plot moves);
  // only a lost ship's pace reads STOPPED.
  // The WP1 harness mounts no landing, so no LZ window is counted here; the chip in a real landing (the next LZ window)
  // is tests/unit/landing/hud.test.ts's. Slice 1b opens the engine in the landing (selectors engineOpen): BURN stays live
  // after the lock, and reads LANDING OVER only once the landing ends (landing/hud.test.ts).
  check('locked: BURN stays live in the landing, pace TACTICAL while landing, no countdown',
    !burnButton(state()).disabled && burnButton(state()).look === 'ready'
    && state().run.phase === 'landing' && paceLabel(state()) === 'TACTICAL ×20' && countdownChip(state(), pred) === null,
    `${state().run.phase} / ${paceLabel(state())}`);
  check('locked: the strip line', FLIGHT_OVER_LINE[harness.status() as 'locked'] === 'ORBIT LOCKED');
}

// --- pause --------------------------------------------------------------------------------------
{
  harness.reset();
  harness.step();
  setPaused(store, true);
  check('pause: pace PAUSED, BURN refused look', paceLabel(state()) === 'PAUSED'
    && burnButton(state()).text === 'PAUSED · [P] TO RESUME' && burnButton(state()).disabled);
  check('pause: SKIP struck out with PAUSED... or the crash course first',
    skipButton(state(), getPrediction()).blockedReason === 'PAUSED', String(skipButton(state(), getPrediction()).blockedReason));
  setPaused(store, false);
}

// --- ACCEPT ORBIT on a closed loop that is not green -------------------------------------------
function captureHalfway(h: Harness): void {
  h.keyDown('Space');
  stepWhile(() => h.rp() < 6000);
  h.keyUp('Space');
  h.press('KeyS');
  stepWhile(() => (h.burnPointTac() ?? 1) > 0);
  h.keyDown('Space');
  stepWhile(() => getPrediction().outcome !== 'closed');
  h.keyUp('Space');
}
{
  harness.reset();
  captureHalfway(harness);
  let pred = getPrediction();
  check('accept: not offered right after the loop closes', !acceptModel(state(), pred).offered && pred.outcome === 'closed' && !pred.fit.inRing);
  // Look away from guidance and idle: ACCEPT appears after ACCEPT_IDLE_AI_SEC.
  stepWhile(() => !acceptModel(state(), getPrediction()).offered, 30);
  pred = getPrediction();
  const model = acceptModel(state(), pred);
  check('accept: offered after idling', model.offered, `closedIdleAiSec ${state().burn.closedIdleAiSec.toFixed(1)}`);
  const outcome = model.strands ? ' · STRANDED' : '';
  check('accept: labels (and STRANDED named when accepting strands the ship)',
    new RegExp(`^ACCEPT · IN BAND \\d+%${outcome}$`).test(acceptLabel(model, false))
    && new RegExp(`^CLICK AGAIN TO ACCEPT · \\d+%${outcome}$`).test(acceptLabel(model, true))
    && model.strands === (pred.greenFraction < 0.1), `${acceptLabel(model, false)} / ${acceptLabel(model, true)}`);
  acceptOrbit(store);
  const done = harness.status();
  check('accept: ends the flight', done === 'accepted' || done === 'stranded', done);
  check('accept: chip and strip agree', plotChip(state(), getPrediction()).text === (done === 'accepted' ? 'ORBIT ACCEPTED' : 'STRANDED')
    && FLIGHT_OVER_LINE[done as 'accepted' | 'stranded'] === (done === 'accepted' ? 'ORBIT ACCEPTED' : 'STRANDED'));
}

// --- FUEL short of the planned burn -----------------------------------------------------------
{
  harness.reset();
  harness.keyDown('Space');
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  harness.press('KeyS');
  // 30% is short of the capture (about 37%) but more than closing the loop at all costs (about
  // 23%). Below that there is no burn to plan since WP1-rules 3b (the strip says NOT ENOUGH FUEL).
  // LEAD-2 review round 1: `short` is the plan's own verdict (Prediction.fuelShort, past the 10 Hz refresh), and a short
  // tank whose burn is still the plan says to spend it all (it said NOT ENOUGH beside the strip's WAIT).
  store.mutate((d) => { d.burn.fuelPct = 30; });
  for (let i = 0; i < 3; i++) harness.step();
  const fuel = fuelModel(state(), getPrediction());
  check('short: the NEEDED tick turns into USE IT ALL', fuel.short && /^NEED \d+% · USE IT ALL$/.test(fuel.needText) && fuel.text === '30%',
    `${fuel.text} ${fuel.needText}`);
  store.mutate((d) => { d.burn.fuelPct = 5; });
  for (let i = 0; i < 3; i++) harness.step(); // past the 10 Hz prediction refresh
  const hopeless = fuelModel(state(), getPrediction());
  check('short: too little to close the loop at all → no NEEDED tick, the strip says so',
    hopeless.neededPct === null && /^NOT ENOUGH FUEL — the ship will fly past/.test(harness.objective()?.text ?? ''),
    `${hopeless.text} "${hopeless.needText}" / "${harness.objective()?.text}"`);
  check('short: FUEL rounds up (0.2% still reads 1%)', (() => {
    store.mutate((d) => { d.burn.fuelPct = 0.2; });
    return fuelModel(state(), getPrediction()).text === '1%';
  })());
}

finish();
