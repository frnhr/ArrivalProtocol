// BALANCE_ONLY: run 2's final ship × run seeds × each ending's traces, flown by the strip-following kid with the WP11 defender (slice-7-plan §6.3; information until slice 8).
// Slice 7c, Track TRACE. Run 2 on a fresh arm after each ending (trace-arm.ts: the game's own RUN START, ship 1's boot played
// so REPAIR is licensed, the arm beamed desk to desk asking for Mv, Rm, Swap and Cp as last-landing-arm does), along the
// longest route through the ending's gift ship when it has one (the no-trace run flown on the same route), then the final
// ship flown for real: the strip-following kid with the WP11 defender to the lock (flyLastLight), the landing by the
// instant lander after LANDING_STANDS_SEC (HOLLOW biting meanwhile), the duel to the FINALE's card and PURGE (finishFinale).
// Per ending: the final ship's points and pods landed, drivers HOLLOW ate there, the duel won (the card reached) and the
// charge as the duel opened, each against no trace on the same seed and route; at the gift ship, the charge laid out
// against no trace. The comparability table for slice 8 (PHASE3 §12 item 2). Hard checks: R33's numbers at the final boot
// (bites × 0.85, the 18-block root, +1 thread, the wild seed, the allowance), and the gifts' +15 at their ships (a squeeze
// may take some: never more than the gift: the plan's "each gift ship within ±15 REPAIR CHARGE's worth"). The plan's other
// expectation, every trace within ±1 pod of none at the final ship, is printed (WARN when not met): information until slice 8.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { setLandingMode } from '../support/landing-instant';
import type { GameState } from '@state/schema';
import type { HollowFate, YouChoice } from '@/types/ending';
import type { LastUnit } from '@/types/lineage';
import { chargeLeft, isSkillFile } from '@state/selectors';
import { shipResultOf } from '@systems/run';
import { HOLLOW_STAGES } from '@data/threats';
import { byDepth } from '../depth';
import {
  TRACE_GIFT_CHARGE, TRACE_PURGE_BITE_MULT, TRACE_MERGE_THREADS, THREAD_PLUS_THREADS, FINAL_ROOT_MAX_BLOCKS, TRACE_EXTRA_SEEDS,
} from '@data/tuning';
import { endingOf, lastUnitOf, arm2, trailOn, startRun2, routeVia, beamTo } from './trace-arm';

const SEEDS = Number(process.env.TS_SEEDS ?? byDepth(4, 20));
if (!Number.isInteger(SEEDS) || SEEDS < 1) throw new Error(`TS_SEEDS=${process.env.TS_SEEDS} is not a seed count`);
const FIRST_SEED = Number(process.env.TS_FIRST ?? 1);
const LANDING_STANDS_SEC = 60;
const POD_COLONISTS = 200;

const h = createHarness11(1, { soulsFound: false });
setLandingMode({ after: LANDING_STANDS_SEC });
const state = (): Readonly<GameState> => h.store.getState();
const step = (): void => h.step();

interface Case {
  id: string;
  hollow: HollowFate;
  you: YouChoice;
}
const CASES: readonly Case[] = [
  { id: 'REASSIGNMENT', hollow: 'followed', you: 'reassignment' },
  { id: 'PURGE+REASSIGN', hollow: 'purge', you: 'reassignment' },
  { id: 'MERGE+REASSIGN', hollow: 'merge', you: 'reassignment' },
  { id: 'SPARE+REASSIGN', hollow: 'spare', you: 'reassignment' },
  { id: 'SUNSET', hollow: 'followed', you: 'sunset' },
  { id: 'STAY', hollow: 'followed', you: 'stay' },
];

function lastUnitFor(seed: number, c: Case | null): LastUnit | null {
  if (c === null) return null;
  const map = arm2(seed);
  const home = map.arm.find((ship) => ship !== undefined && ship !== null && ship.slot > 0 && ship.slot < 4)!;
  const stay = c.you === 'stay' ? { slot: home.slot, colony: 'RIVERSIDE', year: map.startYear - 80 } : null;
  return lastUnitOf(endingOf(c.hollow, c.you, { stay }), c.you === 'sunset' ? trailOn(map) : null);
}

interface Row {
  route: string;
  giftSlot: number | null;
  giftLaid: number | null;        // charge laid out at the gift ship (null: no gift ship on the route)
  finalBoot: { spread: number | null; root: number; threads: number; threadPlus: number; seeds: number; gift: number; lines: string[] };
  points: number;
  pods: number;                   // pods landed in an LZ (colonists / 200)
  eaten: number;
  duelWon: boolean;
  chargeAtDuel: number | null;
  skillRm: number;                // RM verbs telegraphed at a .skl, and landed on one (the hunt's reach)
  skillLost: number;
}

const laid = (s: Readonly<GameState>): number => {
  const a = s.run.arrival!;
  return a.chargeCarried + a.starCredit + a.cardCharge + a.giftCharge + a.chargeFloorAdded - a.chargeOverflowLost;
};

function verbsOn(from: number, name: string, ids: ReadonlySet<string>): number {
  return h.events.slice(from).filter((event) => event.name === name && (event.payload as { kind: string; targetId: string }).kind === 'rm'
    && ids.has((event.payload as { targetId: string }).targetId)).length;
}

function fly(seed: number, c: Case | null, route: readonly number[], giftSlot: number | null): Row {
  h.newRun(seed);
  startRun2(h.store, step, seed, lastUnitFor(seed, c), true);
  const asks = ['mv', 'rm', 'swap', 'cp'] as const;
  let giftLaid: number | null = null;
  const finalSlot = route[route.length - 1]!;
  for (let i = 1; i < route.length; i++) {
    beamTo(h.store, step, route.slice(i - 1), route[i]!, [asks[i - 1] ?? null]);
    if (route[i] === giftSlot) giftLaid = laid(state());
    if (route[i] !== finalSlot) h.store.update((draft) => { draft.run.phase = 'report'; });
  }
  const core = state().memory.find((seg) => seg.type === 'core');
  const finalBoot = {
    spread: state().hollow.cfg.spreadEverySec,
    root: state().memory.filter((seg) => seg.type === 'hollow' && seg.root).reduce((sum, seg) => sum + seg.size, 0),
    threads: core?.type === 'core' ? core.capacity : -1, threadPlus: state().run.upgrades.filter((id) => id === 'thread-plus').length, seeds: state().run.arrival!.seeds.length, gift: state().run.arrival!.giftCharge,
    lines: state().run.arrival!.traceLines.map((line) => line.text),
  };
  const skillIds = new Set(state().memory.filter(isSkillFile).map((seg) => seg.id));
  const from = h.events.length;
  let chargeAtDuel: number | null = null;
  const off = h.store.subscribe((s) => s.hollow.finale.phase, (phase) => { if (phase === 'duel' && chargeAtDuel === null) chargeAtDuel = chargeLeft(h.store.getState()); });
  h.flyLastLight(900);
  const result = h.finishFinale('purge', 900);
  off();
  // The final ship's LANDING REPORT as it stands (its ShipResult is pushed only when the run moves on: run.ts shipResultOf).
  const reported = state().run.phase === 'report';
  const ship = shipResultOf(state(), 'locked', 0);
  if (process.env.TS_DEBUG) console.log(`    ${c?.id ?? 'none'}: ${state().run.phase} ${JSON.stringify(result)} ${ship.landedInLz} ${ship.points} eaten ${h.events.slice(from).filter((event) => event.name === 'hollow-consume').length}`);
  const eaten = h.events.slice(from).filter((event) => event.name === 'hollow-consume' && (event.payload as { driver: boolean }).driver).length;
  return {
    route: route.join(','), giftSlot, giftLaid, finalBoot, points: reported ? ship.points : 0,
    pods: reported ? ship.landedInLz / POD_COLONISTS : 0, eaten, duelWon: result.reachedChoice, chargeAtDuel,
    skillRm: verbsOn(from, 'verb-telegraph', skillIds), skillLost: verbsOn(from, 'verb-landed', skillIds),
  };
}

const rows = new Map<string, Row[]>();
const add = (id: string, row: Row): void => { rows.set(id, [...(rows.get(id) ?? []), row]); };
const problems: string[] = [];
const started = Date.now();
for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed++) {
  const baselines = new Map<string, Row>();
  const baseline = (route: readonly number[]): Row => {
    const key = route.join(',');
    if (!baselines.has(key)) baselines.set(key, fly(seed, null, route, null));
    return baselines.get(key)!;
  };
  for (const c of CASES) {
    h.newRun(seed);
    startRun2(h.store, step, seed, lastUnitFor(seed, c));
    const place = state().run.traces.places[0] ?? null;
    const via = place !== null && place.slot !== 0 ? routeVia(state().run.map, [place.slot]) : null;
    const route = via ?? routeVia(state().run.map)!;
    const giftSlot = via !== null ? place!.slot : null;
    const none = baseline(route);
    const row = fly(seed, c, route, giftSlot);
    // The no-trace run on the same route, at the gift ship.
    const noneAtGift = giftSlot === null ? null : (() => {
      h.newRun(seed);
      startRun2(h.store, step, seed, null, true);
      const asks = ['mv', 'rm', 'swap', 'cp'] as const;
      for (let i = 1; i <= route.indexOf(giftSlot); i++) {
        beamTo(h.store, step, route.slice(i - 1), route[i]!, [asks[i - 1] ?? null]);
        h.store.update((draft) => { draft.run.phase = 'report'; });
      }
      return laid(state());
    })();
    add(c.id, { ...row, giftLaid: row.giftLaid === null || noneAtGift === null ? null : row.giftLaid - noneAtGift });
    add(`none/${c.id}`, none);
    // R33's numbers at the final boot.
    const fb = row.finalBoot;
    const base = none.finalBoot;
    const finale = HOLLOW_STAGES.finale.hollow.spreadEverySec!;
    const want = {
      spread: c.hollow === 'purge' ? finale * TRACE_PURGE_BITE_MULT : finale,
      root: c.hollow === 'merge' ? FINAL_ROOT_MAX_BLOCKS : base.root,
      // MERGE's thread, over the Core's capacity less what THREAD+ gives (a card, or SPARE's cache on the route: the runs pick
      // different cards once one owns THREAD+, so each is counted by its own run.upgrades).
      threads: base.threads - THREAD_PLUS_THREADS * base.threadPlus + THREAD_PLUS_THREADS * fb.threadPlus + (c.hollow === 'merge' ? TRACE_MERGE_THREADS : 0),
      gift: c.you === 'reassignment' ? TRACE_GIFT_CHARGE : 0,
      wild: c.hollow === 'spare' || c.you === 'sunset' || c.you === 'stay',
    };
    const seedsOk = c.hollow === 'purge' ? fb.seeds === 0 : fb.seeds === base.seeds + (want.wild ? TRACE_EXTRA_SEEDS : 0);
    if (fb.spread !== want.spread || fb.root !== want.root || fb.threads !== want.threads || fb.gift !== want.gift || !seedsOk) {
      problems.push(`seed ${seed} ${c.id}: ${JSON.stringify(fb)} vs none ${JSON.stringify(base)}`);
    }
  }
  console.log(`  seed ${seed - FIRST_SEED + 1}/${SEEDS} (run seed ${seed}) flown (${Math.round((Date.now() - started) / 1000)} s)`);
}

const mean = (values: readonly number[]): number => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const fmt = (value: number, digits = 1): string => (Number.isNaN(value) ? '—' : value.toFixed(digits));
console.log(`\nrun 2's final ship, ${SEEDS} seeds; each ending against no trace on the same seeds and routes (Δ = ending − none)`);
console.log('ending            pods   Δpods  points   Δpoints  eaten  Δeaten  duel%  Δduel  charge@duel  Δcharge  skl rm/lost  gift ship Δcharge (n)');
const comparable: string[] = [];
const giftsOff: string[] = [];
for (const c of CASES) {
  const mine = rows.get(c.id)!;
  const none = rows.get(`none/${c.id}`)!;
  const pods = mean(mine.map((row) => row.pods));
  const podsNone = mean(none.map((row) => row.pods));
  const points = mean(mine.map((row) => row.points));
  const pointsNone = mean(none.map((row) => row.points));
  const eaten = mean(mine.map((row) => row.eaten));
  const eatenNone = mean(none.map((row) => row.eaten));
  const duel = mean(mine.map((row) => (row.duelWon ? 100 : 0)));
  const duelNone = mean(none.map((row) => (row.duelWon ? 100 : 0)));
  const charge = mean(mine.flatMap((row) => (row.chargeAtDuel === null ? [] : [row.chargeAtDuel])));
  const chargeNone = mean(none.flatMap((row) => (row.chargeAtDuel === null ? [] : [row.chargeAtDuel])));
  const gifts = mine.flatMap((row) => (row.giftLaid === null ? [] : [row.giftLaid]));
  const skl = `${fmt(mean(mine.map((row) => row.skillRm)))}/${fmt(mean(mine.map((row) => row.skillLost)))}`;
  console.log(`${c.id.padEnd(16)}  ${fmt(pods).padStart(5)}  ${fmt(pods - podsNone).padStart(5)}  ${fmt(points, 0).padStart(6)}  ${fmt(points - pointsNone, 0).padStart(7)}  ${fmt(eaten).padStart(5)}  ${fmt(eaten - eatenNone).padStart(6)}  ${fmt(duel, 0).padStart(5)}  ${fmt(duel - duelNone, 0).padStart(5)}  ${fmt(charge).padStart(11)}  ${fmt(charge - chargeNone).padStart(7)}  ${skl.padStart(11)}  ${gifts.length === 0 ? '—' : `${fmt(mean(gifts))} (${gifts.length})`}`);
  if (!(Math.abs(pods - podsNone) <= 1)) comparable.push(`${c.id}: ${fmt(pods - podsNone)} pods`);
  if (gifts.some((gift) => gift < 0 || gift > TRACE_GIFT_CHARGE)) giftsOff.push(`${c.id}: a gift ship's charge moved ${gifts.join(',')} (outside 0–${TRACE_GIFT_CHARGE})`);
}
console.log(`(a pod is ${POD_COLONISTS} colonists)\n`);

check(`R33's numbers at every final boot (${SEEDS} seeds × ${CASES.length} endings): bites × ${TRACE_PURGE_BITE_MULT} after PURGE, an ${FINAL_ROOT_MAX_BLOCKS}-block root and +${TRACE_MERGE_THREADS} thread after MERGE, PURGE's wipe, ${TRACE_EXTRA_SEEDS} wild seed when non-compliant, +${TRACE_GIFT_CHARGE} after REASSIGNMENT`,
  problems.length === 0, problems.slice(0, 3).join(' | '));
check('each gift ship: the gift lands (0 to +15 charge against no trace on the same route, a squeeze taking at most the gift)',
  giftsOff.length === 0, giftsOff.join(' | '));
// The plan's expectation (§6.3: every trace within ±1 pod of none at the final ship) is information until slice 8: printed,
// never failing the balance run.
console.log(comparable.length === 0 ? 'INFO  every ending within ±1 pod of no trace at the final ship'
  : `WARN  outside ±1 pod of no trace at the final ship (information until slice 8): ${comparable.join(' | ')}`);

finish();
