// LEAD-2 item 5: WP9's dodge rules stay intact under the coast SKIP, and the dodge promise never lies.
// • A SKIP with the dodge open stops exactly SKIP_END_LEAD_TAC before the dodge's deadline (pace.ts
//   dodgeDeadlineInSec), F is then refused (DODGE THE DEBRIS FIRST), and the last DODGE_TACTICAL_LEAD_TAC run at
//   TACTICAL (tests/unit/lead2/kestrel-debris.test.ts checks the same stop against the tree before LEAD-2).
// • The first seed still holds SKIP (`SOMETHING IS COMING`) on a seeding ship until it has come.
// • The promise: WP9 round 2 judged the dodge with no Core thread busy, and a kid who started the correction in the
//   last ~0.7 tac s of the countdown while two REPAIRs ran was hit (the WP9 verify-3 probe, 3 broken promises). It is
//   now judged with every thread busy: a start the countdown still promises dodges whatever the threads do, and the
//   deadline holds still while ops start and end.
import { createHarness9 } from '../wp9/harness9';
import { followDirector } from '../wp2/harness2';
import { check, finish } from '../wp1/harness';
import { installTool } from '@systems/licences';
import { getPrediction } from '@systems/predict';
import { skipBlockReason, SKIP_REFUSAL_DODGE, SKIP_REFUSAL_SEED_COMING } from '@systems/pace';
import { actionRepair, setIntegrity } from '@state/actions';
import { getByRole, hasIntegrity } from '@state/selectors';
import { getOpsBySeg } from '@systems/ops-core';
import { SKIP_END_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC } from '@data/tuning';

const h = createHarness9(5);
const state = () => h.store.getState();
const BUSY_ROLES = ['telemetry', 'comms'] as const;

// Tactical seconds left on the dodge's countdown (null: no dodge promised).
function dodgeLeftTac(): number | null {
  const pred = getPrediction();
  const hit = pred.zoneHits.find((zone) => zone.kind === 'debris');
  if (!hit || hit.correctionClears !== true || hit.dodgeInSec === null) return null;
  return (pred.asOfTSec + hit.dodgeInSec - state().clock.tSec) / state().level.tacticalWarp;
}

// --- The SKIP stops ahead of the choice, and the last seconds are real seconds --------------------------------------
{
  h.kestrel(5, { phase2Hollow: true, hollowAsleep: true, sensorHealed: true });
  for (let i = 0; i < 4; i++) h.step();
  h.press('KeyF');
  let landedLeft: number | null = null;
  for (let i = 0; i < 2000 && state().clock.skipWarp !== null; i++) {
    h.step();
    const clock = state().clock;
    if (clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) landedLeft = dodgeLeftTac();
  }
  const refusal = skipBlockReason(state(), getPrediction());
  let tacticalAll = true;
  let sawLastSeconds = false;
  while ((dodgeLeftTac() ?? 0) > 0.05) {
    h.step();
    const left = dodgeLeftTac();
    if (left !== null && left < DODGE_TACTICAL_LEAD_TAC - 0.1) {
      sawLastSeconds = true;
      if (state().clock.pace !== 'tactical') tacticalAll = false;
    }
  }
  check(`the dodge open: a SKIP lands exactly ${SKIP_END_LEAD_TAC} tac s before the deadline, then F says ${SKIP_REFUSAL_DODGE}`,
    landedLeft !== null && Math.abs(landedLeft - SKIP_END_LEAD_TAC) < 0.01 && refusal === SKIP_REFUSAL_DODGE,
    `${landedLeft?.toFixed(3)} tac s left at the landing; SKIP "${refusal}"`);
  check(`…and the deadline's last ${DODGE_TACTICAL_LEAD_TAC} tac s run at TACTICAL`, sawLastSeconds && tacticalAll, `TACTICAL throughout: ${tacticalAll}`);
}

// --- The first seed still holds SKIP ------------------------------------------------------------------------------
// KESTREL with HOLLOW awake: the kid dodges early and walls nothing; after the wake, SKIP waits for the first seed.
{
  h.kestrel(5, { phase2Hollow: true, sensorHealed: true });
  let held = false;
  let seeded = false;
  let skipUnderHold = false;
  followDirector(h, {
    reactionSec: 0.3, maxWall: 240,
    mistake: () => {
      const awake = state().hollow.phase === 'awake';
      const firstSeedDue = awake && state().hollow.cfg.seed !== null && state().hollow.seedMoments === 0;
      if (firstSeedDue && skipBlockReason(state(), getPrediction()) === SKIP_REFUSAL_SEED_COMING) held = true;
      if (firstSeedDue && state().clock.pace === 'skip') skipUnderHold = true;
      if (state().hollow.seedMoments > 0) seeded = true;
      return seeded;
    },
  });
  check(`a seeding HOLLOW awake: SKIP refused (${SKIP_REFUSAL_SEED_COMING}) until the first seed came, and never SKIPping under that hold`,
    held && seeded && !skipUnderHold, `held ${held}, seeded ${seeded}, SKIP under the hold ${skipUnderHold}`);
}

// --- The promise holds with every thread busy ---------------------------------------------------------------------
// The WP9 verify-3 probe: two hurt files REPAIRed from 3 tac s before the start, the correction started 1.0–0.5 tac s
// before the countdown ends, both threads busy all through the hold.
{
  const rows: string[] = [];
  let broken = 0;
  for (const startLeftTac of [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    h.kestrel(5, { phase2Hollow: true, hollowAsleep: true, sensorHealed: true });
    installTool(h.store, 'repair');
    h.store.update((d) => {
      for (const role of BUSY_ROLES) {
        const seg = d.memory.find((candidate) => candidate.role === role);
        if (seg && hasIntegrity(seg)) setIntegrity(seg, 1);
      }
    });
    let corrected = false;
    let repairsStarted = false;
    let promisedAtStart = false;
    let busyAtStart = 0;
    followDirector(h, {
      reactionSec: 0, maxWall: 900,
      mistake: (_harness, control) => {
        const left = dodgeLeftTac();
        const id = h.objective()?.id ?? '';
        if (!repairsStarted && left !== null && left <= startLeftTac + 3) {
          repairsStarted = true;
          for (const role of BUSY_ROLES) {
            const seg = getByRole(state(), role);
            if (seg) actionRepair(h.store, seg);
          }
        }
        if (!corrected) {
          if (left !== null && left > startLeftTac && /^F8/.test(id)) { control.setHolding(false); return true; }
          if (/^F8|^F6/.test(id)) {
            corrected = true;
            promisedAtStart = left !== null && left > 0;
            busyAtStart = BUSY_ROLES.filter((role) => { const seg = getByRole(state(), role); return seg ? getOpsBySeg(seg.id).length > 0 : false; }).length;
          }
        }
        return false;
      },
    });
    const hits = h.zoneHits().length;
    rows.push(`start ${startLeftTac} tac s before: promised ${promisedAtStart}, ${busyAtStart} threads busy, ${hits} hit(s), ${h.status()}`);
    if (promisedAtStart && hits > 0) broken++;
  }
  check('the dodge promise with both Core threads busy through the correction: every promised start dodges (0 broken promises)',
    broken === 0 && rows.every((row) => row.includes('2 threads busy')), rows.join(' | '));
}

// --- The deadline holds still while ops start and end ------------------------------------------------------------
{
  h.kestrel(5, { phase2Hollow: true, hollowAsleep: true, sensorHealed: true });
  installTool(h.store, 'repair');
  h.store.update((d) => {
    for (const role of BUSY_ROLES) {
      const seg = d.memory.find((candidate) => candidate.role === role);
      if (seg && hasIntegrity(seg)) setIntegrity(seg, 20);
    }
  });
  const deadlines = new Set<string>();
  let started = false;
  while (state().clock.aiSec < 45) {
    h.step();
    if (!started && state().clock.aiSec >= 20) {
      started = true;
      for (const role of BUSY_ROLES) {
        const seg = getByRole(state(), role);
        if (seg) actionRepair(h.store, seg);
      }
    }
    const left = dodgeLeftTac();
    if (left !== null) deadlines.add(((state().clock.tSec / state().level.tacticalWarp) + left).toFixed(2));
  }
  check('one deadline through two REPAIRs starting and ending (it is judged with every thread busy)', deadlines.size === 1,
    [...deadlines].join(', '));
}

finish();
