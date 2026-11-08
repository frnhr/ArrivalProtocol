// Slice 7b, Track VIEW (docs/phase3/impl/slice-7-plan.md §5.2, R29): THE LAST LANDING's view models on hand-built states.
// VIEW paints state; DROP's machine is not needed here, so every `landing.lastLanding` below is set by hand.
// • the header strip (lastLandingHeader): keyed on the machine, not on the FINALE's phase (7b foundation deviation 9); the
//   pods left (falling counts as left), the flier's words, the hint;
// • the POD BAY's RESTORED row (podBayRestoredRow): the count, the radio note, a pip per pod in pod order;
// • the report's RESTORED BY MERGE row (restoredReportRow): pods, not colonists; each pod's own icon, in the text's order;
//   the credits' ` (restored)` (restoredCreditTag); and both through landingReportModel's hooks;
// • fail loudly: a restored pod gone from the orbit mid-machine, or one with no final fate in the report, throws.
// ARES-VII from a constructed lock (harness-landing lockOn: no capture flown), the instant landing off. About a second.
import { check, finish } from '../landing/checks';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { createHarness6 } from '../wp6/harness6';
import type { LastLandingState } from '@/types/ending';
import type { LandingTally, PodFate, PodSummary } from '@/types/landing';
import { forceLandAll } from '@systems/landing';
import { landingReportModel } from '@systems/landing-report';
import { restoredDriver } from '@systems/ending-rules';
import { lastLandingHeader, podBayRestoredRow, restoredReportRow, restoredCreditTag } from '@systems/last-landing-hud';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import { LANDING_REPORT_TEXT } from '@data/landing-text';
import { COLONISTS_PER_POD, MERGE_DRIVER_INTEGRITY } from '@data/tuning';

const threw = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

setLandingMode('manual');
const h = createHarness6(1, { soulsFound: true });
h.noFault();
lockOn(h);
const state = (): ReturnType<typeof h.store.getState> => h.store.getState();
const pods = state().landing.pods.map((record) => record.pod);
check(`ARES-VII in its landing: three pods, all of them for THE LAST LANDING (${pods.length})`, state().run.phase === 'landing' && pods.length === 3);
const [p1, p2, p3] = pods as [number, number, number];
const restored = [p1, p2, p3];

// A fate by hand: the models read only `kind` of a falling or down pod (a launch record stands in).
const fake = (kind: 'aboard' | 'falling' | 'down' | 'parked' | 'not-launched'): PodFate => (kind === 'aboard' || kind === 'not-launched'
  ? { kind } : kind === 'parked' ? { kind, why: 'eaten', restorable: true } as PodFate : { kind } as unknown as PodFate);
const machine = (flier: LastLandingState['flier']): LastLandingState => ({
  pods: [...restored],
  drivers: restored.map((pod) => restoredDriver(state().landing.pods.find((record) => record.pod === pod)!)),
  flier, orbitsFlown: 0, cadenceLeftSec: 0, skipped: false,
});
const stage = (flier: LastLandingState['flier'] | null, fates: Partial<Record<number, PodFate['kind']>>): void => {
  h.store.update((draft) => {
    draft.landing.lastLanding = flier === null ? null : machine(flier);
    for (const record of draft.landing.pods) {
      const kind = fates[record.pod];
      if (kind !== undefined) record.fate = fake(kind);
    }
  });
};

// --- No machine: nothing paints, even in the FINALE's 'last-landing' phase (7a's interim) ---------------------------------
{
  h.store.update((draft) => { draft.hollow.finale.phase = 'last-landing'; });
  check('no machine: no header and no POD BAY row, even while the FINALE is in \'last-landing\' (7a\'s interim, deviation 9)',
    lastLandingHeader(state()) === null && podBayRestoredRow(state()) === null);
  h.store.update((draft) => { draft.hollow.finale.phase = 'none'; });
}

// --- The header strip and the POD BAY row ----------------------------------------------------------------------------------
{
  stage('v3', { [p1]: 'aboard', [p2]: 'falling', [p3]: 'down' });
  const header = lastLandingHeader(state());
  check('the header: THE LAST LANDING, 2 of 3 left (a falling pod is not down yet), AUTODROP v3\'s words, the [ENTER] hint',
    header !== null && header.title === 'THE LAST LANDING' && header.left === 2 && header.count === 3
    && header.status === '2 OF 3 PODS TO LAND' && header.flier === LAST_LANDING_TEXT.flier.v3 && header.hint === '[ENTER] SKIP TO THE END',
    JSON.stringify(header));
  const row = podBayRestoredRow(state());
  check('the POD BAY row: RESTORED 3 (every restored pod, down ones too), by radio at MERGE\'s integrity, a pip per pod in pod order',
    row !== null && row.count === 3 && row.text === 'RESTORED 3' && row.note === `DRIVERS BY RADIO · ${MERGE_DRIVER_INTEGRITY}%`
    && row.pips.join() === 'waiting,falling,down', JSON.stringify(row));
  for (const flier of ['v1', 'v2', 'blind'] as const) {
    stage(flier, {});
    check(`…the flier's words follow the machine: ${flier}`, lastLandingHeader(state())?.flier === LAST_LANDING_TEXT.flier[flier]);
  }
  stage('blind', { [p1]: 'down', [p2]: 'down', [p3]: 'parked' });
  check('a pod parked at the machine\'s end still rides the orbit: 1 of 3 left, its pip waiting',
    lastLandingHeader(state())?.status === '1 OF 3 PODS TO LAND' && podBayRestoredRow(state())?.pips.join() === 'down,down,waiting');
  stage('blind', { [p3]: 'down' });
  const done = lastLandingHeader(state());
  check('all down: ALL 3 DOWN, none left', done?.left === 0 && done.status === 'ALL 3 DOWN');
  stage('blind', { [p3]: 'not-launched' });
  check('a restored pod that left the orbit mid-machine is a bug: the models throw',
    /left the orbit/.test(threw(() => lastLandingHeader(state()))) && /left the orbit/.test(threw(() => podBayRestoredRow(state()))));
  stage(null, { [p1]: 'aboard', [p2]: 'aboard', [p3]: 'aboard' });
  check('the machine cleared: the strip and the row are gone', lastLandingHeader(state()) === null && podBayRestoredRow(state()) === null);
}

// --- The report's row and the credits, on a hand-built tally ---------------------------------------------------------------
{
  const summary = (pod: number, over: Partial<PodSummary>): PodSummary => ({
    pod, family: 'okafor', colonists: COLONISTS_PER_POD, fate: 'down', place: 'lz', lz: 'LZ-A', touch: 'soft', points: 200,
    parkedWhy: null, restored: true, featured: [], ...over,
  });
  const tally = (list: PodSummary[]): LandingTally => ({
    colonistsAboard: list.length * COLONISTS_PER_POD, lzs: [], offSite: 0, noGo: 0,
    restored: list.filter((pod) => pod.restored).length * COLONISTS_PER_POD, parked: [], notLaunched: 0, landedInLz: 0, points: 0,
    colony: null, pods: list,
  });
  const list = [
    summary(1, { place: 'off-site', lz: null }), summary(2, { touch: 'hard' }), summary(3, {}), summary(4, { place: 'no-go', lz: null }),
    summary(5, { place: 'mislanded' }), summary(6, { restored: false }), summary(7, { fate: 'parked', place: null, lz: null, touch: null }),
  ];
  const row = restoredReportRow(tally(list));
  check('the report row counts pods (6 restored, 1,200 colonists), LANDED in an LZ with room (soft and hard), a 0 part left out',
    row?.text === '6 RESTORED · 2 LANDED · 1 MISLANDED · 1 OFF-SITE · 1 NO-GO', row?.text);
  check('…its icons are each restored pod\'s own outcome, in the text\'s order (the parked one last), the others\' left out',
    row?.icons.join() === 'soft,hard,mislanded,off-site,no-go,parked', row?.icons.join());
  check('…01 §3.17\'s example reads as written', restoredReportRow(tally([
    summary(1, {}), summary(2, {}), summary(3, { touch: 'hard' }), summary(4, { place: 'off-site', lz: null }),
  ]))?.text === '4 RESTORED · 3 LANDED · 1 OFF-SITE');
  check('no restored pod: no row model (the report draws 7a\'s row)', restoredReportRow(tally([summary(1, { restored: false })])) === null);
  check('a restored pod with no final fate in the report is a bug: it throws',
    /no place in the report/.test(threw(() => restoredReportRow(tally([summary(1, { fate: 'aboard' })])))));
  check('the credit tag: ` (restored)` for a restored pod, nothing for the others',
    restoredCreditTag(summary(1, {})) === ' (restored)' && restoredCreditTag(summary(1, { restored: false })) === '');
}

// --- Through the report's hooks (landing-report.ts): a landed ship with two pods MERGE gave back ---------------------------
{
  forceLandAll(h.store);
  const down = state().landing.pods.filter((record) => record.fate.kind === 'down').map((record) => record.pod);
  const [r1, r2] = down as [number, number];
  h.store.update((draft) => {
    for (const record of draft.landing.pods) if (record.pod === r1 || record.pod === r2) record.restored = true;
  });
  const model = landingReportModel(state());
  const row = model.rows.find((candidate) => candidate.kind === 'restored');
  check(`the report: one RESTORED BY MERGE row for pods ${r1} and ${r2}, its line the label and VIEW's counts, two icons`,
    row !== undefined && row.text.startsWith('2 RESTORED') && row.line === `${LANDING_REPORT_TEXT.restored} · ${row.text}`
    && row.icons.length === 2 && model.otherRows.includes(row.line), JSON.stringify(row));
  const tagged = model.credits.filter((credit) => credit.where.endsWith(LAST_LANDING_TEXT.credit)).map((credit) => credit.pod).sort((a, b) => a - b);
  const scored = model.credits.filter((credit) => credit.pod === r1 || credit.pod === r2).map((credit) => credit.pod).sort((a, b) => a - b);
  check('…and only the restored pods\' credits carry ` (restored)`', tagged.length > 0 && tagged.join() === scored.join(),
    `${tagged.join()} vs ${scored.join()}`);
}

finish();
