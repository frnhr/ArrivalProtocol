// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { Store } from '@state/store';
import type { GameState, RunState, ShipResult } from '@state/schema';
import type { RouteStop, RunMapState } from '@/types/map';
import type { InboxMessage } from '@/types/inbox';
import type { LetterSource } from '@/types/lineage';
import type { FeaturedColonist } from '@/types/landing';
import { lightArrival, type LightSource } from '@systems/delivery-rule';
import { armShipAt, isEndSlot, worldSlotOf } from '@systems/map-streams';
import { solLy, ringsCrossed } from '@systems/map-geometry';
import { WORLDS, RING_LY } from '@data/arm';
import { UNIT_046_TRAIL } from '@data/ship-names';
import { INBOX_TEXT, firstNameOf, familyOf } from '@data/inbox-text';
import { REPO_FILE_TEXT } from '@data/repo-text';
import { firstDeskRecommendation } from '@systems/repository';
import {
  WELCOME_SENT_BEFORE_START_YEARS, POSTCARD_COLONY_YEARS, INBOX_BODY_MAX_LINES, POSTCARD_PEOPLE_PER_COLONIST_Y200, POSTCARD_AGE_SHOWN_MAX,
  REPLY_STALE_AFTER_SHIPS, MAX_LINE_CHARS,
} from '@data/tuning';

// The INBOX (05-story §3.3–§3.5, §4; slice-3b-plan §2.4): messages are DERIVED, never queued. inboxMessages builds them
// from the route, run.ships (colony, landed, featured), the map and the lineage, up to the current stop. Stored state is
// only run.inbox.read and run.log.toldReading, which 3c saves. The arm only: the classic world has no mail.
// Two timing rules (the foundation's review follow-up):
// • broadcasts (the welcome, the policy reminders, the arm-complete letter) ride the unit's own beam: they are read at the
//   boot they belong to, RECEIVED = sent + the ship's distance from SOL;
// • replies, postcards and letters ride direct light (systems/delivery-rule.ts lightArrival): a message sent from P in
//   year T is read at the first route stop X after the sending stop with A(X) ≥ T + |P − X|.
// 046's no-address mail is RECEIVED in the year the beam crossed its ring (plan risk 8).
// Every id is a stable key from the source (`reply:<slot>`, `postcard:<slot>:1+50`), never text or a list index: the read
// marks (3c's save) name them. A joined postcard's group never changes once it exists (a message's boot is the first stop
// that takes it, and the route only grows).
// CYCLE GUARD (plan §5.4): this module never imports data/script.ts or systems/arrival-preview.ts, directly or through
// another module (script.ts's boot plan reads newMessagesAtBoot).

// ARRIVAL CONTROL's words for a report, by its stars (05 §3.4: it is delighted by everything; ★★★ is the best it knows).
const PERFORMANCE_BY_STARS: readonly (keyof typeof INBOX_TEXT.reply.performance)[] = ['poor', 'fair', 'fair', 'good'];

// The file the welcome recommends: the first desk's tag (repository.ts firstDeskRecommendation: Mv on run 1, Swap on a later
// run with an ENGINE FAULT ship in reach of ship 1), so the welcome and the first desk always agree.
function welcomeRecommends(map: Readonly<RunMapState>): string {
  return REPO_FILE_TEXT[firstDeskRecommendation(map)].boot;
}

// --- The derivation, memoised ------------------------------------------------------------------------------------------

// boot.ts's plannedText('inbox') re-derives on every timing call, and every view asks per paint: the messages only change
// when the route grows or a ship ends (plan follow-up), so one result is kept per key of everything they read.
let memoKey = '';
let memo: InboxMessage[] = [];

function derivationKey(run: Readonly<RunState>): string {
  const map = run.map;
  const route = map.route.map((stop) => stop.slot).join(',');
  const ships = run.ships.map((ship) => `${ship.slot}:${ship.depth}:${ship.landedInLz}:${ship.stars}:${ship.colony ?? ''}`).join(',');
  return `${map.run}|${map.armSeed}|${map.startYear}|${run.unitNumber}|${route}|${ships}`;
}

// Every message the unit has received so far this run, oldest boot first (within a boot, by year received).
export function inboxMessages(state: Readonly<GameState>): InboxMessage[] {
  if (state.run.map.world !== 'arm') return [];
  const key = derivationKey(state.run);
  if (key !== memoKey) {
    memo = deriveMessages(state.run);
    memoKey = key;
  }
  return memo;
}

function deriveMessages(run: Readonly<RunState>): InboxMessage[] {
  const map = run.map;
  const route = map.route;
  const policies = policiesInReplies(run);
  const messages: InboxMessage[] = [
    ...broadcasts(run, policies),
    ...replies(run, policies),
    ...postcards(run),
    ...letters(run),
  ];
  const order: Readonly<Record<InboxMessage['kind'], number>> = {
    welcome: 0, policy: 1, 'arm-complete': 2, reply: 3, postcard: 4, letter: 5, 'no-address': 6,
  };
  for (const message of messages) checkMessage(message);
  return messages
    .filter((message) => message.readAtDepth <= route.length)
    .sort((a, b) => a.readAtDepth - b.readAtDepth || a.receivedYear - b.receivedYear || order[a.kind] - order[b.kind] || (a.id < b.id ? -1 : 1));
}

// Fail loudly on a message the reader could not show whole (05 §3.3: at most 6 body lines, each one strip row).
function checkMessage(message: Readonly<InboxMessage>): void {
  if (message.body.length > INBOX_BODY_MAX_LINES) throw new Error(`inbox: ${message.id} has ${message.body.length} body lines (at most ${INBOX_BODY_MAX_LINES})`);
  for (const line of [message.subject, message.from, ...message.body]) {
    if (line.length > MAX_LINE_CHARS) throw new Error(`inbox: ${message.id} has a line of ${line.length} characters: ${line}`);
  }
}

// The approach year at a stop (the galaxy year while the unit was there).
function stopYear(map: Readonly<RunMapState>, stop: Readonly<RouteStop>): number {
  return stop.hop !== null ? stop.hop.approachYear : armShipAt(map, stop.slot).approachYear;
}

function stopSol(map: Readonly<RunMapState>, stop: Readonly<RouteStop>): number {
  return solLy(worldSlotOf(map, stop.slot));
}

// --- ARRIVAL CONTROL's broadcasts and 046's no-address mail (by the boots) ---------------------------------------------

function broadcasts(run: Readonly<RunState>, policiesInReplies: ReadonlyMap<number, number>): InboxMessage[] {
  const map = run.map;
  const sent = map.startYear - WELCOME_SENT_BEFORE_START_YEARS;
  const out: InboxMessage[] = [];
  map.route.forEach((stop, index) => {
    const sol = stopSol(map, stop);
    const received = sent + sol;
    const control = (id: string, kind: InboxMessage['kind'], subject: string, body: string[]): InboxMessage => ({
      id, kind, from: INBOX_TEXT.from.control, sentYear: sent, receivedYear: received, readAtDepth: stop.depth, subject, body,
      tag: null, tone: 'control',
    });
    if (stop.depth === 1) {
      out.push(control('welcome', 'welcome', INBOX_TEXT.welcome.subject(run.unitNumber), INBOX_TEXT.welcome.body(map.arm.length, welcomeRecommends(map))));
    }
    // The rings this boot's beam crossed (the first ship: from SOL).
    const prev = index === 0 ? null : map.route[index - 1]!;
    const prevSol = prev === null ? 0 : stopSol(map, prev);
    for (const ring of ringsCrossed(prevSol, sol)) {
      const n = ring + 1;
      const policy = POLICY_RINGS.indexOf(n);
      if (policy >= 0 && policiesInReplies.get(stop.depth) !== n) {
        const text = INBOX_TEXT.policy[policy]!;
        out.push(control(`policy:${n}`, 'policy', text.subject, text.body(run.unitNumber)));
      }
      const noAddress = NO_ADDRESS_RINGS.indexOf(n);
      if (noAddress >= 0) {
        const text = INBOX_TEXT.noAddress[noAddress]!;
        out.push({
          id: `noaddr:${n}`, kind: 'no-address', from: INBOX_TEXT.from.noAddress, sentYear: null,
          receivedYear: ringCrossYear(stop, prevSol, sol, RING_LY[ring]!, stopYear(map, stop)), readAtDepth: stop.depth,
          subject: text.subject, body: [...text.body], tag: null, tone: 'hollow',
        });
      }
    }
    if (isEndSlot(map, stop.slot)) {
      out.push(control('arm-complete', 'arm-complete', INBOX_TEXT.armComplete.subject, INBOX_TEXT.armComplete.body(relayAfter(run.unitNumber))));
    }
  });
  return out;
}

// 05 §3.3: policy reminders at the boots crossing rings 2 and 4, 046's no-address mail at rings 3 and 5 (acts II and III).
const POLICY_RINGS: readonly number[] = [2, 4];
const NO_ADDRESS_RINGS: readonly number[] = [3, 5];
if (POLICY_RINGS.length !== INBOX_TEXT.policy.length || NO_ADDRESS_RINGS.length !== INBOX_TEXT.noAddress.length) {
  throw new Error('inbox: one policy reminder and one no-address letter per ring that sends one');
}

// The year the beam into `stop` crossed the ring `ringLy` LY from SOL: along the hop, by the share of its distance from
// SOL (whole years, 02 §3.1). The first ship has no hop: its approach.
function ringCrossYear(stop: Readonly<RouteStop>, fromSol: number, toSol: number, ringLy: number, fallback: number): number {
  const hop = stop.hop;
  if (hop === null || toSol === fromSol) return fallback;
  return hop.leaveYear + Math.round((hop.distanceLy * (ringLy - fromSol)) / (toSol - fromSol));
}

// The relay the arm-complete letter posts the unit to (05 §3.12): 046 went to RELAY 19, so 047's next post is RELAY 20.
const RELAY_OF_046 = 19;
const UNIT_046 = 46;
function relayAfter(unit: number): number {
  return RELAY_OF_046 + (unit - UNIT_046);
}

// --- ARRIVAL CONTROL's replies (one per ended non-final ship, from SOL when its report arrives) ------------------------

// One reply's facts: the ship it answers, when it was sent, where it is read, and its words.
interface ReplyDue {
  ship: Readonly<ShipResult>;
  sent: number;
  read: { depth: number; receivedYear: number };
}

function repliesDue(run: Readonly<RunState>): ReplyDue[] {
  const map = run.map;
  return run.ships.flatMap((ship): ReplyDue[] => {
    if (isEndSlot(map, ship.slot)) return [];
    const stop = map.route[ship.depth - 1];
    if (stop === undefined || stop.slot !== ship.slot) throw new Error(`inbox: ${ship.shipName} (depth ${ship.depth}) is not on the route`);
    const sent = stopYear(map, stop) + stopSol(map, stop);
    const read = lightArrival(map, { kind: 'sol' }, sent, map.route, ship.depth);
    return read === null ? [] : [{ ship, sent, read }];
  });
}

// CONTROL's replies, at most ONE per boot (slice 3b review m8: the INBOX ran to 21 messages, 5 at a boot): the reports
// whose replies reach the same boot are answered in one memo (the first's greeting, the colonists of all of them, the
// best performance), and a policy reminder due at that boot rides in it as a postscript instead of a memo of its own
// (`policies`: the boots' reminders, which broadcasts() then leaves out). The memo keeps the latest reply's stamps.
function replies(run: Readonly<RunState>, policies: ReadonlyMap<number, number>): InboxMessage[] {
  const byBoot = new Map<number, ReplyDue[]>();
  for (const due of repliesDue(run)) byBoot.set(due.read.depth, [...(byBoot.get(due.read.depth) ?? []), due]);
  return [...byBoot.entries()].map(([depth, group]): InboxMessage => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    // Read two or more ships after its ship, CONTROL still writes to the unit before you (05 §3.4's stale greeting).
    const greet = depth - first.ship.depth >= REPLY_STALE_AFTER_SHIPS ? run.unitNumber - 1 : run.unitNumber;
    const stars = Math.max(...group.map((due) => due.ship.stars));
    const performance = INBOX_TEXT.reply.performance[PERFORMANCE_BY_STARS[Math.min(3, Math.max(0, stars))]!];
    const landed = group.reduce((sum, due) => sum + due.ship.landedInLz, 0);
    const policy = policies.get(depth);
    const postscript = policy === undefined ? [] : INBOX_TEXT.policy[POLICY_RINGS.indexOf(policy)]!.postscript;
    const names = group.map((due) => due.ship.shipName);
    return {
      id: `reply:${group.map((due) => due.ship.slot).join('+')}${policy === undefined ? '' : `+policy:${policy}`}`,
      kind: 'reply', from: INBOX_TEXT.from.control, sentYear: last.sent, receivedYear: last.read.receivedYear, readAtDepth: depth,
      subject: INBOX_TEXT.reply.subject(names), body: INBOX_TEXT.reply.body(greet, landed, performance, names.length, postscript),
      tag: null, tone: 'control',
    };
  });
}

// The boots (depth → ring) whose policy reminder rides in a reply: a reply reaches that boot too.
function policiesInReplies(run: Readonly<RunState>): Map<number, number> {
  const replyBoots = new Set(repliesDue(run).map((due) => due.read.depth));
  const out = new Map<number, number>();
  run.map.route.forEach((stop, index) => {
    const prev = index === 0 ? null : run.map.route[index - 1]!;
    const prevSol = prev === null ? 0 : stopSol(run.map, prev);
    for (const ring of ringsCrossed(prevSol, stopSol(run.map, stop))) {
      if (POLICY_RINGS.includes(ring + 1) && replyBoots.has(stop.depth)) out.set(stop.depth, ring + 1);
    }
  });
  return out;
}

// --- Colony postcards (colony years 1, 50, 200; two or more at one boot joined) -----------------------------------------

// The colonist who writes a colony's cards (05 §3.3: "a featured colonist"): the first featured one of the first pod down
// in an LZ. A colony with landed colonists always has one (every pod carries featured colonists).
function writerOf(ship: Readonly<ShipResult>): FeaturedColonist {
  const pod = ship.pods.find((candidate) => candidate.lz !== null && candidate.featured.length > 0);
  if (pod === undefined) throw new Error(`inbox: ${ship.shipName} landed ${ship.landedInLz} in an LZ but no pod there has a featured colonist`);
  return pod.featured[0]!;
}

function postcards(run: Readonly<RunState>): InboxMessage[] {
  const map = run.map;
  return run.ships.flatMap((ship): InboxMessage[] => {
    if (ship.landedInLz <= 0 || ship.colony === null) return [];
    const stop = map.route[ship.depth - 1];
    if (stop === undefined || stop.slot !== ship.slot) throw new Error(`inbox: ${ship.shipName} (depth ${ship.depth}) is not on the route`);
    const landed = stopYear(map, stop);
    const worldSlot = worldSlotOf(map, ship.slot);
    const source: LightSource = { kind: 'world', worldSlot };
    const writer = writerOf(ship);
    const who = firstNameOf(writer.name);
    const family = familyOf(writer.name);
    const colony = ship.colony;
    // Each card and the boot it is read at; those at one boot join (05 §3.3: the year-1 card is never skipped).
    const cards = POSTCARD_COLONY_YEARS.flatMap((year) => {
      const sent = landed + year;
      const read = lightArrival(map, source, sent, map.route, ship.depth);
      return read === null ? [] : [{ year, sent, read }];
    });
    const byBoot = new Map<number, typeof cards>();
    for (const card of cards) byBoot.set(card.read.depth, [...(byBoot.get(card.read.depth) ?? []), card]);
    return [...byBoot.values()].map((group): InboxMessage => {
      const bodies = group.map((card) => postcardBody(card.year, colony, who, family, writer.age + card.year, ship.landedInLz));
      const first = group[0]!;
      const last = group[group.length - 1]!;
      return {
        id: `postcard:${ship.slot}:${group.map((card) => card.year).join('+')}`, kind: 'postcard',
        from: INBOX_TEXT.from.colony(colony, WORLDS[worldSlot]!.name), sentYear: first.sent, receivedYear: last.read.receivedYear,
        readAtDepth: first.read.depth, subject: postcardSubject(first.year), body: joinBodies(bodies), tag: null, tone: 'colony',
      };
    });
  });
}

function postcardSubject(year: number): string {
  const text = INBOX_TEXT.postcard;
  return year === 1 ? text.year1.subject : year === 50 ? text.year50.subject : text.year200.subject;
}

// `age`: the writer's age in that colony year (their age at landing plus the years: review m6).
function postcardBody(year: number, colony: string, who: string, family: string, age: number, landed: number): string[] {
  const text = INBOX_TEXT.postcard;
  if (year === 1) return text.year1.body(who, family, age);
  if (year === 50) return text.year50.body(who, age <= POSTCARD_AGE_SHOWN_MAX ? age : null);
  if (year === 200) return text.year200.body(colony, who, landed * POSTCARD_PEOPLE_PER_COLONIST_Y200);
  throw new Error(`inbox: no postcard for colony year ${year}`);
}

// Joined cards: the bodies one after another, a separator between them while the whole still fits the reader (05 §3.3's
// six lines), else without.
export function joinBodies(bodies: readonly (readonly string[])[]): string[] {
  const separated = bodies.flatMap((body, index) => (index === 0 ? [...body] : [INBOX_TEXT.postcard.joined, ...body]));
  return separated.length <= INBOX_BODY_MAX_LINES ? separated : bodies.flatMap((body) => [...body]);
}

// --- Letters to the unit ahead (05 §3.3) ---------------------------------------------------------------------------------

function letters(run: Readonly<RunState>): InboxMessage[] {
  const map = run.map;
  return letterSources(run).flatMap((letter): InboxMessage[] => {
    const sent = letter.landedYear + 1;
    const read = lightArrival(map, { kind: 'world', worldSlot: letter.worldSlot }, sent, map.route, 0);
    if (read === null) return [];
    const meridian = letter.id === 'letter:meridian';
    return [{
      id: letter.id, kind: 'letter', from: INBOX_TEXT.from.colony(letter.colony, WORLDS[letter.worldSlot]!.name),
      sentYear: sent, receivedYear: read.receivedYear, readAtDepth: read.depth,
      subject: meridian ? INBOX_TEXT.letter.meridianSubject : INBOX_TEXT.letter.subject(letter.toUnit),
      body: meridian ? [...INBOX_TEXT.letter.meridian] : [], tag: INBOX_TEXT.window.forUnit(letter.toUnit), tone: 'colony',
    }];
  });
}

// --- The views' and the boot's reads -----------------------------------------------------------------------------------

// The messages this boot brings (the boot's `> n NEW MESSAGES · INBOX` line): those read at the current depth.
export function newMessagesAtBoot(state: Readonly<GameState>): InboxMessage[] {
  const depth = state.run.shipIndex + 1;
  return inboxMessages(state).filter((message) => message.readAtDepth === depth);
}

// The messages received and not yet opened (the dock's and the desk tab's `INBOX n` badge; unread in bold).
export function inboxUnread(state: Readonly<GameState>): InboxMessage[] {
  return inboxMessages(state).filter((message) => !state.run.inbox.read.includes(message.id));
}

// The kid opened message `id` in the reader. Opening one twice changes nothing; an id the INBOX does not hold is a bug in
// the view, so it throws.
export function markMessageRead(store: Store<GameState>, id: string): void {
  const state = store.getState();
  if (!inboxMessages(state).some((message) => message.id === id)) throw new Error(`markMessageRead: no message '${id}' in the INBOX`);
  if (state.run.inbox.read.includes(id)) return;
  store.update((draft) => { draft.run.inbox.read.push(id); });
}

// A letter to the unit ahead (05 §3.3): types/lineage.ts LetterSource (moved there in slice 3c; its id is saved in
// run.inbox.read). From run 2 systems/lineage.ts letterSourcesFromTrail makes them (Track UI wires it here).

// The seam 3c fills from archive v2 (plan §2.6). Run 1: 046's written trail's MERIDIAN writes to 046 (05 §3.3: "the first
// instance of letters to the unit ahead"), read by 047, who is not 46.
export function letterSources(run: Readonly<RunState>): LetterSource[] {
  if (run.map.world !== 'arm' || run.map.run !== 1) return [];
  const meridian = UNIT_046_TRAIL.find((mark) => mark.colony === 'MERIDIAN');
  if (meridian === undefined || meridian.colony === null) throw new Error('letterSources: 046\'s written trail lost MERIDIAN');
  return [{ id: 'letter:meridian', colony: meridian.colony, worldSlot: meridian.slot, landedYear: meridian.year, toUnit: UNIT_046, writer: null }];
}
