// Slice 7b: Track VIEW owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.2). Data only (support/import-guard); each
// line ≤ 70 characters at its worst case (support/words.test's 7b VIEW block). The FOUNDATION seeded it with §2.9's and
// 01 §3.17's words; VIEW may reword them. Track DROP reads `radio` (the TERMINAL's line per pod, said as THE LAST LANDING
// starts); VIEW reads the rest (the header strip, the POD BAY's row, the report's row and credits).
import { podTag } from '@data/pod-ids';
import { formatCount } from '@data/format';
import type { LastLandingState } from '@/types/ending';

export const LAST_LANDING_TEXT = {
  // The header strip over the SHIP view while THE LAST LANDING flies (01 §3.17), and its hint (R28).
  header: 'THE LAST LANDING',
  skipHint: '[ENTER] SKIP TO THE END',
  // Slice 8 POLISH (OD 66): the hint while [ENTER]'s skip flies the rest over frames (a second press does nothing).
  skipping: (left: number): string => `SKIPPING… ${formatCount(left)} LEFT`,
  // The strip's count of the restored pods still to come down (falling ones too: they are not down yet), and once the last
  // is down, for the moment before the report.
  left: (left: number, count: number): string => (left > 0
    ? `${formatCount(left)} OF ${formatCount(count)} ${count === 1 ? 'POD' : 'PODS'} TO LAND`
    : `ALL ${formatCount(count)} DOWN`),
  // Who flies them (R27: decided once at the start). Blind: no AUTODROP or no drop solution; the pod's own motor flies it
  // with no unit steering it (01 §3.17's WHY for the doubled spread).
  flier: {
    v1: 'AUTODROP v1 TIMES EACH POD',
    v2: 'AUTODROP v2 FLIES THE PASSES',
    v3: 'AUTODROP v3 PLANS THE SPLIT',
    blind: 'BLIND DROP · NOBODY STEERS THEM',
  } satisfies Record<LastLandingState['flier'], string>,
  // The TERMINAL, one line per restored pod (01 §3.17): `> pod07 ... DRIVER RESTORED · OKAFOR`.
  radio: (pod: number, family: string): string => `> ${podTag(pod)} ... DRIVER RESTORED · ${family.toUpperCase()}`,
  // The POD BAY window's row (R29): `RESTORED 4`, and under it where the drivers are (by radio, never in memory: R24) and
  // their health (MERGE_DRIVER_INTEGRITY).
  bayRow: (count: number): string => `RESTORED ${formatCount(count)}`,
  bayNote: (integrity: number): string => `DRIVERS BY RADIO · ${integrity}%`,
  // The report's RESTORED BY MERGE row's counts, in pods (R29): `4 RESTORED · 3 LANDED · 1 OFF-SITE`. A part with 0 is left
  // out; the first always stands. LANDED is in an LZ with room (the headline's sense); MISLANDED came down in a full one (a
  // blind pod takes the window whatever the counts, 01 §3.17). A restored pod still parked has its own PARKED IN ORBIT row.
  reportRow: ({ restored, landed, mislanded, offSite, noGo }: { restored: number; landed: number; mislanded?: number; offSite: number; noGo: number }): string =>
    [
      `${restored} RESTORED`, landed > 0 ? `${landed} LANDED` : '', (mislanded ?? 0) > 0 ? `${mislanded} MISLANDED` : '',
      offSite > 0 ? `${offSite} OFF-SITE` : '', noGo > 0 ? `${noGo} NO-GO` : '',
    ].filter((part) => part !== '').join(' · '),
  // A restored pod's credit on the report (R29), after its place.
  credit: ' (restored)',
} as const;
