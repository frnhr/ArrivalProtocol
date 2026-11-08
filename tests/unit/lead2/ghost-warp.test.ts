// LEAD-2 item 1: ghost bursts (C2, §6.4) land at the same game times at ×25, at ×200 and through the coast SKIP.
// WP10 extends it (the lead's ruling): the SKIP lands only on the ship's first burst and flies through the later ones
// (split at each, the burst flown in sub-steps), with the same windows and Δv; check 3 says so.
// The coast SKIP flies a SKIP tick in one exact jump along the orbit, with no sub-steps to apply a burst to, so it
// must land exactly where the next burst starts (pace.ts landingInSec, orbit-sim.ts ghostDueInSec) and leave the
// burst to the sim's next tick. The burst is drawn from the same seeded Poisson stream, in the same moment, as the
// sim would draw it, so asking for it never moves it.
// The ship (ship 1's flight, any ship with AP_SHIP) with its Thrust Ctrl failing (both copies at 31: a burst about
// every 25 tactical s), planted on a loop falling toward ▼ with the trim there far ahead, so a SKIP has somewhere to
// go: three flights over the same stretch of game time, at the ?debug ladder's ×25 and ×200, and at the director's
// pace with a kid who presses F whenever SKIP is offered. Each burst's start, length and Δv must agree.
import '../support/classic-world';
import { createHarness, check, finish } from '../wp1/harness';
import { setDebugWarp, skipBlockReason } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { on } from '@systems/events';
import { stateFromElements } from '@/types/orbit';
import { hasIntegrity } from '@state/selectors';
import { placeOrbit } from '../wp1-rules/flows';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { planet, ring, tacticalWarp } = state().level;
const FAILING_INTEGRITY = 31;
// Game time each flight covers: about 40 bursts' worth (40 × 25 tactical s), well before the planted trim at ▼.
const SPAN_TAC = 1000;

interface Burst {
  startTSec: number;
  endTSec: number;   // the end of its window
  inSkip: boolean;   // WP10: flown through inside a SKIP tick (a later burst)
}

interface Flight {
  bursts: Burst[];
  skipLandings: number[];  // game times where a SKIP ended
  skips: number;
  dvAtMarkKmS: number;     // the Δv the bursts had delivered when the clock first passed `markTSec`
}

function plant(): void {
  harness.reset(1);
  const rp = (ring.min + ring.max) / 2;
  const ra = 6 * ring.max;
  placeOrbit(harness, stateFromElements(rp, (ra - rp) / (ra + rp), 0, -2.6, planet.mu));
  harness.store.update((d) => {
    for (const seg of d.memory) if (seg.role === 'thrust-ctrl' && hasIntegrity(seg)) seg.integrity = FAILING_INTEGRITY;
    d.burn.sasMode = 'off';
    d.burn.omega = 0;
    d.ui.memoryRev++;
  });
}

// `markTSec`: a game time between two bursts (no burst runs within a tick of it), where the Δv delivered so far is
// read: the same bursts over the same windows deliver the same Δv, whatever the warp (the bursts are the only thrust).
function fly(mode: 25 | 200 | 'skip', markTSec = Infinity): Flight {
  plant();
  const flight: Flight = { bursts: [], skipLandings: [], skips: 0, dvAtMarkKmS: NaN };
  const offStart = on('ghost-start', ({ inSkip }) => {
    const ghost = state().burn.ghost;
    if (!ghost) throw new Error('ghost-start without a burst');
    flight.bursts.push({ startTSec: ghost.startTSec, endTSec: ghost.endTSec, inSkip });
  });
  if (mode !== 'skip') setDebugWarp(harness.store, mode);
  const end = state().clock.tSec + SPAN_TAC * tacticalWarp;
  try {
    while (state().clock.tSec < end && harness.status() === 'approaching') {
      if (mode === 'skip' && state().clock.skipWarp === null && skipBlockReason(state(), getPrediction()) === null) {
        harness.press('KeyF');
        flight.skips++;
      }
      harness.step();
      const clock = state().clock;
      if (Number.isNaN(flight.dvAtMarkKmS) && clock.tSec >= markTSec) flight.dvAtMarkKmS = state().burn.dvDeliveredKmS;
      // The landing tick: the clock stands exactly on the SKIP's end point.
      if (clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) flight.skipLandings.push(clock.tSec);
    }
  } finally {
    offStart();
    setDebugWarp(harness.store, null);
  }
  // A burst still running at the end of the span is cut by it: compared by its start only. WP10 review fix round 1: a
  // SKIP's last tick can land on the end of a burst that starts after the span (it flies the burst whole), which the
  // ×25 flight, stopping on its first tick past the span, never reaches: only bursts that start inside the span count.
  flight.bursts = flight.bursts.filter((burst) => burst.startTSec < end);
  return flight;
}

// The ×25 flight first, to find a quiet moment: the middle of the widest gap between two bursts in its second half.
const probe = fly(25);
let markTSec = NaN;
let widestGap = 0;
for (let i = Math.floor(probe.bursts.length / 2); i + 1 < probe.bursts.length; i++) {
  const gap = probe.bursts[i + 1]!.startTSec - probe.bursts[i]!.endTSec;
  if (gap > widestGap) { widestGap = gap; markTSec = probe.bursts[i]!.endTSec + gap / 2; }
}
const slow = fly(25, markTSec);
const fast = fly(200, markTSec);
const skip = fly('skip', markTSec);
// The worst difference between two flights' burst windows (Infinity when they had different numbers of bursts).
const windowsAgree = (a: Flight, b: Flight): number => {
  if (a.bursts.length !== b.bursts.length) return Infinity;
  let worst = 0;
  a.bursts.forEach((burst, i) => {
    const other = b.bursts[i]!;
    worst = Math.max(worst, Math.abs(burst.startTSec - other.startTSec), Math.abs(burst.endTSec - other.endTSec));
  });
  return worst;
};

check(`ghost bursts over ${SPAN_TAC} tactical s: the same ${slow.bursts.length} burst windows at ×25, ×200 and through ${skip.skips} SKIPs`,
  slow.bursts.length >= 20 && windowsAgree(slow, fast) < 1e-6 && windowsAgree(slow, skip) < 1e-6,
  `×25 ${slow.bursts.length}, ×200 ${fast.bursts.length}, SKIP ${skip.bursts.length} bursts; worst window difference `
  + `×200 ${windowsAgree(slow, fast).toExponential(1)} s, SKIP ${windowsAgree(slow, skip).toExponential(1)} s`);
check(`…and the same Δv delivered by the time a quiet moment between two of them (${widestGap.toFixed(0)} game s wide) has passed`,
  Math.abs(slow.dvAtMarkKmS - fast.dvAtMarkKmS) < 1e-9 && Math.abs(slow.dvAtMarkKmS - skip.dvAtMarkKmS) < 1e-9 && slow.dvAtMarkKmS > 0,
  `×25 ${(slow.dvAtMarkKmS * 1000).toFixed(6)} m/s, ×200 ${(fast.dvAtMarkKmS * 1000).toFixed(6)}, SKIP ${(skip.dvAtMarkKmS * 1000).toFixed(6)}`);
// WP10 (the lead's ruling): only the ship's FIRST burst stops a SKIP, which lands exactly on its start (the burst fires
// on the tick after, at its own time: the alarm moment). Every later burst is flown through inside a SKIP tick (the
// windows and the Δv above are still the same as at ×25), so the flight needs a few presses of F, not one per burst
// (before WP10: 40 or so). A SKIP stops early only on a changed plan (systems/ghost-thrust.ts).
{
  const first = skip.bursts[0];
  const landedOnBurst = skip.skipLandings.filter((landing) => skip.bursts.some((burst) => Math.abs(burst.startTSec - landing) < 1e-6));
  const landedOnFirst = first !== undefined && landedOnBurst.length === 1 && Math.abs(landedOnBurst[0]! - first.startTSec) < 1e-6;
  const flownThrough = skip.bursts.filter((burst) => burst.inSkip).length;
  // (On a ship whose planted loop the bursts bend into the planet, VESPER's with AP_SHIP=3, the SKIP stops on that
  // changed plan and is not offered again: the later bursts then fire at CRUISE or TACTICAL, as any flight's.)
  check('…only the first burst stops a SKIP (it lands exactly on its start); the later ones are flown through, in a few presses',
    landedOnFirst && !first.inSkip && flownThrough > 0 && skip.skips <= skip.bursts.length / 4,
    `${skip.skips} presses, ${skip.bursts.length} bursts, ${flownThrough} flown through inside a SKIP, ${landedOnBurst.length} landing(s) on a burst`);
}

finish();
