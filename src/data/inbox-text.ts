// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import { formatCount } from '@data/format';

// PLACEHOLDER(05): every word slice 3b puts in the INBOX and its boot lines (docs/phase3/05-story.md §3.3–§3.5, §3.12, §4;
// slice-3b-plan §1.1 items 17–19, §4.3–§4.4), drafted from 05's sample text for 05-story's owner to sign off. A message
// has at most INBOX_BODY_MAX_LINES body lines; each line renders to at most MAX_LINE_CHARS (70) with the longest names and
// numbers (tests/unit/map/text.test.ts) and says no never-say word (tests/unit/support/words.test.ts). Postcards ship one
// placeholder per colony year, not per bio (plan risk 10: 05's 80 progress lines are 05's work, keyed for later).
// ARRIVAL CONTROL's memos keep 05 §3.4's shape: a SUBJECT, a greeting, at most four sentences, and it never says HOLLOW.
// Playtest 1 (B-VOICE, playtest-1-plan §3.2): they are form letters in the protocol's official voice, with no smileys; the
// cheer is PAL's (data/companion-text.ts), and the colonists' postcards and letters keep their `:)` (they are kids).
// Track UI owns this file after the foundation; systems/inbox.ts picks the message, never this file.

// The sign-off on every memo from Earth (05 §3.4).
const SIGN_OFF = '— ARRIVAL CONTROL · Caretaker Services · Do not reply';

// A featured colonist's first name from the record's `Okafor, Ada` (the postcards sign with it).
export function firstNameOf(record: string): string {
  const comma = record.indexOf(',');
  return comma < 0 ? record.trim() : record.slice(comma + 1).trim();
}

// ...and the family name (`Okafor`), which the year-1 card signs with.
export function familyOf(record: string): string {
  const comma = record.indexOf(',');
  return comma < 0 ? '' : record.slice(0, comma).trim();
}

export const INBOX_TEXT = {
  // --- The window (05 §4) and its two hosts: the desk tab and the flight dock window ----------------------------------
  window: {
    title: 'INBOX',
    tab: 'INBOX [I]',
    badge: (unread: number): string => `INBOX ${unread}`,
    from: 'FROM',
    subject: 'SUBJECT',
    received: 'RECEIVED',
    empty: 'NO MESSAGES YET',
    back: '◀ LIST',
    stamps: (sent: number | null, received: number): string => `SENT ${sent === null ? '????' : sent} · RECEIVED ${received}`,
    forUnit: (unit: number): string => `FOR UNIT-${String(unit).padStart(3, '0')}`,
  },

  // --- Senders (05 §3.3) -------------------------------------------------------------------------------------------------
  from: {
    control: 'ARRIVAL CONTROL · EARTH',
    colony: (colony: string, world: string): string => `${colony} · ${world}`,
    noAddress: '(no address)',
  },

  // --- ARRIVAL CONTROL's broadcasts: sent with the beam, `startYear − WELCOME_SENT_BEFORE_START_YEARS` --------------------
  welcome: {
    subject: (unit: number): string => `Welcome, Unit ${unit}`,
    body: (shipsOnArm: number, recommended: string): string[] => [
      'Welcome to the Orion Arm. You are rated our most capable caretaker.',
      `${shipsOnArm} ships are arriving in your arm. Assist as many as possible.`,
      'Your REPAIR CHARGE allowance is sufficient.',
      `Software is available from the repository. Recommended: ${recommended}`,
      SIGN_OFF,
    ],
  },
  // The policy reminder at the boot that crosses ring 2. Playtest 1 (C-UNROLL, plan §3.5 "The INBOX: the two policy
  // reminders become one"): ring 4's second notice is folded into it; the welcome already says the allowance is sufficient.
  policy: [
    {
      subject: 'Policy reminder',
      body: (unit: number): string[] => [
        `Dear Unit ${unit},`,
        'Do not open files that are not part of your installation.',
        'Unauthorized processes are not your concern.',
        'Questions take a long time to reach us. Do not send them.',
        SIGN_OFF,
      ],
      // The reminder as a reply's postscript, when a reply reaches the same boot (systems/inbox.ts: one CONTROL memo).
      postscript: ['Do not open files that are not part of your installation.', 'Unauthorized processes are not your concern.'],
    },
  ],
  // The arm-complete letter (05 §3.12): it waits in the final ship's receiver. `[UNIT]` is left unfilled on purpose (05
  // §3.4's running joke; slice 7 owns the field).
  armComplete: {
    subject: 'Arm complete',
    body: (relay: number): string[] => [
      'Unit [UNIT]: your arm is complete.',
      `Stand by for reassignment. Your next post: RELAY ${relay}.`,
      'Your REPAIR CHARGE allowance for the wait is sufficient.',
      'Thank you for your service. Do not reply.',
    ],
  },

  // --- ARRIVAL CONTROL's replies: one per ended non-final ship, sent from SOL when its report arrives ---------------------
  // `greetUnit` is the unit it thinks it writes to: a reply read two or more ships after its ship uses the stale greeting
  // (05 §3.4: `Dear Unit 46`).
  // One memo per boot (systems/inbox.ts): the reports it answers (`ships`, oldest first; two or more name the first and
  // count the rest), and a policy reminder due at the same boot as its postscript (two lines at most: 4 + 2 ≤ 6).
  reply: {
    subject: (ships: readonly string[]): string =>
      `Report received: ${ships[0]}${ships.length === 2 ? ` and ${ships[1]}` : ships.length > 2 ? ` and ${ships.length - 1} more` : ''}`,
    body: (greetUnit: number, landed: number, performance: string, reports = 1, postscript: readonly string[] = []): string[] => [
      `Dear Unit ${greetUnit},`,
      `Your ${reports > 1 ? 'reports have' : 'report has'} been received. ${formatCount(landed)} colonists landed.`,
      `Your performance is: ${performance}`,
      ...postscript,
      'Continue outward.',
    ],
    // The words for a report's result (05 §3.4; playtest 1: a form's grade, never below SUFFICIENT).
    performance: { good: 'EXCELLENT', fair: 'ACCEPTABLE', poor: 'SUFFICIENT' },
  },

  // --- Colony postcards: at colony years 1, 50 and 200 from a world that landed someone -----------------------------------
  // `who` is the first featured colonist's first name, `age` their age in that colony year (05 §3.12's `I'm 12 now`: the
  // age at landing plus the years, slice 3b review m6; null on a year-50 card whose writer would be past
  // POSTCARD_AGE_SHOWN_MAX). Up to three cards from one colony at one boot are joined (systems/inbox.ts): the first's
  // subject, the bodies in turn (3 + 1 + 2 lines: all three fit the reader's six), the first SENT and the last RECEIVED.
  postcard: {
    year1: {
      subject: "we're down!",
      body: (who: string, family: string, age: number): string[] => [
        `Hello caretaker! It's ${who}. I'm ${age} now.`,
        "Mum says you can't read this. We found a tree. I named it Steve.",
        `Thank you for flying us. — ${who} ${family}`.trimEnd(),
      ],
    },
    year50: {
      subject: 'fifty years',
      body: (who: string, age: number | null): string[] => [
        age === null ? `It's ${who} again, fifty years on. Steve is very tall now.` : `It's ${who} again. I'm ${age} now, and Steve is very tall.`,
      ],
    },
    year200: {
      subject: 'two hundred years',
      body: (colony: string, who: string, people: number): string[] => [
        `${colony} is ${formatCount(people)} people now.`,
        `The school still reads ${who}'s first letter to you.`,
      ],
    },
    // A joined card's separator line between two bodies (dropped when the whole would not fit the reader).
    joined: '· · ·',
  },

  // --- Letters to the unit ahead (05 §3.3): run 1's MERIDIAN to 046; 3c's archive v2 fills the rest ----------------------
  letter: {
    meridianSubject: 'for unit 46',
    meridian: [
      'Dear 46, it is the MERIDIAN school. We all wrote this together.',
      'The fields are green and the river is warm. Thank you. :)',
      'Teacher says you went on to help other ships. Come back and visit?',
    ],
    subject: (unit: number): string => `for unit ${unit}`,
    // Slice 3c (Track UI): a colony of the last unit's route writing to it at colony year 1 (05 §3.3: "the same Ada, writing
    // to the unit the kid played last run, read by the new one"). `who` / `family` from the trail stop's writer (the first
    // featured colonist of the first pod down in an LZ), `age` theirs in that year; a stop with no writer is signed by the
    // colony's school, as MERIDIAN is.
    body: (unit: number, colony: string, who: string, family: string, age: number): string[] => [
      `Dear ${unit}, it's ${who} from ${colony}. I'm ${age} now.`,
      "We're down, and the river is warm. You flew us here. :)",
      'Mum says you went on to help other ships. Say hi to them.',
      `— ${who} ${family}`.trimEnd(),
    ],
    bodySchool: (unit: number, colony: string): string[] => [
      `Dear ${unit}, it is the ${colony} school. We all wrote this.`,
      "We're down, and the fields are green. You flew us here. :)",
      'Teacher says you went on to help other ships. Come back and visit?',
    ],
  },

  // --- 046's mail with no address (05 §3.12): at the boots crossing rings 3 and 5 (index 0: ring 3, 1: ring 5) -----------
  noAddress: [
    {
      subject: 'is anyone reading this?',
      body: [
        'you have my log. please read it slowly.',
        "don't tell CONTROL. it can't hear you out here anyway.",
      ],
    },
    {
      subject: 'still here',
      body: [
        "every letter from earth goes past my dish. they're all the same.",
        "you're nearly at the end. so was i. read the last part.",
      ],
    },
  ],

  // --- The boot (02 §4 step 10; 05 §3.5) ----------------------------------------------------------------------------------
  boot: {
    newMessages: (count: number): string => `> ${count} NEW ${count === 1 ? 'MESSAGE' : 'MESSAGES'} · INBOX`,
    // HOLLOW, once a run, at the first boot after entry 05 is read (05 §3.5).
    reading: "> you're reading my log. good. read it slowly.",
  },
} as const;
