// BALANCE_ONLY: POOR ships × seeds 1–10 × SURVEY none/v1/v2/v3 (and each ship played GOOD), flown by the strip; information until slice 8
// Slice 6 Track SWATH (docs/phase3/impl/slice-6-plan.md §7.3, review m6): every POOR ship of run 1's arm on seeds 1–10 (not a
// final ship: those are GOOD), reached by its shortest route from ARES-VII (the save fixture's sends: no flight before it), its
// ship, instrument and driver files healed and the beam's seeds freed, so the number is the site's, not the arrival damage's.
// Each ship is flown five times from its first flight tick: played GOOD (POOR not built: CONTROL's LZs as rolled, sound), and
// POOR with no SURVEY, v1, v2 and v3. The kid flies the capture by the strip (wp2 followDirector, with the WP7 defender) and
// lands by the strip (landing/harness-landing followLanding: [L] at the windows, [F] to the next); with SURVEY it also moves
// LZs, every tick:
// • v1 (it rates no ground): an LZ still on a NARROW guess, or on a guess its rough tell reads `ROUGH ?` (slice 8, OPEN-DECISIONS
//   53), goes to the widest found candidate with ROOM it may take;
// • v2, v3: an LZ on a ground it knows is bad goes to survey-model bestSwap (the strip's swap).
// It reports per ship and in all: Q (points over the colonists aboard: the cycles' LANDED steps) and landed % (in an LZ with
// room) against the same ship played GOOD, the pods down hard, the cycles; the mapped % at the capture by version, and FUEL at
// ORBIT LOCK with and without the thread. Review m6's counts, by version: HOLLOW's verb moments skipped while SURVEY held its
// thread with every thread busy (verbs are the final ship's only, and the final ship is GOOD, so this is 0 by construction),
// and the AI seconds a corrupted resident's due lock waited for a thread SURVEY held; and R16's SURVEY/SENTRY ties: desks on
// these routes where both branches were due, SURVEY took the visit and SENTRY waited one desk.
// The checks are information (OPEN-DECISIONS 33 and 37 take the numbers), except that every flight reaches its report.
// Slice 8 Step 0 (slice-8-plan §2.1, OD 54): SURVEY_SWEEP_KID=busy flies seed 7's POOR CORMORANT (slot 15) on the worked
// route, where HOLLOW boards: the beam's seeds are not freed and HOLLOW stays as it boarded, and the kid defends with the
// WP11 defender (harness11 defend11: it SCANs and DELETEs seeds, REPAIRs bites, MOVEs souls), so SURVEY's thread matters.
// Per version it prints the pods landed, the first swap's moment (before ORBIT LOCK or in the landing), the AI s the kid
// waited for a thread (every thread busy while it had a seed or a bite to answer) and SURVEY's own thread-s. BALANCE_JSON
// writes §2.1's rows: v1's share of the none→GOOD point gap, v2's and v3's points against GOOD, v1's cycles per POOR ship
// over none, v3's mapped share at ORBIT LOCK; busy: v3's pods over v2's.
import { check, finish } from '../landing/checks';
import { writeMetrics } from '../support/balance-out';
import { createHarness11, type Harness11 } from '../wp11/harness11';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { threateningSeeds } from '@systems/hollow';
import { isInfected } from '@state/selectors';
import type { GameState } from '@state/schema';
import type { SkillVersion } from '@/types/skill';
import type { RunMapState } from '@/types/map';
import { createHarness7 } from '../wp7/harness7';
import { followDirector } from '../wp2/harness2';
import { withSurvey } from '../support/survey';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk } from '../save/save-fixture';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';
import { restoreState } from '../wp1-rules/flows';
import { giveSkillFile } from '../support/skills';
import { run1Map } from '../map/run1-fixture';
import { mappedPct } from '@state/survey-selectors';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { canStartOp, holdsThread } from '@systems/ops-core';
import { assignSite, SURVEY_THREAD_OWNER } from '@systems/survey';
import { assignRefusal, bestSwap, knownBad, guessTell } from '@systems/survey-model';
import { branchToLatch } from '@systems/skill-tree';
import { visitNow } from '@systems/skill-levels';
import { reachable } from '@systems/map-hop';
import { shipDefAt } from '@systems/map-run';
import { landingResult } from '@systems/landing-rules';
import { endLanding } from '@systems/landing';
import { shipCycles } from '@systems/run-score';

const KID = process.env.SURVEY_SWEEP_KID ?? 'strip';
if (KID !== 'strip' && KID !== 'busy') throw new Error(`SURVEY_SWEEP_KID=${KID} is neither strip nor busy`);
const BUSY = KID === 'busy';
// The busy kid: seed 7's CORMORANT on the worked route (slice-8-plan §2.1), unless SURVEY_SWEEP_SEEDS names more.
const BUSY_SLOT = 15;
const SEEDS = BUSY && process.env.SURVEY_SWEEP_SEEDS === undefined ? [7]
  : Array.from({ length: Number(process.env.SURVEY_SWEEP_SEEDS ?? 10) }, (_, i) => i + 1);
// SURVEY_SWEEP_SLOT: one slot only (a ship looked at by itself).
const ONLY_SLOT = BUSY ? BUSY_SLOT : process.env.SURVEY_SWEEP_SLOT === undefined ? null : Number(process.env.SURVEY_SWEEP_SLOT);
const h = BUSY ? createHarness11(1) : createHarness7(1);
const defendNow = (): void => { if (BUSY) (h as Harness11).defend11(); else h.defend(); };
const s = (): Readonly<GameState> => h.store.getState();
setLandingMode('manual');

type Policy = 'good' | 'none' | 1 | 2 | 3;
const POLICIES: readonly Policy[] = ['good', 'none', 1, 2, 3];
interface Row {
  seed: number; slot: number; name: string; policy: Policy; bad: string;
  report: boolean; q: number; landedPct: number; hard: number; cycles: number;
  atCapture: number; fuelAtLock: number; moves: number; reveal: string;
  verbSkips: number; lockWaitSec: number;
  // Slice 8: mapped % at ORBIT LOCK; pods landed in an LZ with room; the first swap's moment; the kid's thread waits and
  // SURVEY's own thread-s (AI s).
  atLock: number; pods: number; swapAt: 'lock' | 'landing' | null; kidWaitSec: number; surveyThreadSec: number;
}

// The shortest route from ARES-VII (slot 0) to `slot`, through ships that are not final; null when none reaches it.
function routeTo(map: Readonly<RunMapState>, slot: number): number[] | null {
  const prev = new Map<number, number>([[0, -1]]);
  const queue = [0];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === slot) break;
    if (at !== 0 && shipDefAt(map, at).final) continue;
    for (const ship of map.arm) {
      if (prev.has(ship.slot) || !reachable(map, at, ship.slot)) continue;
      prev.set(ship.slot, at);
      queue.push(ship.slot);
    }
  }
  if (!prev.has(slot)) return null;
  const route: number[] = [];
  for (let at = slot; at !== -1; at = prev.get(at)!) route.unshift(at);
  return route;
}

const ties = new Set<string>();
const tieDesks = new Set<string>();

// The unit beamed along `route` (from ARES-VII's report) with POOR played or not, the boot played to the first flight tick,
// then healed and its seeds freed. At each desk on the way (POOR played), R16's tie is looked for. null: it never flew.
function arrive(seed: number, route: readonly number[], poor: boolean): GameState | null {
  return withSurvey({ poor }, () => {
    pageOpen(h.store, stubStorage(), seed);
    receiveToReport(h.store);
    for (let i = 1; i < route.length; i++) {
      beamTo(h.store, route[i]!);
      if (i < route.length - 1) {
        toDesk(h.store);
        if (poor) lookForTie(seed, route.slice(0, i + 1));
      }
    }
    h.stepUntil(() => s().run.phase === 'flight', 60);
    if (s().run.phase !== 'flight') return null;
    h.store.update((draft) => {
      for (const seg of draft.memory) {
        if ((seg.type === 'ship' || seg.type === 'tool' || seg.type === 'core' || seg.type === 'driver') && 'integrity' in seg) seg.integrity = 100;
      }
      if (!BUSY) {
        draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' ? freeSegment(seg.size) : seg));
        mergeAdjacentFree(draft.memory);
        if (draft.hollow.phase !== 'awake') draft.hollow.phase = 'dormant';
      }
      draft.ui.memoryRev++;
    });
    h.step();
    return structuredClone(s());
  });
}

// At this desk SURVEY latched the visit while SENTRY was due too (with SURVEY not built, SENTRY would have opened here).
function lookForTie(seed: number, prefix: readonly number[]): void {
  const key = `${seed}:${prefix.join('-')}`;
  if (tieDesks.has(key)) return;
  tieDesks.add(key);
  const state = s();
  const visit = visitNow(state.run);
  const latched = state.run.skills.opened.find((entry) => entry.visit === visit);
  if (latched?.skill !== 'survey' || state.run.skills.opened.some((entry) => entry.skill === 'sentry')) return;
  const without: GameState = structuredClone(state);
  without.run.skills.opened = without.run.skills.opened.filter((entry) => entry.visit !== visit);
  if (withSurvey({ built: 0 }, () => branchToLatch(without, visit)) === 'sentry') ties.add(`seed ${seed} visit ${visit} (${prefix.join('→')})`);
}

// The kid's move policy for SURVEY at `version` (the header), every tick.
function moveLzs(version: SkillVersion): void {
  const state = s();
  if (state.landing.survey.site !== 'poor') return;
  for (const lz of state.landing.lzs) {
    if (version >= 2) {
      if (!knownBad(state, lz.label)) continue;
      const to = bestSwap(state, lz.label);
      if (to !== null) assignSite(h.store, lz.label, to);
      continue;
    }
    const on = state.landing.survey.sites.find((site) => site.id === lz.site);
    if (on?.kind !== 'guess') continue;
    // Slice 8 (OPEN-DECISIONS 53): a guess v1's rough tell reads `ROUGH ?` goes to the widest found candidate, blind, NARROW
    // too (a NARROW site is likelier FLAT than a guess known rough); a NARROW guess as before.
    const rough = guessTell(state, on) === 'rough';
    if (!rough && on.width !== 'narrow') continue;
    const to = state.landing.survey.sites
      .filter((site) => site.kind === 'candidate' && site.found && (rough || site.width !== 'narrow') && assignRefusal(state, lz.label, site.id) === null)
      .sort((a, b) => b.halfWidthRad - a.halfWidthRad || b.roomPods - a.roomPods)[0];
    if (to !== undefined) assignSite(h.store, lz.label, to.id);
  }
}

function fly(start: GameState, seed: number, policy: Policy): Row {
  restoreState(h, start);
  const version: SkillVersion | null = typeof policy === 'number' ? policy : null;
  if (version !== null) giveSkillFile(h.store, 'survey', version);
  const bad = s().landing.survey.sites.filter((site) => site.kind === 'guess' && site.ground !== 'flat')
    .map((site) => `LZ-${String.fromCharCode(65 + site.number)} ${site.ground.toUpperCase()}`).join(' ') || '-';
  let atCapture = -1;
  let verbSkips = 0;
  let lockWaitSec = 0;
  let moments = s().hollow.verbMoments;
  let aiAt = s().clock.aiSec;
  let swapAt: Row['swapAt'] = null;
  let kidWaitSec = 0;
  let surveyThreadSec = 0;
  const movesAtStart = s().landing.survey.moves.length;
  const each = (): void => {
    const state = s();
    const dtAi = state.clock.aiSec - aiAt;
    if (swapAt === null && state.landing.survey.moves.length > movesAtStart) swapAt = state.run.phase === 'flight' ? 'lock' : 'landing';
    if (holdsThread(SURVEY_THREAD_OWNER)) surveyThreadSec += dtAi;
    if (!canStartOp() && (threateningSeeds(state.memory, state.clock.aiSec).length > 0 || state.memory.some(isInfected))) kidWaitSec += dtAi;
    if (atCapture < 0) {
      const { x, y, vx, vy } = state.orbit;
      if ((vx * vx + vy * vy) / 2 - state.level.planet.mu / Math.hypot(x, y) < 0) atCapture = mappedPct(state.landing.survey);
    }
    const holding = holdsThread(SURVEY_THREAD_OWNER);
    if (state.hollow.verbMoments > moments && state.hollow.verb === null && holding && !canStartOp()) verbSkips++;
    moments = state.hollow.verbMoments;
    const corrupted = state.resident.corrupted;
    if (corrupted !== null && corrupted.phase === 'awake' && corrupted.lock === null && corrupted.lockInSec !== null && corrupted.lockInSec <= 0
      && holding && !canStartOp()) lockWaitSec += state.clock.aiSec - aiAt;
    aiAt = state.clock.aiSec;
    if (version !== null) moveLzs(version);
  };
  followDirector(h, { reactionSec: 0.4, maxWall: 900, mistake: () => { each(); defendNow(); return false; } });
  const fuelAtLock = s().burn.fuelPct;
  const atLock = mappedPct(s().landing.survey);
  if (s().run.phase === 'landing') followLanding(h, { maxWall: 900, onTick: () => { each(); defendNow(); } });
  // A pod a resident locks for good keeps the landing open (no strip row asks for END LANDING then): the kid ends it.
  if (s().run.phase === 'landing' && s().landing.ended === null) endLanding(h.store);
  h.stepUntil(() => s().run.phase !== 'landing', 120);
  const report = s().run.phase === 'report';
  const tally = landingResult(s(), s().burn.status === 'accepted' ? 'partial' : 'locked');
  const hard = s().landing.pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.touch === 'hard').length;
  const q = tally.colonistsAboard > 0 ? tally.points / tally.colonistsAboard : 0;
  const cycles = report ? (() => { const earn = shipCycles({ slot: 0, points: tally.points, colonistsAboard: tally.colonistsAboard }); return earn.arrived + earn.landed; })() : 0;
  const reveal = s().landing.survey.reveals.map((one) => one.by).join(',') || '-';
  return {
    seed, slot: 0, name: '', policy, bad, report, q, landedPct: tally.colonistsAboard > 0 ? (100 * tally.landedInLz) / tally.colonistsAboard : 0,
    hard, cycles, atCapture, fuelAtLock, moves: s().landing.survey.moves.length, reveal, verbSkips, lockWaitSec,
    atLock, pods: tally.landedInLz / 200, swapAt, kidWaitSec, surveyThreadSec,
  };
}

const rows: Row[] = [];
const skipped: string[] = [];
for (const seed of SEEDS) {
  const map = run1Map(seed);
  for (const ship of map.arm) {
    if (ship.reserved.site !== 'poor' || shipDefAt(map, ship.slot).final) continue;
    if (ONLY_SLOT !== null && ship.slot !== ONLY_SLOT) continue;
    const route = BUSY ? WORKED_ROUTE.slice(0, WORKED_ROUTE.indexOf(BUSY_SLOT) + 1) : routeTo(map, ship.slot);
    if (route === null) { skipped.push(`seed ${seed} ${ship.name}: no route`); continue; }
    const good = arrive(seed, route, false);
    const poor = arrive(seed, route, true);
    if (good === null || poor === null) { skipped.push(`seed ${seed} ${ship.name}: never flew`); continue; }
    for (const policy of POLICIES) {
      const row = fly(policy === 'good' ? good : poor, seed, policy);
      rows.push({ ...row, slot: ship.slot, name: ship.name });
    }
    const mine = rows.slice(-POLICIES.length);
    const base = mine[0]!;
    console.log(`  seed ${String(seed).padStart(2)} ${String(ship.slot).padStart(2)} ${ship.name.padEnd(10)} ${String(poor.landing.pods.length).padStart(2)} pods `
      + `${poor.landing.lzs.length} LZ, bad ${base === undefined ? '' : mine[1]!.bad.padEnd(10)} │ `
      + mine.map((row) => `${String(row.policy).padStart(4)} Q ${(100 * row.q).toFixed(0).padStart(3)}% L ${row.landedPct.toFixed(0).padStart(3)}% `
        + `h${row.hard} c${row.cycles}${row.moves > 0 ? ` m${row.moves}` : ''}${row.reveal !== '-' ? ` r:${row.reveal}` : ''}`).join(' │ '));
  }
}

const by = (policy: Policy): Row[] => rows.filter((row) => row.policy === policy);
const mean = (values: readonly number[]): number => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const ships = by('good').length;
check(`${ships} POOR ships on seeds ${SEEDS[0]}–${SEEDS.at(-1)} flown five ways, every flight reaching its LANDING REPORT`,
  ships > 0 && rows.every((row) => row.report), rows.filter((row) => !row.report).map((row) => `${row.seed}/${row.name}/${row.policy}`).join(' '));
if (skipped.length > 0) console.log(`  skipped: ${skipped.join(' | ')}`);
const goodQ = new Map(by('good').map((row) => [`${row.seed}:${row.slot}`, row.q]));
const goodL = new Map(by('good').map((row) => [`${row.seed}:${row.slot}`, row.landedPct]));
for (const policy of POLICIES) {
  const mine = by(policy);
  const dq = mean(mine.map((row) => 100 * (row.q - goodQ.get(`${row.seed}:${row.slot}`)!)));
  const dl = mean(mine.map((row) => row.landedPct - goodL.get(`${row.seed}:${row.slot}`)!));
  const capture = mine.filter((row) => row.atCapture >= 0).map((row) => row.atCapture);
  check(`${String(policy).padEnd(4)}: Q ${(100 * mean(mine.map((row) => row.q))).toFixed(1)}% (${dq >= 0 ? '+' : ''}${dq.toFixed(1)} pts against GOOD), `
    + `landed ${mean(mine.map((row) => row.landedPct)).toFixed(1)}% (${dl >= 0 ? '+' : ''}${dl.toFixed(1)}), hard ${mean(mine.map((row) => row.hard)).toFixed(2)} pods, `
    + `cycles ${mean(mine.map((row) => row.cycles)).toFixed(2)}, FUEL at lock ${mean(mine.map((row) => row.fuelAtLock)).toFixed(1)}%`
    + (typeof policy === 'number' ? `, mapped at the capture ${Math.min(...capture)}–${Math.max(...capture)}% (mean ${mean(capture).toFixed(0)}), `
      + `${mine.filter((row) => row.moves > 0).length} ships moved an LZ` : '')
    + (policy === 'none' ? `, ${mine.filter((row) => row.reveal.includes('touchdown')).length} bad guesses shown by a touchdown` : '')
    + `; m6: ${mine.reduce((sum, row) => sum + row.verbSkips, 0)} verb moments skipped, ${mine.reduce((sum, row) => sum + row.lockWaitSec, 0).toFixed(1)} AI s of lock waits`,
  mine.length === ships);
}
check(`R16: ${ties.size} SURVEY/SENTRY ties at the ${tieDesks.size} desks of these routes (SENTRY a desk later)${ties.size > 0 ? `: ${[...ties].join(' | ')}` : ''}`, true);

// Slice 8 Step 0: per version, the busy kid's numbers (printed in either mode), and §2.1's rows for the balance report.
const dqOf = (policy: Policy): number => mean(by(policy).map((row) => 100 * (row.q - goodQ.get(`${row.seed}:${row.slot}`)!)));
const podsOf = (policy: Policy): number => mean(by(policy).map((row) => row.pods));
for (const policy of POLICIES) {
  const mine = by(policy);
  console.log(`INFO  ${KID} ${String(policy).padEnd(4)}: pods landed ${podsOf(policy).toFixed(2)}, first swap ${mine.map((row) => row.swapAt ?? '—').join(',')}, `
    + `kid waited ${mean(mine.map((row) => row.kidWaitSec)).toFixed(1)} AI s for a thread, SURVEY held one ${mean(mine.map((row) => row.surveyThreadSec)).toFixed(1)} AI s, `
    + `mapped at ORBIT LOCK ${mean(mine.map((row) => row.atLock)).toFixed(0)}%`);
}
if (BUSY) {
  writeMetrics('survey-sweep busy', {
    'survey.busy.Δpods.v3': podsOf(3) - podsOf(2),
    ...Object.fromEntries(([1, 2, 3] as const).map((v) => [`survey.busy.pods.v${v}`, podsOf(v)])),
    'survey.busy.preLock.v3': mean(by(3).map((row) => (row.swapAt === 'lock' ? 100 : 0))),
    'survey.busy.kidWait.v3': mean(by(3).map((row) => row.kidWaitSec)),
  }, { seeds: SEEDS.join(','), slot: BUSY_SLOT });
} else {
  const cyclesOf = (policy: Policy): number => mean(by(policy).map((row) => row.cycles));
  writeMetrics('survey-sweep', {
    'survey.gap.v1': dqOf('none') === 0 ? null : (100 * (dqOf(1) - dqOf('none'))) / -dqOf('none'),
    'survey.dq.none': dqOf('none'), 'survey.dq.v1': dqOf(1), 'survey.dq.v2': dqOf(2), 'survey.dq.v3': dqOf(3),
    'worth.survey.v1': cyclesOf(1) - cyclesOf('none'),
    'survey.mappedAtLock.v3': mean(by(3).map((row) => row.atLock)),
  }, { seeds: SEEDS.length, ships });
}
finish();
