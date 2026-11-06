// WP11 spec item 1 (§4.2, §9 WP11): LAST LIGHT as data and as flown, headless.
// • the flight: an impact opener (IMPACT about 03:04 at ×30) with OUT engaged; ring 5,000–7,000; FUEL 2.5 km/s; ×30 / ×60;
// • the belt (WP9's belt kind) on racks A–B, drawn on the predicted path with its inside time and expected hits, and hits
//   that land only on files in racks A–B while the ship is inside;
// • the layout (slice 1a: 01-landing §3.16's final-ship layout): 16 pods, the 16-block root in rack C between POD 11
//   (a 2-block GAP) and POD 12 (a 1-block GAP), POD 13–16 at rack D's start and 32 free at its end; the flagship, the
//   last ship, with link 98 (slice 2: 046.log's 2 blocks given back) and 6 transit hits;
// • HOLLOW: spread 12, drain 5, ×2 burning, ×1.5 landing, seeds every 35 s into the walls, verbs every 12 s (3 s
//   countdown, every 4 s in the duel); its boot ends on `> last ship, 047. i'm so tired.`; CONTROL's own hello;
//   the MERGE 20 tick's data;
// • the lead's WP9 context: a verb's clock and its countdown, and the first seed, wait while the flight is at TACTICAL
//   (never under a NOW / KEEP HOLDING / RELEASE line); SKIP waits for the first verb (the coast is its stage).
import { check, finish } from '../wp1/harness';
import { createHarness11, LAST_LIGHT } from './harness11';
import { shipColonists } from '@data/memory';
import { mergeTickCharge } from '@systems/finale';
import { skipBlockReason } from '@systems/pace';
import { segmentStarts } from '@systems/memory-ops';
import { blocksInRack } from '@systems/zones';
import { bootLinePlan } from '@data/script';
import { HOLLOW_STORY } from '@data/hollow-text';
import { secUntil } from '@systems/predict';
import { onPostTick } from '@systems/clock';
import { isHollow } from '@state/selectors';
import { MERGE_COST_CHARGE } from '@data/tuning';
import { classicShip, CLASSIC_FIVE, CLASSIC_HOPS } from '@data/classic-five';
import type { GameState } from '@state/schema';
import { phase2HollowOf } from '../support/hollow-world';

const ship = classicShip(LAST_LIGHT);
check('LAST LIGHT is ship 5: the flagship and the last ship; 3,200 colonists in 16 pods; link 98, 6 hits, no arrival damage',
  ship.name === 'LAST LIGHT' && ship.final && (LAST_LIGHT === CLASSIC_FIVE.length - 1) && CLASSIC_FIVE.filter((candidate) => candidate.final).length === 1
  && shipColonists(ship) === 3200 && CLASSIC_HOPS[ship.slot]!.linkBlocks === 98 && CLASSIC_HOPS[ship.slot]!.transitHits === 6 && ship.arrivalDamage.length === 0);
const { start, ring, tacticalWarp, cruiseWarp, dvBudgetKmS } = ship.flight;
check('…§9 WP11 item 1\'s flight: r0 18,000, rp0 3,200, v∞ 1.5, ring 5,000–7,000, FUEL 2.5, ×30 / ×60, OUT engaged',
  start.r0 === 18000 && start.rp0 === 3200 && start.vInf === 1.5 && ring.min === 5000 && ring.max === 7000 && dvBudgetKmS === 2.5
  && tacticalWarp === 30 && cruiseWarp === 60 && start.sas === 'radial-out');
check('…its belt: 9,000–12,000 km on racks A–B', JSON.stringify(ship.zones) === JSON.stringify([{ kind: 'belt', id: 'last-light-belt', rIn: 9000, rOut: 12000, racks: ['A', 'B'] }]));
const hollow = phase2HollowOf(4);
// Unlink pass (Fran, after the handover): the ship's first verb counts 4 s (firstTelegraphSec), every later one 3 s.
check('…its HOLLOW: spread 12, drain 5, ×2 / ×1.5, seeds every 35 s in the walls, verbs { 12, 3 (first 4), 4 }, no deal, the last-ship story',
  hollow.spreadEverySec === 12 && hollow.drainPerSec === 5 && hollow.burnMult === 2 && hollow.landMult === 1.5
  && hollow.seed?.everySec === 35 && hollow.seed.target === 'walls'
  && JSON.stringify(hollow.verbs) === JSON.stringify({ everySec: 12, telegraphSec: 3, firstTelegraphSec: 4, duelEverySec: 4 })
  && !hollow.deal && hollow.story === 'last-ship');
check('…no other ship has verbs (the finale is the flagship\'s)', CLASSIC_FIVE.every((candidate, index) => (phase2HollowOf(index).verbs !== null) === candidate.final));

const h = createHarness11(7);
const state = (): Readonly<GameState> => h.store.getState();
h.lastLight(7);
{
  const memory = state().memory;
  const starts = segmentStarts(memory);
  const at = (id: string): number => starts[memory.findIndex((seg) => seg.id === id)]!;
  const souls = memory.filter((seg) => seg.type === 'driver');
  const root = memory.find((seg) => isHollow(seg) && seg.root)!;
  const rackC = 128;
  const rackD = 192;
  const pod11 = souls.find((seg) => seg.type === 'driver' && seg.pod === 11)!;
  const pod12 = souls.find((seg) => seg.type === 'driver' && seg.pod === 12)!;
  const pod13 = souls.find((seg) => seg.type === 'driver' && seg.pod === 13)!;
  check('the layout: 16 pods; the 16-block root in rack C, 2 free blocks from POD 11 and 1 from POD 12; POD 13 opens rack D',
    souls.length === 16 && root.size === 16 && at(root.id) >= rackC && at(root.id) < rackC + 64
    && at(root.id) - (at(pod11.id) + 8) === 2 && at(pod12.id) - (at(root.id) + 16) === 1 && at(pod13.id) === rackD,
    `root at ${at(root.id)}, POD 11 at ${at(pod11.id)}, POD 12 at ${at(pod12.id)}, POD 13 at ${at(pod13.id)}`);
  check('…POD 12 (right of the root) leads the credits', state().landing.lead === 12);
  check('…its boot plan closes on HOLLOW\'s line, which is `> last ship, 047. i\'m so tired.`',
    bootLinePlan({ ...state(), run: { ...state().run, arrival: { hits: [], chargeCarried: 0, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: 0, chargeOverflowLost: 0, eccCorrected: 0, scripted: [], seeds: [], boarded: null, deliveries: [], skills: [] } } }, 0).at(-1) === 'hollow'
    && HOLLOW_STORY.lastShip(47) === "> last ship, 047. i'm so tired.");
  check('…the MERGE 20 tick\'s data on the flagship (and none elsewhere)', mergeTickCharge(state()) === MERGE_COST_CHARGE);
}
h.step();
{
  const pred = h.pred();
  const impactTac = pred.impactInSec === null ? NaN : secUntil(pred, pred.impactInSec, state().clock.tSec) / tacticalWarp;
  check('the opener: an impact course, about IMPACT 03:04, at TACTICAL, `DON\'T HIT THE PLANET` on the strip',
    pred.outcome === 'impact' && Math.abs(impactTac - 184) < 3 && state().clock.pace === 'tactical' && /^DON'T HIT THE PLANET/.test(h.shown()?.text ?? ''),
    `${pred.outcome} ${impactTac.toFixed(1)} tac s, ${h.shown()?.text}`);
  const belt = pred.zoneHits.find((hit) => hit.kind === 'belt');
  check('…the belt is on the path ahead, with an inside time and expected hits', belt !== undefined && belt.enterInSec !== null && belt.insideSec > 0
    && belt.expectedHits > 2, JSON.stringify(belt));
  check('…CONTROL\'s own hello for the flagship', h.log().some((entry) => entry.speaker === 'control' && entry.text === 'Hello, Unit 47! The flagship is about to hit a planet. :)'));
}

// Flown by the strip-following kid with the defender, recording what the TACTICAL hold has to promise.
{
  h.lastLight(7);
  let verbUnderTactical = 0;
  let firstSeedUnderTactical = false;
  let verbsSeen = 0;
  let lastVerb: string | null = null;
  let skipBeforeFirstVerb = '';
  const off = onPostTick(() => {
    const s = state();
    if (s.run.shipIndex !== LAST_LIGHT || s.run.phase !== 'flight') return;
    const verb = s.hollow.verb;
    const key = verb === null ? null : `${verb.kind}:${verb.targetId}:${s.hollow.verbMoments}`;
    if (key !== null && key !== lastVerb) {
      verbsSeen++;
      if (s.clock.pace === 'tactical') verbUnderTactical++;
    }
    lastVerb = key;
    if (s.hollow.seedTelegraph !== null && s.hollow.seedMoments === 1 && s.clock.pace === 'tactical') firstSeedUnderTactical = true;
    if (s.hollow.phase === 'awake' && s.hollow.verbMoments === 0 && s.burn.status === 'approaching' && !skipBeforeFirstVerb) {
      const reason = skipBlockReason(s, h.pred());
      if (reason === 'SOMETHING IS COMING') skipBeforeFirstVerb = reason;
    }
  });
  h.flyLastLight(900);
  off();
  check('flown by the book: LAST LIGHT locks', h.status() === 'locked', h.status());
  check('…no verb countdown ever started while the flight was at TACTICAL', verbsSeen > 0 && verbUnderTactical === 0, `${verbsSeen} verbs, ${verbUnderTactical} under TACTICAL`);
  check('…the first seed never blinked under a busy (TACTICAL) flight', !firstSeedUnderTactical);
  check('…SKIP waited for the first verb (`SOMETHING IS COMING`)', skipBeforeFirstVerb === 'SOMETHING IS COMING', skipBeforeFirstVerb);
  const hits = h.events.filter((event) => event.name === 'zone-hit').map((event) => event.payload as { zoneId: string; hits: { rack: string }[] });
  check('…the belt hit only racks A–B, and more than once', hits.length >= 2 && hits.every((hit) => hit.zoneId === 'last-light-belt' && hit.hits.every((item) => item.rack === 'A' || item.rack === 'B')),
    `${hits.length} hits: ${hits.map((hit) => hit.hits.map((item) => item.rack).join('')).join(' ')}`);
  void blocksInRack;
}

finish();
