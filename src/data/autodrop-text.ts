// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §7.2): every AUTODROP string (the
// strip, the POD BAY, the radio, the echo, the Skills row). The FOUNDATION seeded the once-only lessons with the plan's
// words (§3.7); DROP rewords freely and adds the rest. Every line is ≤ MAX_LINE_CHARS (70) at its worst case
// (tests/unit/skills/autodrop-plan checks them: foundation review m6). Data only: no system imports, so the words never
// close an import cycle; callers pass the labels in (`LZ-A`, `POD 05`, `SENSOR INTERP`).

// `LZ-A` → `A`: the split and the PASS DONE line name LZs by their letter (03 §3.8: `A ×2 · B ×1`).
export function lzLetter(lz: string): string {
  return lz.startsWith('LZ-') ? lz.slice(3) : lz;
}

// `A ×2 · B ×1` (the split), `A +2 · B +1` (what a pass sent): LZ letters in label order, zeros left out.
function split(counts: Readonly<Record<string, number>>, sign: '×' | '+'): string {
  const parts = Object.keys(counts).sort().filter((lz) => (counts[lz] ?? 0) > 0)
    .map((lz) => `${lzLetter(lz)} ${sign === '×' ? `×${counts[lz]}` : `+${counts[lz]}`}`);
  return parts.length === 0 ? (sign === '+' ? 'NONE SENT' : 'NONE') : parts.join(' · ');
}

// The [G] refusals (autodrop.ts AutodropRefusal), said on the TERMINAL as the key buzzes and flashed on the strip
// (data/script.ts REFUSAL_LINES, `AUTODROP|<word>`). Review M4: `NOTHING SET` is v2's (its [+]); v3 has no [+] and says
// `NOTHING TO PLAN`; and with no sure window on this orbit for any LZ, either says `NO SURE WINDOW` with the REPAIR that
// would give one (landing-rules bestRepairForDrop), one word per fix so the strip's flash can name it.
export type AutodropRefusalWord = 'NOT LANDING' | 'MERGE FLYING' | 'NO AUTODROP' | 'AUTODROP OFF' | 'NOTHING SET' | 'NOTHING TO PLAN' | 'PAUSED'
  | 'ONLY v1' | 'NO SURE WINDOW' | 'NO SURE WINDOW · SENSOR INTERP' | 'NO SURE WINDOW · NAV PLOTTER' | 'NO SURE WINDOW · DRIVERS';

export const AUTODROP_TEXT = {
  // The once-only lessons (data/script.ts SKILL_4CDE_RULES; their conditions are autodrop.ts autodropTutorialDue's).
  // v1's is R4's: said once, after a tap on [L] let go before the volley's first launch (nothing went).
  tutorial: {
    v1: 'HOLD [L] — AUTODROP waits for the centre',
    v2: 'AUTODROP v2 — set the split in the POD BAY, then [G]',
    v3: 'AUTODROP v3 — [G] flies the whole plan',
  },

  // --- The strip (autodrop.ts autodropLineOf: AUTODROP's guidance rows and its tails on L13's waits, plan §3.7) ---
  strip: {
    // AD-hold: v1 works on the SHIP screen, and a sure window is open or within GET READY's 8 tac s.
    hold: (lz: string): string => `WINDOW ${lz} — hold [L]: AUTODROP waits for the centre`,
    // AD-held: [L] held, AUTODROP times the volley (n pods, the first in `time`, or now).
    held: (lz: string, n: number, time: string | null): string =>
      `HOLD [L] — AUTODROP · ${lz} ×${n} · ${time === null ? 'LAUNCHING' : `first in ${time}`}`,
    // AD-fly: v2/v3 armed, a volley within 8 tac s or flying.
    fly: (lz: string, n: number, time: string | null): string =>
      `AUTODROP — ${lz} ×${n} · ${time === null ? 'LAUNCHING' : time} · [G] to cancel`,
    // AD-armed: a window open that the armed machine leaves alone (flown already, or not this pass's): it waits.
    armedNext: (lz: string, n: number, time: string): string => `AUTODROP ARMED — next ${lz} ×${n} in ${time} · [G] to cancel`,
    armedIdle: 'AUTODROP ARMED — nothing more this window · [G] to cancel',
    // AD-wait: its claim found no Core thread (R8).
    wait: (time: string | null): string =>
      `AUTODROP NEEDS A THREAD ${time === null ? 'NOW' : `IN ${time}`} — × AN OP`,
    // AD-done: for AUTODROP_DONE_LINE_SEC after a pass (v2) or the plan (v3) ends.
    passDone: (sent: Readonly<Record<string, number>>): string => `PASS DONE · ${split(sent, '+')} — set the next pass, [G]`,
    planDone: (sent: Readonly<Record<string, number>>): string => `PLAN DONE · ${split(sent, '+')}`,
    // The tails on L13's waits.
    tailPass: ' · [G] AUTODROP',
    tailPlan: ' · [G] FLIES THE PLAN',
    tailArmed: ' · AUTODROP ARMED',
  },

  // --- The TERMINAL (say 'sys', critical) ---
  radio: {
    armedPass: (pass: Readonly<Record<string, number>>): string => `AUTODROP ARMED · THIS PASS: ${split(pass, '×')}`,
    armedPlan: (passes: number): string => `AUTODROP ARMED · THE PLAN: ${passes} PASS${passes === 1 ? '' : 'ES'} · [F] BETWEEN THEM`,
    cancel: 'AUTODROP OFF — you have the [L]',
    passDone: (sent: Readonly<Record<string, number>>): string => `PASS DONE · ${split(sent, '+')}`,
    planDone: (sent: Readonly<Record<string, number>>): string => `PLAN DONE · ${split(sent, '+')}`,
    // 03 §3.5's steps down while it flies (plan §3.5), and the OFFs.
    v3to2: 'AUTODROP v3 → v2 — this pass flies; set the next one',
    v2to1: 'AUTODROP v2 → v1 — hold [L] for the rest',
    damaged: 'AUTODROP.skl DAMAGED — DROP BY HAND',
    offline: 'AUTODROP OFF WHILE IT IS REPAIRED — you have the [L]',
    refused: (word: AutodropRefusalWord): string => `> [G] ${AUTODROP_TEXT.refusal[word]}`,
  },

  // Why [G] did nothing (said with the buzz).
  refusal: {
    'NOT LANDING': 'AUTODROP WORKS IN THE LANDING',
    // Slice 7b review: THE LAST LANDING (MERGE flies the restored pods; the launch's own MERGE FLYING says the same).
    'MERGE FLYING': 'MERGE IS FLYING THEM — [ENTER] SKIPS TO THE END',
    'NO AUTODROP': 'NO AUTODROP.skl ABOARD',
    'AUTODROP OFF': 'AUTODROP.skl IS TOO DAMAGED — REPAIR IT',
    'NOTHING SET': 'NOTHING SET — use the POD BAY\'s [+]',
    'NOTHING TO PLAN': 'NOTHING TO PLAN — NO POD CAN GO YET',
    PAUSED: 'PAUSED',
    'ONLY v1': 'AUTODROP v1 — HOLD [L] IN A WINDOW',
    'NO SURE WINDOW': 'NO SURE WINDOW ON THIS ORBIT',
    'NO SURE WINDOW · SENSOR INTERP': 'NO SURE WINDOW — REPAIR SENSOR INTERP',
    'NO SURE WINDOW · NAV PLOTTER': 'NO SURE WINDOW — REPAIR NAV PLOTTER',
    'NO SURE WINDOW · DRIVERS': 'NO SURE WINDOW — REPAIR THE POD DRIVERS',
  } satisfies Record<AutodropRefusalWord, string>,

  // The pod's touchdown echo when AUTODROP launched it soft into an LZ with room (plan §3.2).
  bullseye: ' · BULLSEYE',

  // --- The POD BAY window (landing-hud.ts bayWindowModel.autodrop) ---
  bay: {
    // The pip (03 §4: the BAY window gains AUTODROP, a click away from the file).
    pipLabel: 'AUTODROP',
    pipVersion: (version: number): string => `AUTODROP v${version}`,
    pipWorksAs: (nominal: number, effective: number): string =>
      (effective === 0 ? `AUTODROP v${nominal}▸off` : `AUTODROP v${nominal}▸v${effective}`),
    pipOk: (version: number): string => `AUTODROP.skl v${version} — click to see the file`,
    pipDamaged: (nominal: number, effective: number, okMin: number): string => (effective === 0
      ? `AUTODROP.skl v${nominal} — too damaged to work: REPAIR it`
      : `AUTODROP.skl v${nominal} — WORKS AS v${effective}: REPAIR it to ${okMin}% for v${nominal}`),
    pipOffline: (version: number): string => `AUTODROP.skl v${version} — offline while REPAIR or MOVE runs`,
    pipMissing: 'AUTODROP.skl is gone: RESTORE it at the next desk',
    // The key line under the pip, by what [L] / [G] does now.
    keyHold: 'HOLD [L] · AUTODROP CENTRES EVERY POD',
    // The LAUNCH button's status while it (or [L]) is held for v1.
    launchHeld: 'AUTODROP HOLDS FOR THE CENTRE',
    keyPass: 'AUTODROP ▸ PASS [G]',
    keyPlan: 'AUTODROP ▸ PLAN [G]',
    keyArmedPass: 'AUTODROP FLIES THIS PASS · [G] CANCELS',
    keyArmedPlan: 'AUTODROP FLIES THE PLAN · [G] CANCELS',
    keyOff: 'AUTODROP OFF — DROP BY HAND',
    keyWaiting: 'AUTODROP WAITS FOR A THREAD — × AN OP',
    // v2's rows (`A [−] 2 [+]`) and their shortfalls.
    passHead: 'THIS PASS',
    shortBay: (lz: string, want: number, has: number): string => `${lzLetter(lz)} ×${want} — BAY HAS ${has} BY THEN`,
    shortFit: (lz: string, want: number, fits: number): string => `${lzLetter(lz)} ×${want} — ${fits} FIT THIS PASS`,
    noWindow: (lz: string): string => `${lzLetter(lz)} — NO SURE WINDOW THIS PASS`,
    // v3's table: one row per volley (`P1 · LZ-A ×3 · IN 0:42`), the check line, the never-fits line.
    planHead: 'PLAN',
    planRow: (pass: number, lz: string, n: number, time: string, mislanded: number): string =>
      `P${pass} · ${lz} ×${n} · ${time}${mislanded > 0 ? ' · ¾' : ''}`,
    // A row's time (review m9): `NOW` once its moment has come, else `IN 0:42`.
    planNow: 'NOW',
    planIn: (time: string): string => `IN ${time}`,
    // Review m10: pods, not colonists (`PLAN · 3 PASSES · A 6 · B 5 · C 5 ✓`), as the split's `A ×2` counts them, so four
    // LZs with two misses still fit the POD BAY's line at 1440.
    planCheck: (passes: number, perLz: Readonly<Record<string, number>>, missing: readonly string[]): string => {
      const lzs = Object.keys(perLz).sort().map((lz) => `${lzLetter(lz)} ${perLz[lz] ?? 0}`).join(' · ');
      // One LZ short reads `✗ LZ-C`; several by their letters (`✗ B, C`), so four LZs still fit the line.
      const verdict = missing.length === 0 ? '✓' : missing.length === 1 ? `✗ ${missing[0]}` : `✗ ${missing.map(lzLetter).join(', ')}`;
      return `PLAN · ${passes} PASS${passes === 1 ? '' : 'ES'} · ${lzs} ${verdict}`;
    },
    // Pods that fit but lie past AUTODROP_PLAN_MAX_PASSES: the table stops growing (`+n PASSES`, plan §2.6).
    planLater: (passes: number, maxPasses: number): string => `+${passes} PASS${passes === 1 ? '' : 'ES'} PAST ${maxPasses} — [G] AGAIN AFTER`,
    planEmpty: 'NOTHING LEFT TO PLAN',
    planMore: (rows: number): string => `+${rows} MORE`,
    // `LZ-B NEVER FITS — REPAIR POD 05, or fly lower`. `lower`: who goes lower, `kid` (fly lower), `v3` (AUTOBURN v3 holds the
    // landing orbit and will go lower for it), or `none` (review m3: the LZ is in v3's own misses, so v3 decided it will not;
    // the REPAIR alone, or `AUTOBURN v3 CAN'T FIT IT` with none).
    neverFits: (lz: string, repair: string | null, lower: 'kid' | 'v3' | 'none'): string => {
      if (lower === 'none') return repair === null ? `${lz} NEVER FITS — AUTOBURN v3 CAN'T FIT IT` : `${lz} NEVER FITS — REPAIR ${repair}`;
      const how = lower === 'v3' ? 'AUTOBURN v3 GOES LOWER' : 'fly lower';
      return repair === null ? `${lz} NEVER FITS — ${how}` : `${lz} NEVER FITS — REPAIR ${repair}, or ${how}`;
    },
    goButton: '[G] AUTODROP',
    goButtonArmed: '[G] CANCEL',
  },

  // --- The Skills window's row (autodrop.ts autodropStatus) ---
  status: {
    trained: (mode: string, aim: number, demos: number): string => `${mode} · AIM ${aim}% · ${demos} drop${demos === 1 ? '' : 's'}`,
    untrained: (mode: string, aim: number): string => `${mode} · UNTRAINED ${aim}% · DROP BY HAND TO TEACH IT`,
    armed: (lz: string, n: number, time: string): string => `ARMED · ${lz} ×${n} IN ${time}`,
    armedIdle: 'ARMED · WAITING FOR ITS WINDOW',
    holding: 'HOLDING [L] · IT CENTRES THE VOLLEY',
    waiting: 'WAITING FOR A THREAD — × AN OP',
    worksAs: (effective: number, nominal: number): string => `WORKS AS v${effective} — REPAIR IT FOR v${nominal}`,
  },
} as const;
