// The INBOX's types (05-story §3.3–§3.5, §4; slice-3b-plan §2.2, §2.4). Track UI owns this file after the foundation
// (systems/inbox.ts derives the messages). Only RunInboxState is stored on the run, and it is JSON-safe: 3c saves
// `run.inbox.read`; every message re-derives from the route, the map and the ships.

// Slice 7d (R39) adds 'old-colony': the old colony `?` ship's letter, from a colony of a unit long before. (The signal is a
// file in rack A, not mail: R39.)
export type MessageKind = 'welcome' | 'policy' | 'arm-complete' | 'reply' | 'postcard' | 'letter' | 'no-address' | 'old-colony';

// One message, derived (systems/inbox.ts inboxMessages), never stored: only its id is (run.inbox.read).
export interface InboxMessage {
  id: string;                         // stable: 'welcome', 'reply:<slot>', 'postcard:<slot>:<depth>', 'noaddr:3', 'letter:meridian'
  kind: MessageKind;
  from: string;                       // FROM ARRIVAL CONTROL · EARTH / RIVERSIDE · Kepler-186f / (no address)
  sentYear: number | null;            // null: SENT ????
  receivedYear: number;
  readAtDepth: number;                // the boot it arrives at (route index + 1)
  subject: string;
  body: string[];                     // ≤ INBOX_BODY_MAX_LINES lines of ≤ 70 chars
  tag: string | null;                 // FOR UNIT-046
  tone: 'control' | 'colony' | 'hollow';
}

// The run's INBOX state (run.inbox): the message ids the kid has opened. 3c saves it.
export interface RunInboxState {
  read: string[];
}
