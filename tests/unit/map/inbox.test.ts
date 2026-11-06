// Slice 3b Track UI: the INBOX's derivation (systems/inbox.ts; 05-story §3.3–§3.5, §3.12; slice-3b-plan §2.4, §4.3), pure
// on a crafted run: run 1's arm along the worked route (ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT → LAST LIGHT)
// with a fixture of ShipResults in which every ship lands someone. Pins §4.3's table boot by boot (one CONTROL memo a boot
// since the review, m8: a policy reminder rides in a reply at the same boot), the stamps, the joined
// postcards, no postcard without landed colonists, the stale greeting, the ring crossings of a two-layer hop, arm only,
// stable ids, the read marks, and HOLLOW's reading line once a run.
import { check, finish } from '../landing/checks';
import { createStore } from '@state/store';
import type { GameState, ShipResult } from '@state/schema';
import type { RouteStop, RunMapState } from '@/types/map';
import type { InboxMessage } from '@/types/inbox';
import { createInitialState } from '@state/initial';
import { inboxMessages, newMessagesAtBoot, inboxUnread, markMessageRead, joinBodies } from '@systems/inbox';
import { readingLineDue } from '@state/log-selectors';
import { bootLinePlan } from '@data/script';
import { hopBetween } from '@systems/map-hop';
import { INBOX_TEXT } from '@data/inbox-text';
import { INBOX_BODY_MAX_LINES, MAX_LINE_CHARS } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from './run1-fixture';

const NAMES = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'CORMORANT', 'LAST LIGHT'];
const COLONIES = ['RIVERSIDE', 'OKAFOR LANDING', 'HARBOUR', 'ORCHARD', 'SALTMARSH', 'FIRST LIGHT'];

function result(depth: number, landed: number, stars = 2): ShipResult {
  const slot = WORKED_ROUTE[depth - 1]!;
  return {
    shipId: `ship-${slot}`, shipName: NAMES[depth - 1]!, slot, depth, outcome: 'locked', stars, fuelLeftPct: 30, ringMiss: null,
    colonistsAboard: landed, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: landed,
    points: landed, colony: landed > 0 ? COLONIES[depth - 1]! : null,
    pods: [{
      pod: 1, family: 'Okafor', colonists: landed, fate: 'down', place: null, lz: landed > 0 ? 'LZ-A' : null, touch: null,
      points: landed, parkedWhy: null, restored: false, featured: [{ name: 'Okafor, Ada', age: 11 }, { name: 'Okafor, Ben', age: 40 }],
    }],
  };
}

// The run at depth `depth` (the unit on that ship), the ships before it ended, at the desk after it when `ended`.
function runAt(depth: number, ended: boolean, landed = (d: number) => 200 * d): GameState {
  const state = createInitialState({ seed: 1, shipIndex: 0, phase: 'desk', map: run1Map() });
  const map: RunMapState = state.run.map;
  map.route = WORKED_ROUTE.slice(0, depth).map((slot, i): RouteStop => ({
    slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, WORKED_ROUTE[i - 1]!, slot),
  }));
  map.galaxyYear = map.route[depth - 1]!.hop?.approachYear ?? map.startYear;
  state.run.shipIndex = depth - 1;
  state.run.ships = Array.from({ length: ended ? depth : depth - 1 }, (_, i) => result(i + 1, landed(i + 1)));
  return state;
}

const at = (messages: readonly InboxMessage[], depth: number): InboxMessage[] => messages.filter((m) => m.readAtDepth === depth);
const ids = (messages: readonly InboxMessage[]): string => messages.map((m) => m.id).sort().join(' ');
const want = (list: string): string => list.split(' ').sort().join(' ');
const stamp = (m: InboxMessage | undefined): string => (m === undefined ? 'none' : INBOX_TEXT.window.stamps(m.sentYear, m.receivedYear));
const byId = (messages: readonly InboxMessage[], id: string): InboxMessage | undefined => messages.find((m) => m.id === id);

// The whole run at LAST LIGHT's boot (every ship before it ended, every one landed someone).
const final = createStore<GameState>(runAt(6, false));
const all = inboxMessages(final.getState());
const [ARES, HALCYON, KESTREL, VESPER, CORMORANT] = WORKED_ROUTE as [number, number, number, number, number, number];

for (let depth = 1; depth <= 6; depth++) console.log(`INFO  boot ${depth} (${NAMES[depth - 1]}): ${at(all, depth).length} · ${ids(at(all, depth))}`);
console.log(`INFO  ${all.length} messages on the worked route (05 §3.3 estimated 10; plan risk 7)`);

check('ARES-VII: the welcome, SENT 2280 · RECEIVED 2288',
  ids(at(all, 1)) === want('welcome') && stamp(byId(all, 'welcome')) === 'SENT 2280 · RECEIVED 2288', ids(at(all, 1)));
check('…it recommends mv and is ARRIVAL CONTROL\'s (FROM, subject, sign-off)',
  byId(all, 'welcome')!.body.some((line) => line.includes('Recommended for you: mv :)')) && byId(all, 'welcome')!.from === INBOX_TEXT.from.control
  && byId(all, 'welcome')!.subject === 'Welcome, Unit 47! :)');
check('HALCYON: the reply to ARES-VII (2308 / 2337) and RIVERSIDE year 1 (2301 / 2322)',
  ids(at(all, 2)) === want(`postcard:${ARES}:1 reply:${ARES}`) && stamp(byId(all, `reply:${ARES}`)) === 'SENT 2308 · RECEIVED 2337'
  && stamp(byId(all, `postcard:${ARES}:1`)) === 'SENT 2301 · RECEIVED 2322', ids(at(all, 2)));
check("…RIVERSIDE's card: FROM `RIVERSIDE · <world>`, `we're down!`, signed by its first featured colonist",
  byId(all, `postcard:${ARES}:1`)!.from.startsWith('RIVERSIDE · ') && byId(all, `postcard:${ARES}:1`)!.subject === "we're down!"
  && byId(all, `postcard:${ARES}:1`)!.body.some((line) => line.includes('— Ada Okafor')));
check("…its writer's age in that colony year (review m6): Ada landed at 11, so `I'm 12 now` at year 1 and `I'm 61 now` at year 50",
  byId(all, `postcard:${ARES}:1`)!.body.some((line) => line.includes("It's Ada. I'm 12 now."))
  && byId(all, `postcard:${ARES}:50`)!.body.some((line) => line.includes("I'm 61 now")));
check('KESTREL: the reply to HALCYON (2381 / 2436) with ring 2\'s policy reminder as its postscript (one CONTROL memo a boot), RIVERSIDE y50 (2350 / 2397), HALCYON\'s colony y1 + y50 joined, MERIDIAN → 046 (2351 / 2380)',
  ids(at(all, 3)) === want(`letter:meridian postcard:${ARES}:50 postcard:${HALCYON}:1+50 reply:${HALCYON}+policy:2`)
  && stamp(byId(all, `reply:${HALCYON}+policy:2`)) === 'SENT 2381 · RECEIVED 2436'
  && INBOX_TEXT.policy[0]!.postscript.every((line) => byId(all, `reply:${HALCYON}+policy:2`)!.body.includes(line)) && stamp(byId(all, `postcard:${ARES}:50`)) === 'SENT 2350 · RECEIVED 2397'
  && stamp(byId(all, 'letter:meridian')) === 'SENT 2351 · RECEIVED 2380', ids(at(all, 3)));
check('VESPER: RIVERSIDE y200 (2500 / 2600), KESTREL\'s colony y1 + y50, no-address (ring 3), policy (ring 4)',
  ids(at(all, 4)) === want(`noaddr:3 policy:4 postcard:${ARES}:200 postcard:${KESTREL}:1+50`) && stamp(byId(all, `postcard:${ARES}:200`)) === 'SENT 2500 · RECEIVED 2600',
  ids(at(all, 4)));
check('CORMORANT: the reply to KESTREL (2522 / 2651, `Dear Unit 46`), HALCYON\'s y200, KESTREL\'s y200, VESPER\'s y1 + y50, no-address (ring 5)',
  ids(at(all, 5)) === want(`noaddr:5 postcard:${HALCYON}:200 postcard:${KESTREL}:200 postcard:${VESPER}:1+50 reply:${KESTREL}`)
  && stamp(byId(all, `reply:${KESTREL}`)) === 'SENT 2522 · RECEIVED 2651' && byId(all, `reply:${KESTREL}`)!.body[0] === 'Dear Unit 46,',
  ids(at(all, 5)));
check('LAST LIGHT: the reply to VESPER (2732 / 2912), VESPER\'s y200, CORMORANT\'s y1 + y50, arm-complete (2280 / 2460)',
  ids(at(all, 6)) === want(`arm-complete postcard:${CORMORANT}:1+50 postcard:${VESPER}:200 reply:${VESPER}`)
  && stamp(byId(all, `reply:${VESPER}`)) === 'SENT 2732 · RECEIVED 2912' && stamp(byId(all, 'arm-complete')) === 'SENT 2280 · RECEIVED 2460',
  ids(at(all, 6)));
check('…no reply to CORMORANT reaches LAST LIGHT (2946 + 180 > 3020)', byId(all, `reply:${CORMORANT}`) === undefined);
check('20 messages in all (plan risk 7; review m8: one CONTROL memo a boot, from 21)', all.length === 20, String(all.length));
check('…at most one CONTROL reply at any boot', [1, 2, 3, 4, 5, 6].every((depth) => at(all, depth).filter((m) => m.kind === 'reply').length <= 1));

// Stamps and joins.
const joined = byId(all, `postcard:${HALCYON}:1+50`)!;
check('a joined card: the first card\'s subject, the first SENT and the last RECEIVED, both bodies with a separator',
  joined.subject === "we're down!" && joined.sentYear === 2353 && joined.receivedYear === 2428
  && joined.body.includes(INBOX_TEXT.postcard.joined), stamp(joined));
const noaddr = byId(all, 'noaddr:3')!;
check('no-address mail: FROM (no address), SENT ????, RECEIVED the year the beam crossed ring 3 (2481), in HOLLOW\'s tone',
  noaddr.from === '(no address)' && stamp(noaddr) === 'SENT ???? · RECEIVED 2481' && noaddr.tone === 'hollow', stamp(noaddr));
check('the MERIDIAN letter carries FOR UNIT-046', byId(all, 'letter:meridian')!.tag === 'FOR UNIT-046');
check('a reply read one ship later greets this unit (Dear Unit 47)', byId(all, `reply:${ARES}`)!.body[0] === 'Dear Unit 47,');
check('every message fits the reader: at most 6 body lines of at most 70 characters',
  all.every((m) => m.body.length <= INBOX_BODY_MAX_LINES && [m.subject, m.from, ...m.body].every((line) => line.length <= MAX_LINE_CHARS)));
check('three cards at one boot still fit (separators dropped)',
  joinBodies([INBOX_TEXT.postcard.year1.body('Ada', 'Okafor', 12), INBOX_TEXT.postcard.year50.body('Ada', 61), INBOX_TEXT.postcard.year200.body('X', 'Ada', 1)]).length <= INBOX_BODY_MAX_LINES);

// No postcard without landed colonists; the reply still comes.
const noLand = inboxMessages(runAt(6, false, (d) => (d === 2 ? 0 : 200 * d)));
check('HALCYON landed nobody: no card from it ever, CONTROL still replies',
  !noLand.some((m) => m.id.startsWith(`postcard:${HALCYON}:`)) && noLand.some((m) => m.id.startsWith(`reply:${HALCYON}`)));

// Up to the current stop only; stable ids as the route grows.
const atKestrel = inboxMessages(runAt(3, false));
check('at KESTREL\'s boot the INBOX holds boots 1–3 only, with the same ids as at the end',
  Math.max(...atKestrel.map((m) => m.readAtDepth)) === 3 && atKestrel.every((m) => byId(all, m.id)?.readAtDepth === m.readAtDepth)
  && ids(atKestrel) === ids(all.filter((m) => m.readAtDepth <= 3)));
check('newMessagesAtBoot at KESTREL: its four', newMessagesAtBoot(runAt(3, false)).length === 4);

// A two-layer hop crosses two rings: ARES-VII (8 LY) → KESTREL (55 LY) crosses rings 1 and 2: one policy reminder.
const skip = runAt(1, true);
skip.run.map.route.push({ slot: KESTREL, depth: 2, hop: hopBetween(skip.run.map, ARES, KESTREL) });
skip.run.shipIndex = 1;
check('a two-layer hop (ARES-VII → KESTREL) brings ring 2\'s policy reminder at its boot (in the reply to ARES-VII there)',
  byId(inboxMessages(skip), `reply:${ARES}+policy:2`)?.readAtDepth === 2, ids(inboxMessages(skip)));

// The read marks and the unread list.
check('unread: everything at first', inboxUnread(final.getState()).length === all.length);
markMessageRead(final, 'welcome');
markMessageRead(final, 'welcome');
check('markMessageRead marks once; the badge counts one fewer', final.getState().run.inbox.read.join() === 'welcome'
  && inboxUnread(final.getState()).length === all.length - 1);
let threw = false;
try { markMessageRead(final, 'nope'); } catch { threw = true; }
check('…an id the INBOX does not hold throws', threw);

// The classic world has no mail and no INBOX line.
const classic = createInitialState({ seed: 1, shipIndex: 0, phase: 'boot' });
check('the classic world: no messages, no `inbox` boot line', inboxMessages(classic).length === 0 && !bootLinePlan(classic, 0).includes('inbox'));
const ship1 = runAt(1, false);
check('the arm\'s first boot plans the INBOX line', bootLinePlan(ship1, 0).includes('inbox'));

// HOLLOW's reading line: once entry 05 is read, once a run, on the arm.
const reading = runAt(4, false);
check('the reading line: not due before entry 05 is read', !readingLineDue(reading));
reading.run.log.read = [1, 2, 3, 4, 5];
check('…due once it is read (and planned before the log line)', readingLineDue(reading) && bootLinePlan(reading, 0).includes('reading'));
reading.run.log.toldReading = true;
check('…never again once said', !readingLineDue(reading));
const classicRead = createInitialState({ seed: 1, shipIndex: 0, phase: 'boot' });
classicRead.run.log.read = [5];
check('…never on the classic world', !readingLineDue(classicRead));

finish();
