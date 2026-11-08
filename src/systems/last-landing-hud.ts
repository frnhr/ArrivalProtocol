// Slice 7b: Track VIEW owns this file (docs/phase3/impl/slice-7-plan.md §2.10, §4.2, §5.2). Pure: THE LAST LANDING's view
// models (R29), read every paint. The words are data/last-landing-text.ts's. Readers: components/run/LastLanding.ts (the
// header strip and its hint), the POD BAY window's RESTORED row (PodBayWindow.ts, VIEW's marked edit), and landing-report.ts
// (the RESTORED BY MERGE row's counts and icons, the credits' `(restored)`; the lead's hooks). The beacons' `restored` is
// landing-hud parkedBeacons' (the lead's), drawn by VIEW in plot-landing.ts.
// The header and the POD BAY row are keyed on the machine (`landing.lastLanding`), never on the FINALE's phase: 7a's interim
// MERGE also runs in 'last-landing' (7b foundation deviation 9), with the kid's own hands. The report's row and the credits'
// tag are keyed on each pod's `restored` (MERGE's confirm sets it, whoever then flew the pod), since the report opens after
// the machine has cleared.
// ending/last-landing-models (VIEW's suite) checks them on hand-built states.
import type { GameState } from '@state/schema';
import type { LandingTally, PodSummary } from '@/types/landing';
import type { PodIcon } from '@systems/landing-report';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import { MERGE_DRIVER_INTEGRITY } from '@data/tuning';

// Where a restored pod is while THE LAST LANDING flies: still riding the orbit (released aboard: a steady amber beacon),
// on its way down, or down.
export type RestoredPodState = 'waiting' | 'falling' | 'down';

function restoredPodStates(state: Readonly<GameState>): { pod: number; at: RestoredPodState }[] | null {
  const machine = state.landing.lastLanding;
  if (machine === null) return null;
  return machine.pods.map((pod) => {
    const record = state.landing.pods.find((candidate) => candidate.pod === pod);
    if (!record) throw new Error(`last-landing-hud: restored pod ${pod} is not on this ship`);
    const kind = record.fate.kind;
    if (kind === 'down') return { pod, at: 'down' };
    if (kind === 'falling') return { pod, at: 'falling' };
    // Released aboard (R25) or, at the machine's very end, parked: either way still in the orbit.
    if (kind === 'aboard' || kind === 'parked') return { pod, at: 'waiting' };
    throw new Error(`last-landing-hud: restored pod ${pod} has left the orbit (${kind}) during THE LAST LANDING`);
  });
}

// The header strip over the SHIP view while THE LAST LANDING flies (01 §3.17): `THE LAST LANDING`, the pods still to come
// down, and `[ENTER] SKIP TO THE END`; null when it is not running. `status` and `flier` are the strip's middle: how many
// are left (`3 OF 4 PODS TO LAND`) and who flies them (R27, decided once at the start).
export interface LastLandingHeaderModel {
  title: string;
  left: number;
  hint: string;
  count: number;
  status: string;
  flier: string;
}

export function lastLandingHeader(state: Readonly<GameState>): LastLandingHeaderModel | null {
  const pods = restoredPodStates(state);
  const machine = state.landing.lastLanding;
  if (pods === null || machine === null) return null;
  const left = pods.filter((pod) => pod.at !== 'down').length;
  return {
    title: LAST_LANDING_TEXT.header,
    left,
    hint: LAST_LANDING_TEXT.skipHint,
    count: pods.length,
    status: LAST_LANDING_TEXT.left(left, pods.length),
    flier: LAST_LANDING_TEXT.flier[machine.flier],
  };
}

// The POD BAY window's `RESTORED 4` row (R29), or null (no row): the count is every restored pod (`lastLanding.pods`), the
// note says where their drivers are, and one pip per pod in pod order says where it is (the LZ counters' pips' look).
export interface PodBayRestoredRow {
  count: number;
  text: string;
  note: string;
  pips: RestoredPodState[];
}

export function podBayRestoredRow(state: Readonly<GameState>): PodBayRestoredRow | null {
  const pods = restoredPodStates(state);
  if (pods === null) return null;
  return {
    count: pods.length,
    text: LAST_LANDING_TEXT.bayRow(pods.length),
    note: LAST_LANDING_TEXT.bayNote(MERGE_DRIVER_INTEGRITY),
    pips: pods.map((pod) => pod.at),
  };
}

// The final LANDING REPORT's RESTORED BY MERGE row (R29: `4 RESTORED · 3 LANDED · 1 OFF-SITE`, with its pods' icons), or null:
// landing-report.ts then draws the row as 7a did (its label, no counts, no icons). It counts pods, not colonists (the
// tally's `restored` is colonists), from the summaries' `restored` flag (set by MERGE's confirm). Its icons are each
// restored pod's own outcome, in the order the text names them: in an LZ with room (soft, then hard), mislanded, off-site,
// no-go, and a pod still parked last (its reason is its own PARKED IN ORBIT row's).
export interface RestoredReportRow {
  text: string;
  icons: PodIcon[];
}

const ICON_ORDER: readonly PodIcon[] = ['soft', 'hard', 'mislanded', 'mislanded-hard', 'off-site', 'no-go', 'parked'];

function restoredIcon(pod: Readonly<PodSummary>): PodIcon {
  if (pod.fate === 'parked') return 'parked';
  if (pod.fate !== 'down') throw new Error(`restoredReportRow: restored pod ${pod.pod} has no place in the report (${pod.fate})`);
  switch (pod.place) {
    case 'lz': return pod.touch === 'hard' ? 'hard' : 'soft';
    case 'mislanded': return pod.touch === 'hard' ? 'mislanded-hard' : 'mislanded';
    case 'off-site': return 'off-site';
    case 'no-go': return 'no-go';
    default: throw new Error(`restoredReportRow: restored pod ${pod.pod} is down with no place`);
  }
}

export function restoredReportRow(tally: Readonly<LandingTally>): RestoredReportRow | null {
  const restored = tally.pods.filter((pod) => pod.restored);
  if (restored.length === 0) return null;
  const icons = restored.map(restoredIcon).sort((a, b) => ICON_ORDER.indexOf(a) - ICON_ORDER.indexOf(b));
  const count = (...kinds: PodIcon[]): number => icons.filter((icon) => kinds.includes(icon)).length;
  return {
    text: LAST_LANDING_TEXT.reportRow({
      restored: restored.length, landed: count('soft', 'hard'), mislanded: count('mislanded', 'mislanded-hard'),
      offSite: count('off-site'), noGo: count('no-go'),
    }),
    icons,
  };
}

// What a restored pod's credit adds after its place (R29: ` (restored)`), '' for every other pod.
export function restoredCreditTag(pod: Readonly<PodSummary>): string {
  return pod.restored ? LAST_LANDING_TEXT.credit : '';
}
