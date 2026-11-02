// Slice 3c Track UI: letters to the unit ahead in the INBOX (systems/inbox.ts letterSources → systems/lineage.ts
// letterSourcesFromTrail; 05-story §3.3, §4; 3c plan §3 step 3, risk 11), pure on §3.14's run-2 fixture: one letter per
// colony of UNIT-047's route, `for unit 47`, tagged `FOR UNIT-047`, signed by the trail stop's writer at their age in colony
// year 1 (`Dear 47, it's Amara from RIVERSIDE. I'm 12 now.`), read by the light rule (RIVERSIDE's at ARES-VIII's boot:
// `SENT 2301 · RECEIVED 2301` at gap 1), ids pinned for the save (`letter:1:0`), the derivation's memo keyed by the last
// unit too (the foundation review's note), and none without an archive's trail. Prints the INBOX's count per boot (risk 11).
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RouteStop, RunMapState } from '@/types/map';
import type { LastUnit } from '@/types/lineage';
import { createInitialState } from '@state/initial';
import { inboxMessages, letterSources } from '@systems/inbox';
import { hopBetween } from '@systems/map-hop';
import { INBOX_TEXT } from '@data/inbox-text';
import { INBOX_BODY_MAX_LINES, MAX_LINE_CHARS } from '@data/tuning';
import { run2Map, RUN1_LAST_UNIT } from '../world/run2-fixture';

// Run 2 at the boot of the last ship of `route`, with the archive's last unit `last`.
function bootAt(route: readonly number[], last: LastUnit | null = RUN1_LAST_UNIT): GameState {
  const state = createInitialState({ seed: 1, shipIndex: 0, phase: 'boot', map: run2Map(1) });
  const map: RunMapState = state.run.map;
  map.route = route.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, route[i - 1]!, slot) }));
  map.galaxyYear = map.route.at(-1)!.hop?.approachYear ?? map.startYear;
  state.run.shipIndex = route.length - 1;
  state.run.lastUnit = last === null ? null : structuredClone(last);
  state.run.unitNumber = 48;
  return state;
}

const ROUTE = [0, 2, 5, 11, 15, 19] as const;
const first = bootAt([0]);
const sources = letterSources(first.run);
check('run 2: one letter source per colony of UNIT-047\'s route, ids `letter:1:<slot>`, to unit 47',
  sources.map((s) => s.id).join() === 'letter:1:0,letter:1:2,letter:1:5,letter:1:11,letter:1:15,letter:1:19' && sources.every((s) => s.toUnit === 47),
  sources.map((s) => s.id).join());
const riverside = inboxMessages(first).find((m) => m.id === 'letter:1:0');
check('…RIVERSIDE\'s letter is read at ARES-VIII\'s boot: `SENT 2301 · RECEIVED 2301`, `for unit 47`, tagged `FOR UNIT-047`',
  riverside !== undefined && riverside.readAtDepth === 1 && INBOX_TEXT.window.stamps(riverside.sentYear, riverside.receivedYear) === 'SENT 2301 · RECEIVED 2301'
  && riverside.subject === 'for unit 47' && riverside.tag === 'FOR UNIT-047' && riverside.kind === 'letter' && riverside.from === 'RIVERSIDE · Kepler-186f',
  JSON.stringify(riverside));
check('…signed by the trail\'s writer at colony year 1: `Dear 47, it\'s Amara from RIVERSIDE. I\'m 12 now.` … `— Amara Okafor`',
  riverside?.body[0] === "Dear 47, it's Amara from RIVERSIDE. I'm 12 now." && riverside.body.at(-1) === '— Amara Okafor', JSON.stringify(riverside?.body));

// The whole run: every letter arrives somewhere along the worked route (or never), at most one per colony.
const whole = ROUTE.map((_, i) => bootAt(ROUTE.slice(0, i + 1)));
const last = inboxMessages(whole.at(-1)!);
const letters = last.filter((m) => m.kind === 'letter');
check('along the route each colony writes at most once, every body fits the reader',
  new Set(letters.map((m) => m.id)).size === letters.length && letters.length <= sources.length
  && letters.every((m) => m.body.length <= INBOX_BODY_MAX_LINES && m.body.every((line) => line.length <= MAX_LINE_CHARS)),
  letters.map((m) => `${m.id}@${m.readAtDepth}`).join(' '));
const perBoot = ROUTE.map((_, i) => last.filter((m) => m.readAtDepth === i + 1).length);
console.log(`INFO  run 2 on the worked route's slots: ${last.length} messages, per boot ${perBoot.join(', ')}; letters ${letters.map((m) => `${m.id}@${m.readAtDepth}`).join(' ')}`);

// The memo (the foundation review's note): letters depend on the last unit, so a different one re-derives.
const withLetter = inboxMessages(first).some((m) => m.kind === 'letter');
const noArchive = bootAt([0], null);
const noTrail = bootAt([0], { ...structuredClone(RUN1_LAST_UNIT), trail: null });
check('no archive\'s trail, no letter (and the memo follows the last unit, not only the route)',
  withLetter && !inboxMessages(noArchive).some((m) => m.kind === 'letter') && !inboxMessages(noTrail).some((m) => m.kind === 'letter')
  && inboxMessages(first).some((m) => m.kind === 'letter'));
const fewer = structuredClone(RUN1_LAST_UNIT);
fewer.trail!.stops = fewer.trail!.stops.slice(1);
check('…a trail with one stop fewer drops RIVERSIDE\'s letter at the same route (the key counts the stops)',
  !inboxMessages(bootAt([0], fewer)).some((m) => m.id === 'letter:1:0'));
const noWriter = structuredClone(RUN1_LAST_UNIT);
noWriter.trail!.stops[0]!.writer = null;
const school = inboxMessages(bootAt([0], noWriter)).find((m) => m.id === 'letter:1:0');
check('…a stop with no writer is signed by the colony\'s school', school?.body[0] === 'Dear 47, it is the RIVERSIDE school. We all wrote this.',
  school?.body[0]);
finish();
