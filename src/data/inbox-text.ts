import { formatCount } from '@data/format';

// PLACEHOLDER(05): every word slice 3b puts in the INBOX and its boot lines (docs/phase3/05-story.md §3.3–§3.5, §3.12, §4;
// slice-3b-plan §1.1 items 17–19, §4.3–§4.4), drafted from 05's sample text for 05-story's owner to sign off. A message
// has at most INBOX_BODY_MAX_LINES body lines; each line renders to at most MAX_LINE_CHARS (70) with the longest names and
// numbers (tests/unit/map/text.test.ts) and says no never-say word (tests/unit/support/words.test.ts). Postcards ship one
// placeholder per colony year, not per bio (plan risk 10: 05's 80 progress lines are 05's work, keyed for later).
// ARRIVAL CONTROL's memos keep 05 §3.4's voice: a SUBJECT, a greeting, at most four sentences, every one ending `:)`, and it
// never says HOLLOW. Track UI owns this file after the foundation; systems/inbox.ts picks the message, never this file.

// The sign-off on every memo from Earth (05 §3.4).
const SIGN_OFF = '— ARRIVAL CONTROL · Caretaker Services · Please do not reply :)';

// A featured colonist's first name from the record's `Okafor, Ada` (the postcards sign with it).
export function firstNameOf(record: string): string {
  const comma = record.indexOf(',');
  return comma < 0 ? record.trim() : record.slice(comma + 1).trim();
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
    classic: 'NO MAIL ON THE CLASSIC ROUTE',
  },

  // --- Senders (05 §3.3) -------------------------------------------------------------------------------------------------
  from: {
    control: 'ARRIVAL CONTROL · EARTH',
    colony: (colony: string, world: string): string => `${colony} · ${world}`,
    noAddress: '(no address)',
  },

  // --- ARRIVAL CONTROL's broadcasts: sent with the beam, `startYear − WELCOME_SENT_BEFORE_START_YEARS` --------------------
  welcome: {
    subject: (unit: number): string => `Welcome, Unit ${unit}! :)`,
    body: (shipsOnArm: number, recommended: string): string[] => [
      'Welcome to the Orion Arm! You are our best caretaker yet. :)',
      `${shipsOnArm} ships are arriving in your arm. Please help as many as you can.`,
      'Your REPAIR CHARGE allowance is sufficient. :)',
      `Need software? Ask our repository. Recommended for you: ${recommended} :)`,
      SIGN_OFF,
    ],
  },
  // Policy reminders at the boots that cross rings 2 and 4 (index 0: ring 2, 1: ring 4).
  policy: [
    {
      subject: 'A reminder about policy :)',
      body: (unit: number): string[] => [
        `Dear Unit ${unit},`,
        'Please do not open files that are not part of your installation. :)',
        'Unauthorized processes are not your concern. :)',
        'Your REPAIR CHARGE allowance remains sufficient. :)',
        SIGN_OFF,
      ],
    },
    {
      subject: 'A second reminder about policy :)',
      body: (unit: number): string[] => [
        `Dear Unit ${unit},`,
        'Questions take a long time to reach us. Please do not send them. :)',
        'Your performance is: ACCEPTABLE :)',
        'Please continue outward. :)',
        SIGN_OFF,
      ],
    },
  ],
  // The arm-complete letter (05 §3.12): it waits in the final ship's receiver. `[UNIT]` is left unfilled on purpose (05
  // §3.4's running joke; slice 7 owns the field).
  armComplete: {
    subject: 'Your arm is complete! :)',
    body: (relay: number): string[] => [
      'Congratulations, Unit [UNIT]! Your arm is complete. :)',
      `Please stand by for reassignment. Your next post: RELAY ${relay}. :)`,
      'Your REPAIR CHARGE allowance for the wait is sufficient. :)',
      'Thank you for your service. Please do not reply. :)',
    ],
  },

  // --- ARRIVAL CONTROL's replies: one per ended non-final ship, sent from SOL when its report arrives ---------------------
  // `greetUnit` is the unit it thinks it writes to: a reply read two or more ships after its ship uses the stale greeting
  // (05 §3.4: `Dear Unit 46`).
  reply: {
    subject: (ship: string): string => `Congratulations on ${ship}! :)`,
    body: (greetUnit: number, landed: number, performance: string): string[] => [
      `Dear Unit ${greetUnit},`,
      `Thank you for your report. ${formatCount(landed)} colonists landed. :)`,
      `Your performance is: ${performance} :)`,
      'Please continue outward. :)',
    ],
    // The words for a report's result (05 §3.4: CONTROL is delighted by everything).
    performance: { good: 'EXCELLENT', fair: 'ACCEPTABLE', poor: 'SUFFICIENT' },
  },

  // --- Colony postcards: at colony years 1, 50 and 200 from a world that landed someone -----------------------------------
  // `who` is the first featured colonist's first name; `age` their age when the pod came down (year 50 adds 50). Two from one
  // colony at one boot are joined (systems/inbox.ts): the first's subject, both bodies, the first SENT and the last RECEIVED.
  postcard: {
    year1: {
      subject: "we're down!",
      body: (who: string, age: number, family: string): string[] => [
        `Hello caretaker! It's ${who}. I'm ${age} now.`,
        "Mum says you can't read this. I'm writing anyway.",
        'We found a tree. It is purple. I named it Steve.',
        `Thank you for flying us. — ${who} ${family}`,
      ],
    },
    year50: {
      subject: 'fifty years',
      body: (who: string, age: number): string[] => [
        `It's ${who} again. I'm ${age} now.`,
        'My grandson flies kites off the hill. Steve is very tall.',
      ],
    },
    year200: {
      subject: 'two hundred years',
      body: (colony: string, who: string, people: number): string[] => [
        `${colony} is ${formatCount(people)} people now.`,
        `The school still reads ${who}'s first letter to you.`,
      ],
    },
    // A joined card's separator line between two bodies.
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
