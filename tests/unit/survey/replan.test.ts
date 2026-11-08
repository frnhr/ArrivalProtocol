// Slice 6 review fixes (docs/phase3/impl/slice-6-review.md, Tests gap 3): AUTODROP v3's plan and MOTH's RUN THE DROPS re-plan
// after SURVEY moves an LZ, flown by the real systems on run 1's arm (seed 7) with both gates raised for the suite (support/
// survey withSurveyBuilt). The unit is beamed ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT (slot 15: LZ-A 5 · LZ-B 4,
// LZ-B's guess ROCKY; SITE 5 WIDE FLAT ROOM 6) by the save fixture's sends, with MOTH written into CORMORANT's reservation (a
// sleeping resident, as the map rolls one in layers 3–7). Ship and instrument files healed, the beam's seeds freed, SURVEY v1
// aboard with the rim mapped (every site found), then a constructed lock (landing/harness-landing lockOn).
// Both fly autodrop-plan.ts planLanding, whose memo key carries sitesRev (R13); this pins the behaviour, not the key:
// • AUTODROP v3 armed by [G] (landing-kid): between windows, with a pod down, LZ-B moves to SITE 5; the plan's LZ-B rows then
//   lie in LZ-B's windows over SITE 5 (none of the old ones), and every LZ-B pod comes down in SITE 5, in the LZ, soft.
// • MOTH's RUN THE DROPS (the 'resident' controller, AUTODROP v1 aboard and shadowed): the same move, the same re-plan, every
//   pod launched by MOTH, every LZ-B pod on SITE 5.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { PlanRow } from '@systems/autodrop-plan';
import { createHarness7 } from '../wp7/harness7';
import { withSurveyBuilt } from '../support/survey';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk } from '../save/save-fixture';
import { setLandingMode } from '../support/landing-instant';
import { lockOn } from '../landing/harness-landing';
import { restoreState } from '../wp1-rules/flows';
import { giveSkillFile } from '../support/skills';
import { landingKid } from '../skills/landing-kid';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { assignSite, mapNow } from '@systems/survey';
import { assignRefusal } from '@systems/survey-model';
import { planLanding, windowsAhead } from '@systems/autodrop-plan';
import { getDropSolution } from '@systems/drop-cache';
import { activeLandingController } from '@systems/landing-controller';
import { angleDelta } from '@systems/landing-solve';
import { wakeSleeperNow, pickSleeperJob } from '@systems/resident-sleeper';
import { DRIVER_RULES } from '@data/script';
import { AUTODROP_PLAN_MAX_PASSES } from '@data/tuning';

const SEED = 7;
const ROUTE = [2, 5, 11, 15];
const CORMORANT = 15;
const h = createHarness7(SEED);
const kid = landingKid(h);
const s = (): Readonly<GameState> => h.store.getState();
setLandingMode('manual');

const QUIET = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];
const site5 = (): Readonly<GameState['landing']['survey']['sites'][number]> =>
  s().landing.survey.sites.find((site) => site.kind === 'candidate' && site.number === 5)!;
const lzBRows = (): PlanRow[] => planLanding(s(), kid.viewNow()).rows.filter((row) => row.lz === 'LZ-B');
// Every LZ-B row lies inside one of LZ-B's windows as the drop solution solves them now.
const rowsInLzBWindows = (rows: readonly PlanRow[]): boolean => {
  const wins = windowsAhead(getDropSolution()!, s().clock.tSec, AUTODROP_PLAN_MAX_PASSES).filter((win) => win.lz === 'LZ-B');
  return rows.length > 0 && rows.every((row) => wins.some((win) => row.atTSec >= win.open - 1e-6 && row.atTSec <= win.close + 1e-6));
};
// The moment to move LZ-B: a pod down, none falling, no window open, and the move allowed.
const moveMoment = (): boolean => s().landing.pods.some((record) => record.fate.kind === 'down')
  && !s().landing.pods.some((record) => record.fate.kind === 'falling') && s().landing.window === null
  && assignRefusal(s(), 'LZ-B', site5().id) === null;
const lzBDown = (): { soft: boolean; inSite: boolean; place: string }[] => s().landing.pods.flatMap((record) => {
  if (record.fate.kind !== 'down' || record.fate.touchdown.lz !== 'LZ-B') return [];
  const site = site5();
  return [{
    soft: record.fate.touchdown.touch === 'soft', place: record.fate.touchdown.place,
    inSite: Math.abs(angleDelta(record.fate.launch.landingRad, site.centreRad)) <= site.halfWidthRad,
  }];
});

let start: GameState | null = null;

// Moves LZ-B at the first moment allowed while `fly` flies the landing; returns what the plan said about LZ-B before and after.
function flyWithMove(fly: (each: () => void) => void): {
  before: PlanRow[]; after: PlanRow[]; moved: string | null; afterInNew: boolean; controller: string | null;
} {
  let controller: string | null = null;
  let before: PlanRow[] = [];
  let after: PlanRow[] = [];
  let moved: string | null = null;
  let afterInNew = false;
  fly(() => {
    if (moved !== null || !moveMoment() || getDropSolution() === null) return;
    before = lzBRows();
    controller = activeLandingController(s())?.source ?? null;
    moved = String(assignSite(h.store, 'LZ-B', site5().id));
    after = lzBRows();
    afterInNew = rowsInLzBWindows(after);
  });
  return { before, after, moved, afterInNew, controller };
}

withSurveyBuilt(() => {
  const storage = stubStorage();
  pageOpen(h.store, storage, SEED);
  receiveToReport(h.store);
  ROUTE.forEach((slot, i) => {
    if (slot === CORMORANT) {
      h.store.update((draft) => { draft.run.map.arm[CORMORANT]!.reserved.resident = { kind: 'sleeping', shown: 'unknown', name: 'MOTH' }; });
    }
    beamTo(h.store, slot);
    if (i < ROUTE.length - 1) toDesk(h.store);
  });
  h.stepUntil(() => s().run.phase === 'flight', 60);
  h.store.update((draft) => {
    for (const seg of draft.memory) {
      if ((seg.type === 'ship' || seg.type === 'tool' || seg.type === 'core' || seg.type === 'driver') && 'integrity' in seg) seg.integrity = 100;
    }
    draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(draft.memory);
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...QUIET);
    draft.ui.memoryRev++;
  });
  giveSkillFile(h.store, 'survey', 1);
  h.step();
  mapNow(h.store, 100);
  h.step();
  check('CORMORANT with MOTH asleep aboard, SURVEY v1 with the rim mapped: SITE 5 found, LZ-B on its ROCKY guess',
    s().resident.def?.kind === 'sleeping' && site5().found && s().landing.lzs.find((lz) => lz.label === 'LZ-B')!.site === 'guess-B',
    JSON.stringify(s().resident.def));
  start = structuredClone(s());

  // --- AUTODROP v3: the kid's plan -----------------------------------------------------------------------------------------
  {
    restoreState(h, start);
    giveSkillFile(h.store, 'autodrop', 3);
    lockOn(h);
    const { before, after, moved, afterInNew } = flyWithMove((each) => { kid.obey(1500, { each }); });
    const beforeTimes = new Set(before.map((row) => Math.round(row.atTSec)));
    check(`AUTODROP v3 armed (${s().landing.autodrop.armed ?? 'ended'}): LZ-B moved to SITE 5 between windows (${moved}); its plan rows re-plan into LZ-B's new windows, none at an old time`,
      moved === 'null' && before.length > 0 && afterInNew && after.every((row) => !beforeTimes.has(Math.round(row.atTSec))),
      `${before.map((row) => row.atTSec.toFixed(0)).join(',')} → ${after.map((row) => row.atTSec.toFixed(0)).join(',')}`);
    const down = lzBDown();
    check(`…every LZ-B pod (${down.length}) comes down in SITE 5, in the LZ, soft`,
      down.length === 4 && down.every((pod) => pod.inSite && pod.soft && pod.place === 'lz'), JSON.stringify(down));
  }

  // --- MOTH's RUN THE DROPS ---------------------------------------------------------------------------------------------------
  {
    restoreState(h, start);
    giveSkillFile(h.store, 'autodrop', 1);
    wakeSleeperNow(h.store);
    pickSleeperJob(h.store, 'drops');
    lockOn(h);
    h.step();
    const sources = new Set<string>();
    const launchedFrom = kid.launches.length;
    const { before, after, moved, afterInNew, controller } = flyWithMove((each) => {
      h.stepUntil(() => {
        each();
        return s().landing.ended !== null || s().landing.pods.every((record) => record.fate.kind !== 'aboard' && record.fate.kind !== 'falling');
      }, 900);
    });
    for (const launch of kid.launches.slice(launchedFrom)) sources.add(launch.source);
    check(`MOTH runs the drops (the 'resident' controller): LZ-B moved to SITE 5 between windows (${moved}); the plan re-plans into LZ-B's new windows`,
      controller === 'resident' && moved === 'null', String(controller));
    check('…the rows MOTH flies name LZ-B\'s windows over SITE 5, none at an old time',
      moved === 'null' && before.length > 0 && afterInNew && after.every((row) => !before.some((old) => Math.round(old.atTSec) === Math.round(row.atTSec))),
      `${before.map((row) => row.atTSec.toFixed(0)).join(',')} → ${after.map((row) => row.atTSec.toFixed(0)).join(',')}`);
    const down = lzBDown();
    check(`…every pod launched by MOTH (${[...sources].join()}), every LZ-B pod (${down.length}) down in SITE 5, in the LZ, soft`,
      sources.size === 1 && sources.has('resident') && down.length === 4 && down.every((pod) => pod.inSite && pod.soft && pod.place === 'lz'),
      JSON.stringify(down));
  }
});

finish();
