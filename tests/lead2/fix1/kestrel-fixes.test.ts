// LEAD-2 review round 1, the fixes that show on KESTREL (ship 3: a debris dodge, and the ship where kids REPAIR most).
// • trimFlyable is judged at the ship's full thrust: the trim the strip asks for, and Rule 4's latched verdict, are the
//   same with no thread busy and with one or two REPAIRs running (before: ▲ 45–80k km flipped between ▲ and ▼, and 5 of
//   108 rows at 14–16% FUEL changed the verdict; `.tmp/review/LEAD-2/correctness/flyable-*.ts`).
// • The dodge's TACTICAL look-ahead is one CRUISE tick, not one tick at the speed pace itself chose: a coast enters
//   TACTICAL once and stays there through the deadline, from any tick phase (before: 6 of 20 went TACTICAL → CRUISE →
//   TACTICAL at 0:10); a SKIP lands 15 tac s before the deadline and is never dropped to TACTICAL on the way, also from
//   1,500 tac s out (before: a TACTICAL tick mid-SKIP and the ramp restarted; `.tmp/review/LEAD-2/spec/dodge-far-skip.ts`).
// • The dodge is judged with the Core's capacity busy, not its thread count: healing the Core past 50% (one thread to
//   two) leaves the deadline where it was (before: 1.45 tac s earlier); with THREAD+ (three threads) the deadline holds
//   still through three busy threads, and a start the countdown still promises dodges with all three busy. KESTREL has
//   only two tool files a REPAIR can take offline without blinding the plot or the presets (Telemetry, AI Comms; ship
//   files can't be healed), so the third thread is held the way AUTOBURN and SWAP hold one (ops-core reserveThread).
import { createHarness9 } from '../../wp9/harness9';
import { followDirector } from '../../wp2/harness2';
import { check, finish } from '../../wp1/harness';
import { computePrediction, getPrediction } from '@systems/predict';
import { propagateConic, stateFromElements } from '@/types/orbit';
import { placeOrbit } from '../../wp1-rules/flows';
import { installTool } from '@systems/licences';
import { actionRepair, setIntegrity } from '@state/actions';
import { getByRole, hasIntegrity } from '@state/selectors';
import { getOpsBySeg, threadsBusy, reserveThread, releaseThread } from '@systems/ops-core';
import { SKIP_END_LEAD_TAC, DODGE_TACTICAL_LEAD_TAC } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { SegmentRole } from '@/types/segment';

const h = createHarness9(5);
const state = () => h.store.getState();

// Tactical seconds left on the dodge's countdown (null: no dodge promised).
function dodgeLeftTac(): number | null {
  const pred = getPrediction();
  const hit = pred.zoneHits.find((zone) => zone.kind === 'debris');
  if (!hit || hit.correctionClears !== true || hit.dodgeInSec === null) return null;
  return (pred.asOfTSec + hit.dodgeInSec - state().clock.tSec) / state().level.tacticalWarp;
}

// The deadline in absolute tactical seconds, rounded to the search's resolution.
function deadlineTac(): string | null {
  const left = dodgeLeftTac();
  return left === null ? null : (state().clock.tSec / state().level.tacticalWarp + left).toFixed(2);
}

function hurt(roles: readonly SegmentRole[], integrity: number): void {
  h.store.update((d) => {
    for (const role of roles) {
      const seg = d.memory.find((candidate) => candidate.role === role);
      if (!seg || !hasIntegrity(seg)) throw new Error(`kestrel-fixes: no ${role} file to hurt`);
      setIntegrity(seg, integrity);
    }
  });
}

function repair(roles: readonly SegmentRole[]): void {
  for (const role of roles) {
    const seg = getByRole(state(), role);
    if (!seg) throw new Error(`kestrel-fixes: no ${role} file to REPAIR`);
    actionRepair(h.store, seg);
  }
}

function setCore(fields: { integrity?: number; capacity?: number }): void {
  h.store.update((d) => {
    const core = d.memory.find((seg) => seg.type === 'core');
    if (!core || core.type !== 'core') throw new Error('kestrel-fixes: no AI Core');
    if (fields.integrity !== undefined) core.integrity = fields.integrity;
    if (fields.capacity !== undefined) core.capacity = fields.capacity;
    d.ui.memoryRev++;
  });
}

// Moves the ship back along its own conic by `backSec` game seconds (a Kepler time reversal).
function rewind(backSec: number): void {
  const orbit = state().orbit;
  const back = propagateConic({ x: orbit.x, y: orbit.y, vx: -orbit.vx, vy: -orbit.vy }, state().level.planet.mu, backSec);
  placeOrbit(h, { x: back.x, y: back.y, vx: -back.vx, vy: -back.vy });
}

// --- trimFlyable holds still while REPAIRs run ----------------------------------------------------------------------
{
  const verdict = (snapshot: GameState): string => {
    const pred = computePrediction({ ...snapshot, burn: { ...snapshot.burn, acceptOnly: false } });
    const burn = pred.burnPoint;
    return `${burn ? `${burn.reason}@${burn.event}` : 'none'}${pred.acceptOnly ? (pred.strandedAnyway ? ' STRANDED-line' : ' ACCEPT-only') : ''}`;
  };
  const BUSY: readonly SegmentRole[] = ['telemetry', 'comms'];
  const differ: string[] = [];
  let rows = 0;
  for (const raKm of [45000, 50000, 55000, 60000, 80000]) {
    for (const fuel of [14, 15, 16, 60]) {
      h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
      installTool(h.store, 'repair');
      hurt(BUSY, 5);
      h.store.update((d) => { d.burn.sasMode = 'prograde'; });
      placeOrbit(h, stateFromElements(4300, (raKm - 4300) / (raKm + 4300), 0, 2.9, state().level.planet.mu));
      h.store.mutate((d) => { d.burn.fuelPct = fuel; });
      const seen = [`0 busy ${verdict(structuredClone(state()))}`];
      for (const role of BUSY) {
        repair([role]);
        h.step();
        seen.push(`${threadsBusy()} busy ${verdict(structuredClone(state()))}`);
      }
      rows++;
      if (new Set(seen.map((entry) => entry.replace(/^\d busy /, ''))).size > 1) differ.push(`▲ ${raKm / 1000}k ${fuel}%: ${seen.join(' | ')}`);
    }
  }
  check(`trimFlyable: KESTREL ▼ 4,300 km / ▲ 45–80k km at 14–60% FUEL, the planned trim and Rule 4's verdict are the same with 0, 1 and 2 REPAIRs running (${rows} rows)`,
    differ.length === 0 && rows === 20, differ.slice(0, 3).join(' || ') || 'all the same');
}

// --- The dodge's TACTICAL: entered once, kept to the deadline, from any tick phase -----------------------------------
{
  const flickered: string[] = [];
  let lastTenAtTactical = true;
  let lastTenSeen = 0;
  for (let phase = 0; phase < 10; phase++) {
    h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
    // Back by phase/10 of a CRUISE tick, so the tick boundaries fall at ten different places around the 0:10 mark.
    const cruiseTickSec = state().level.cruiseWarp * 0.05;
    if (phase > 0) rewind((phase / 10) * cruiseTickSec);
    for (let i = 0; i < 4; i++) h.step();
    const seq: string[] = [];
    let enteredTactical = false;
    let leftTactical = false;
    for (let i = 0; i < 6000; i++) {
      h.step();
      const left = dodgeLeftTac();
      if (left === null || left < 1) break;
      if (left > 16) continue;
      const pace = state().clock.pace;
      if (seq[seq.length - 1]?.split('@')[0] !== pace) seq.push(`${pace}@${left.toFixed(2)}`);
      if (pace === 'tactical') enteredTactical = true;
      else if (enteredTactical) leftTactical = true;
      if (left < DODGE_TACTICAL_LEAD_TAC) {
        lastTenSeen++;
        if (pace !== 'tactical') lastTenAtTactical = false;
      }
    }
    if (leftTactical) flickered.push(`phase ${phase}: ${seq.join(' → ')}`);
  }
  check(`dodge pace: a coast with no SKIP enters TACTICAL once in its last 16 tac s and keeps it to the deadline (10 tick phases), the last ${DODGE_TACTICAL_LEAD_TAC} tac s all TACTICAL`,
    flickered.length === 0 && lastTenAtTactical && lastTenSeen > 0, flickered.slice(0, 2).join(' || ') || 'no flicker');
}

// --- A SKIP toward the dodge is never dropped on the way, also from far out ----------------------------------------
for (const rewindTac of [300, 1500]) {
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  rewind(rewindTac * state().level.tacticalWarp);
  for (let i = 0; i < 6; i++) h.step();
  h.press('KeyF');
  let armedTactical = 0;
  let landedLeft: number | null = null;
  let wall = 0;
  const paces: string[] = [];
  for (let i = 0; i < 4000; i++) {
    h.step();
    const clock = state().clock;
    if (clock.skipWarp !== null) wall += 0.05;
    if (clock.skipWarp !== null && clock.pace === 'tactical') armedTactical++;
    if (clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) landedLeft = dodgeLeftTac();
    if (paces[paces.length - 1] !== clock.pace) paces.push(clock.pace);
    const left = dodgeLeftTac();
    if (left !== null && left < 5) break;
  }
  check(`dodge SKIP from ${rewindTac} tac s out: never TACTICAL while armed, lands exactly ${SKIP_END_LEAD_TAC} tac s before the deadline, then CRUISE and TACTICAL once`,
    armedTactical === 0 && landedLeft !== null && Math.abs(landedLeft - SKIP_END_LEAD_TAC) < 0.01 && paces.join(' → ') === 'skip → cruise → tactical',
    `${armedTactical} TACTICAL ticks while armed; landed ${landedLeft?.toFixed(3)} tac s before after ${wall.toFixed(2)} wall s; paces ${paces.join(' → ')}`);
}

// --- The deadline does not move when the Core heals past 50% ---------------------------------------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  setCore({ integrity: 45 });
  for (let i = 0; i < 6; i++) h.step();
  const weak = deadlineTac();
  setCore({ integrity: 60 });
  for (let i = 0; i < 6; i++) h.step();
  const healed = deadlineTac();
  check('dodge: the Core healed from 45 to 60 (one thread to two) leaves the deadline where it was',
    weak !== null && weak === healed, `deadline ${weak} → ${healed} tac s`);
}

// --- THREAD+ (a three-thread Core): the deadline holds still, and the promise holds with three threads busy ------------
const TWO: readonly SegmentRole[] = ['telemetry', 'comms'];
const THIRD_THREAD = 'lead2-fix1-test';
function busyThree(): void {
  repair(TWO);
  if (!reserveThread(THIRD_THREAD)) throw new Error('kestrel-fixes: no third thread to hold');
}
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  setCore({ capacity: 3 });
  installTool(h.store, 'repair');
  hurt(TWO, 20);
  const deadlines = new Set<string>();
  let started = false;
  let mostBusy = 0;
  while (state().clock.aiSec < 45) {
    h.step();
    if (!started && state().clock.aiSec >= 20) { started = true; busyThree(); }
    if (started && state().clock.aiSec >= 30) releaseThread(THIRD_THREAD);
    mostBusy = Math.max(mostBusy, threadsBusy());
    const deadline = deadlineTac();
    if (deadline !== null) deadlines.add(deadline);
  }
  check('THREAD+: one deadline through three threads going busy and free again', deadlines.size === 1 && mostBusy === 3 && threadsBusy() === 0,
    `${[...deadlines].join(', ')}; at most ${mostBusy} threads busy, ${threadsBusy()} at the end`);
}
{
  const rows: string[] = [];
  let broken = 0;
  let promised = 0;
  for (const startLeftTac of [1.0, 0.7, 0.5]) {
    h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
    setCore({ capacity: 3 });
    installTool(h.store, 'repair');
    hurt(TWO, 1);
    let corrected = false;
    let repairsStarted = false;
    let promisedAtStart = false;
    let busyAtStart = 0;
    followDirector(h, {
      reactionSec: 0, maxWall: 900,
      mistake: (_harness, control) => {
        const left = dodgeLeftTac();
        const id = h.objective()?.id ?? '';
        if (!repairsStarted && left !== null && left <= startLeftTac + 3) { repairsStarted = true; busyThree(); }
        if (!corrected) {
          if (left !== null && left > startLeftTac && /^F8/.test(id)) { control.setHolding(false); return true; }
          if (/^F8|^F6/.test(id)) {
            corrected = true;
            promisedAtStart = left !== null && left > 0;
            busyAtStart = threadsBusy();
            if (TWO.some((role) => { const seg = getByRole(state(), role); return !seg || getOpsBySeg(seg.id).length === 0; })) busyAtStart = -1;
          }
        }
        return false;
      },
    });
    const hits = h.zoneHits().length;
    releaseThread(THIRD_THREAD);
    rows.push(`start ${startLeftTac} tac s before: promised ${promisedAtStart}, ${busyAtStart} threads busy, ${hits} hit(s), ${h.status()}`);
    if (promisedAtStart) promised++;
    if (promisedAtStart && hits > 0) broken++;
  }
  check('THREAD+: with three threads busy through the correction, every start the countdown still promised dodges',
    broken === 0 && promised > 0 && rows.every((row) => row.includes('3 threads busy')), rows.join(' | '));
}

finish();
