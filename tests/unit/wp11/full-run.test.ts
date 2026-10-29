// WP11 acceptance 4 (§9 WP11): the whole run, headless, on 50 seeds. Title → ARES-VII → HALCYON → KESTREL → VESPER →
// LAST LIGHT → RUN END, flown by the strip-following kid with the defenders (WP7's REPAIR and MOVE, WP9's sensor and
// seeds, WP10's pip → SWAP, WP11's verb blocks and the root's DELETE), [B] when AUTOBURN is offered, THE DEAL refused, the
// first card at every TRANSMIT, and at the finale MERGE on even seeds (when the charge pays for it) and PURGE on odd
// ones. A lost ship goes on the way its card's button does (continueAfterLoss). The run must end in the victory RUN END
// (won-purge or won-merge, the victory tone) in at least 90% of the seeds. Every module is in its initial state after a
// NEW RUN. Prints each seed's line.
// WP11 fix round 1 (the lead's rulings of 20:55 and 21:30): also LAST LIGHT's verbs (telegraphed, landed, blocked, and
// the turns skipped: no fair target, or no thread free to block with), its drivers lost, and the REPAIR CHARGE at the
// choice; at least half of the runs that reach the choice must have the 20 MERGE costs (the lead's target; the lever is
// the guidance, `MOVE it behind a WALL` once a driver is bitten again in the same spot, and the defender now MOVEs onto
// a spot the MOVE preview calls SAFE: harness11.ts).
// Slice 1a: every landing lands at once (tests/unit/support/landing-instant.ts) except LAST LIGHT's, which stands
// FINAL_LANDING_SEC AI seconds (phase 2's 16 × 3.0 s of printing) while the duel goes on, as boss-sim's C does.
// TODO(phase2): fly the landings by the strip once Track SIM's bay, pace and landing guidance are merged.
import { check, finish } from '../wp1/harness';
import { createHarness11, LAST_LIGHT } from './harness11';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport, continueAfterLoss, shipLost } from '@systems/run';
import { runEndModel } from '@systems/run-end';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { resetReport } from '@systems/reset';
import { chargeLeft } from '@state/selectors';
import { MERGE_COST_CHARGE } from '@data/tuning';
import { chooseFinale } from '@systems/finale';
import type { GameState } from '@state/schema';
import { byDepth } from '../depth';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';

const FINAL_LANDING_SEC = Number(process.env.FINAL_LANDING_SEC ?? 48);
// FINAL_LANDING=strip: LAST LIGHT's landing flown by the strip ([L] at the windows, followLanding) instead of standing.
const FINAL_STRIP = process.env.FINAL_LANDING === 'strip';

// Quick depth (tests/unit/depth.ts): seeds 1 and 2, one PURGE and one MERGE run; full: 50.
const SEEDS = Number(process.env.RUN_SEEDS ?? byDepth(2, 50));
const h = createHarness11(1, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();

// A kid playing for MERGE saves REPAIR CHARGE (VESPER's boot: `> keep 20 charge for me`): it heals the Core only back to
// its two threads.
let defendOpts: { coreHealBelow?: number; coreHealTo?: number } = {};

function flyShip(): void {
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 1500,
    mistake: () => {
      h.defend11(defendOpts);
      const deal = state().hollow.deal;
      if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
      return false;
    },
  });
}

// Defends through the landing to the LANDING REPORT (on the flagship: through the duel and the choice).
function toReport(choice: 'purge' | 'merge'): boolean {
  if (state().run.shipIndex === LAST_LIGHT && FINAL_STRIP) {
    let picked = false;
    followLanding(h, {
      maxWall: 900,
      onTick: () => {
        h.defend11(defendOpts);
        if (picked || state().hollow.finale.phase !== 'choice') return;
        picked = true;
        chargeAtChoice = chargeLeft(state());
        const hollow = state().hollow;
        verbsAtChoice = { moments: hollow.verbMoments, telegraphed: hollow.verbsLanded + hollow.verbsBlocked, landed: hollow.verbsLanded, blocked: hollow.verbsBlocked };
        chooseFinale(h.store, choice === 'merge' && chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge');
      },
    });
  } else if (state().run.shipIndex === LAST_LIGHT) {
    const end = h.wall() + 600;
    while (state().hollow.finale.phase !== 'choice' && state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) {
      h.defend11(defendOpts);
      h.step();
    }
    if (state().hollow.finale.phase === 'choice') {
      chargeAtChoice = chargeLeft(state());
      const hollow = state().hollow;
      verbsAtChoice = { moments: hollow.verbMoments, telegraphed: hollow.verbsLanded + hollow.verbsBlocked, landed: hollow.verbsLanded, blocked: hollow.verbsBlocked };
      const pick = choice === 'merge' && chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge';
      h.finishFinale(pick, 600, defendOpts);
    }
  }
  const end = h.wall() + 600;
  while (state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) { h.defend11(defendOpts); h.step(); }
  if (state().run.shipIndex === LAST_LIGHT) lostOnLastLight = state().landing.pods.filter((record) => record.driverLost !== null).length;
  return state().run.phase === 'report';
}

interface VerbCounts { moments: number; telegraphed: number; landed: number; blocked: number }
interface SeedResult {
  seed: number; cause: string; tone: string; landed: number; ships: string; wall: number; charge: number | null; verbs: VerbCounts | null; lost: number | null;
}
let chargeAtChoice: number | null = null;
let verbsAtChoice: VerbCounts | null = null;
let lostOnLastLight: number | null = null;
const results: SeedResult[] = [];
const started = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  h.newRun(seed);
  receiveTransmission(h.store);
  h.stepUntil(() => state().run.phase === 'flight', 15);
  const choice = seed % 2 === 0 ? 'merge' : 'purge';
  defendOpts = choice === 'merge' ? { coreHealBelow: 50, coreHealTo: 60 } : {};
  chargeAtChoice = null;
  verbsAtChoice = null;
  lostOnLastLight = null;
  let guard = 0;
  while (state().run.phase !== 'end' && guard++ < 12) {
    if (state().run.phase === 'boot') h.stepUntil(() => state().run.phase !== 'boot', 25);
    setLandingMode(state().run.shipIndex !== LAST_LIGHT ? 'instant' : FINAL_STRIP ? 'manual' : FINAL_LANDING_SEC > 0 ? { after: FINAL_LANDING_SEC } : 'instant');
    if (state().run.phase === 'flight' && state().burn.status === 'approaching' && !state().run.coreLost) flyShip();
    if (shipLost(state())) {
      // The LOST card's button.
      continueAfterLoss(h.store);
    } else if (state().run.phase === 'landing') {
      if (!toReport(choice) && !shipLost(state())) break;
      if (state().run.phase === 'report') continueAfterReport(h.store);
    } else if (state().run.phase === 'report') {
      continueAfterReport(h.store);
    }
    if (state().run.phase === 'transmit') {
      h.transmit();
      h.stepUntil(() => state().run.phase === 'flight', 25);
    }
  }
  const ended = state().run.phase === 'end';
  const model = ended ? runEndModel(state()) : null;
  const line: SeedResult = {
    seed,
    cause: state().run.endCause ?? `(${state().run.phase} on ${state().level.shipName})`,
    tone: model?.tone ?? '-',
    landed: model?.landed ?? 0,
    ships: state().run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`).join(' '),
    wall: h.wall(),
    charge: chargeAtChoice,
    verbs: verbsAtChoice,
    lost: lostOnLastLight,
  };
  results.push(line);
  const verbText = line.verbs ? `verbs ${line.verbs.telegraphed} (${line.verbs.landed} landed, ${line.verbs.blocked} blocked, ${line.verbs.moments - line.verbs.telegraphed} skipped)` : 'verbs -';
  console.log(`seed ${String(seed).padStart(2)}: ${line.cause.padEnd(12)} ${line.tone.padEnd(7)} landed ${String(line.landed).padStart(5)} charge at the choice ${String(line.charge ?? '-').padStart(3)} | LAST LIGHT lost ${line.lost ?? '-'} | ${verbText} | ${line.ships}`);
}
const victories = results.filter((result) => (result.cause === 'won-purge' || result.cause === 'won-merge') && result.tone === 'victory').length;
const merges = results.filter((result) => result.cause === 'won-merge').length;
console.log(`${SEEDS} runs in ${((Date.now() - started) / 1000).toFixed(0)} s: ${victories} victories (${merges} MERGE)`);
const atChoice = results.filter((result) => result.charge !== null);
const charges = atChoice.map((result) => result.charge!).sort((a, b) => a - b);
const affordable = charges.filter((charge) => charge >= MERGE_COST_CHARGE).length;
const sum = (pick: (verbs: VerbCounts) => number): number => atChoice.reduce((total, result) => total + (result.verbs ? pick(result.verbs) : 0), 0);
const lostRuns = results.filter((result) => result.lost !== null);
console.log(`LAST LIGHT over the ${atChoice.length} runs that reached the choice: REPAIR CHARGE median ${charges[Math.floor(charges.length / 2)]}, `
  + `range ${charges[0]}–${charges[charges.length - 1]}, ≥ ${MERGE_COST_CHARGE} in ${affordable}; verbs per ship ${(sum((verbs) => verbs.telegraphed) / atChoice.length).toFixed(1)} `
  + `(landed ${(sum((verbs) => verbs.landed) / atChoice.length).toFixed(2)}, blocked ${(sum((verbs) => verbs.blocked) / atChoice.length).toFixed(1)}, `
  + `skipped turns ${(sum((verbs) => verbs.moments - verbs.telegraphed) / atChoice.length).toFixed(1)}); drivers lost `
  + `${(lostRuns.reduce((total, result) => total + result.lost!, 0) / Math.max(1, lostRuns.length)).toFixed(2)} on average (worst ${Math.max(...lostRuns.map((result) => result.lost!))})`);
check(`…at least half of the runs reach the choice with the ${MERGE_COST_CHARGE} MERGE costs (the lead's target, 21:30)`,
  affordable * 2 >= atChoice.length, `${affordable}/${atChoice.length}`);
check(`ships 1–5 end in the victory RUN END in ≥ 90% of ${SEEDS} seeds`, victories >= Math.ceil(0.9 * SEEDS), `${victories}/${SEEDS}`);
check('…both endings were reached', merges > 0 && victories - merges > 0, `${merges} MERGE, ${victories - merges} PURGE`);
setLandingMode('instant');
h.newRun(SEEDS + 1);
check('NEW RUN: every reset module in its initial state', resetReport().length === 0, JSON.stringify(resetReport()));
finish();
