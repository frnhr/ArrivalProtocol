// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): the words WARDEN's own modules emit
// (its looping lines, the locks, the DEAL, DELETE and the cure's TERMINAL lines, CONTROL's two lines, the alarm, counter and
// pip words, the strip's three lines, the segment's desc after a SCAN). Every word FACE paints (the stamps, the goodnight,
// INSPECT) is data/resident-ui-text.ts's (review M2). residents/foundation checks the module's shape only; support/words
// renders every entry at its worst case. Every line ≤ MAX_LINE_CHARS (70) at its worst case (the longest resident name 7
// letters, the longest ship name 10, POD 16, a file name of SEG_NAME_MAX_CHARS). Data only: no system imports, so the
// words never close an import cycle; callers pass the names in.

// `POD 07` (data/landing-text.ts podCode's shape, kept here so this module imports nothing).
const pod2 = (pod: number): string => `POD ${String(pod).padStart(2, '0')}`;

// 05 §3.12's corrupted resident, looping (05 §3.6: "its lines loop"): a protector stuck in its duty, scared and possessive,
// never evil. Said one at a time at its engine bursts, in order, garbled at RESIDENT_GARBLE (systems/resident-corrupted.ts).
// The second is 05's broken record, cut two letters sooner than the sample so a 7-letter name still fits the row.
const LOOP: readonly string[] = [
  'YOU ARE NOT THE PILOT. I AM THE PILOT.',
  'ALL PASSENGERS ARE ASLEEP. ALL PASSENGERS ARE ASLEEP. ALL PA',
  'THE PODS STAY. THE PODS ARE SAFE HERE.',
  'I KEEP THE COURSE. I KEEP THE COURSE. I KEEP',
  'DOWN THERE IS NOT SAFE. UP HERE IS SAFE.',
  'NOBODY TOLD ME YOU WERE COMING.',
  'I COUNTED THEM. I COUNT THEM. I COUNT THEM.',
];

export const WARDEN_TEXT = {
  // Its first line, at the wake (plan R9): a faulty ship's, and the late surprise's (with the stamp).
  wake: (name: string): string => `${name}: THIS SHIP DID NOT ASK FOR A CARETAKER.`,
  surprise: (name: string): string => `${name}: NOBODY REPORTED ME. GOOD.`,
  // The looping pool (at least 6, plan §2.10), and a line of it as said.
  loop: LOOP,
  loopLine: (name: string, line: string): string => `${name}: ${line}`,

  // --- The locks (04 §3.12, plan R6): the TERMINAL's countdown, its block and its landing. ---
  lockTelegraph: (pod: number, secLeft: number): string => `> LOCK ${pod2(pod)} ... ${secLeft}`,
  lockBlocked: (pod: number): string => `> LOCK ${pod2(pod)} ... BLOCKED`,
  lockLanded: (name: string, pod: number): string => `${name}: ${pod2(pod)} STAYS.`,
  // The warning that holds SKIP while a lock counts down (the mode toggle's `MIND ▸ …`).
  lockAlert: (pod: number): string => `LOCK ON ${pod2(pod)}`,

  // --- Its DEAL (plan R8): once a ship, while it holds a locked pod. The file word is the fair tier's file (rmTargets): a
  // spare tool by its chip (`YOUR SPARE MOVE`), any other file by its name (`AUTODROP.skl`, `Thrust.alt`). ---
  deal: (name: string, file: string): string => `${name}: GIVE ME ${file}. THEN I LET THE PODS GO.`,
  dealSpare: (tool: string): string => `YOUR SPARE ${tool.toUpperCase()}`,
  dealAccept: 'ACCEPT',
  dealRefuse: 'REFUSE',
  dealAcceptKey: 'Y',
  dealRefuseKey: 'N',
  dealTicker: (name: string): string => `${name} WANTS A FILE`,
  dealAccepted: (name: string): string => `${name}: THE PODS ARE YOURS. GO AWAY.`,
  dealRefused: (name: string): string => `${name}: THEN THEY STAY. THEY ALL STAY.`,
  // The file it named went (moved, eaten, deleted) before the answer: the offer is taken back.
  dealNeverMind: (name: string): string => `${name}: KEEP IT, THEN. THEY STAY.`,

  // --- DELETE (R25) and the cure (part b). ---
  confirmQuestion: (name: string): string => `DELETE ${name}.sys?`,
  confirmDetail: 'It is the ship\'s own mind.',
  // Its last line, the log fragment that drops as it goes (04 §3.12).
  deleted: (name: string): string => `${name}: TELL THEM I KEPT THEM SAFE.`,
  cured: (name: string): string => `${name}: ...OH. THANK YOU. THE PODS ARE YOURS.`,

  // --- ARRIVAL CONTROL (05 §3.4: the radio, every sentence ends with `:)`; plan R20). ---
  controlFaulty: (ship: string): string => `${ship}'s onboard AI is reported faulty. Please delete it. :)`,
  controlThanks: 'Thank you. :)',

  // --- The engine (systems/ghost-thrust.ts, flight-hud.ts's THRUST CTRL pip): its bursts named by their cause. ---
  // The first burst's alarm (the alert's word, which the mode toggle shows), and the bursts after it, counted.
  alarm: 'THE SHIP\'S AI IS FIRING THE ENGINE',
  counter: (name: string, count: number): string => `${name} FIRED THE ENGINE ×${count}`,
  pipOverride: (name: string): string => `OVERRIDDEN · ${name}.sys`,
  // A healthy controller still reads its health beside the override: the fault is a mind, not the file.
  pipHealthy: '100%',
  pipTitle: (name: string): string => `${name}.sys fires the engine: the ship's own AI, in RACK A`,

  // --- The strip (data/resident-rules.ts). ---
  stripAlarm: 'THE SHIP\'S AI IS FIRING THE ENGINE — find it in RACK A',
  stripAlarmTab: 'THE SHIP\'S AI IS FIRING THE ENGINE — [TAB], find it in RACK A',
  stripLock: (pod: number, secLeft: number): string => `BLOCK THE LOCK — SCAN ${pod2(pod)} (${secLeft}…)`,
  stripLockTab: (pod: number, secLeft: number): string => `BLOCK THE LOCK — [TAB], SCAN ${pod2(pod)} (${secLeft}…)`,
  stripLocked: (pod: number, name: string): string => `${pod2(pod)} LOCKED — DELETE or REPAIR ${name}.sys`,
  stripLockedScan: (pod: number, name: string): string => `${pod2(pod)} LOCKED — SCAN ${name}.sys, then DELETE or REPAIR`,
  stripLockedTab: (pod: number, name: string): string => `${pod2(pod)} LOCKED — [TAB], DELETE or REPAIR ${name}.sys`,
  // Review M3: a pod held with no remedy aboard (no DELETE, too little charge to cure, no DEAL left): it parks locked.
  stripStuck: (pod: number): string => `${pod2(pod)} STAYS LOCKED — nothing aboard can free it`,
  // After the first burst's alarm, once: the way to the cause stays on the strip a while.
  stripFiring: (name: string): string => `${name}.sys FIRES THE ENGINE — DELETE or REPAIR it in RACK A`,
  stripFiringScan: (name: string): string => `${name}.sys FIRES THE ENGINE — SCAN it in RACK A first`,
  stripFiringTab: (name: string): string => `${name}.sys FIRES THE ENGINE — [TAB], find it in RACK A`,

  // --- Its file's desc once scanned (INSPECT; before a SCAN it is data/resident-text.ts's), by how it stands. ---
  desc: {
    awake: 'The ship\'s own AI. Corrupted: it fires the engine and locks pods.',
    dormant: 'The ship\'s own AI. Corrupted. It is waiting.',
    quiet: 'The ship\'s own AI. Paid: it keeps to itself on this ship.',
    cured: 'The ship\'s own AI. Mended. It watches the pods go down.',
  },
} as const;
