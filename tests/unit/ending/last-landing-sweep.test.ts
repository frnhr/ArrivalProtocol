// BALANCE_ONLY: the arm's LAST LIGHT × draw seeds × eaten 1–6 × flier blind, v1, v2, v3 (slice-7-plan §6.3; information until slice 8).
// Slice 7b, Track DROP. THE LAST LANDING after MERGE on the arm's LAST LIGHT (last-landing-arm.ts: seed 7's worked route, a
// healthy orbit, the instruments and AUTODROP at 100, every LZ with room), skipped to its end by [ENTER] (skipLastLanding:
// the same rules and streams as a watched one, R28). `drawSeed` is the run's seed, so it moves THE LAST LANDING's own
// streams (blind's moments) and every pod's roll in its dot.
// Per flier and per eaten count: restored pods landed in an LZ with room (%), mislanded, off-site, no-go and parked, the
// share AUTODROP had to leave to the blind drop (its two orbits out, R27), and the points per restored pod against a
// hand-landed pod (a full pod: soft, in an LZ with room), by planet class. LAST LIGHT here is GENTLE; the ROUGH and HARSH
// columns score the same touchdowns by those classes' off-site value (forgiveness moves nothing else: landing-rules
// placeValue), so they are the same landings on a less forgiving planet, not a fresh roll.
// Two room cases: OPEN (the arm card's, every pod parked: every LZ has room for every restored pod) and TIGHT (the kid's own
// landings left room only in TIGHT_LZ, as many as the restored pods: the split matters, so v1's and blind's pass order
// mislands where v2's pass and v3's plan send them to the room).
// 01 §3.17 expects about 0.75 of a full pod for a blind drop on GENTLE and about 0.5 on HARSH, and full points with AUTODROP
// on a good orbit. The checks hold v3 to full points and the blind drop to bands around 01's figures.
// Slice 8 Step 0 (slice-8-plan §2.14): BALANCE_JSON writes the blind drop's worth with room (`ll.blind.gentle`, `ll.blind.harsh`)
// and each AUTODROP version's on GENTLE (`ll.v<n>.gentle`, open room).
import { check, finish } from '../wp1/harness';
import { writeMetrics } from '../support/balance-out';
import { createHarness11 } from '../wp11/harness11';
import { setLandingMode } from '../support/landing-instant';
import { armLastLanding, normalS, launchOf } from './last-landing-arm';
import { skipLastLanding } from '@systems/last-landing';
import { podPoints, podRecord } from '@systems/landing-rules';
import { BLIND_DROP_MULT } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { ForgivenessClass, Place } from '@/types/landing';
import type { SkillVersion } from '@/types/skill';

const SEEDS = Number(process.env.LL_SEEDS ?? 8);
if (!Number.isInteger(SEEDS) || SEEDS < 1) throw new Error(`LL_SEEDS=${process.env.LL_SEEDS} is not a seed count`);
const EATEN = [1, 2, 3, 4, 5, 6] as const;
const FLIERS: readonly { id: string; autodrop: SkillVersion | null }[] = [
  { id: 'blind', autodrop: null }, { id: 'v1', autodrop: 1 }, { id: 'v2', autodrop: 2 }, { id: 'v3', autodrop: 3 },
];
const CLASSES: readonly ForgivenessClass[] = ['gentle', 'rough', 'harsh'];
const TIGHT_LZ = 'LZ-B';
const ROOMS = ['open', 'tight'] as const;
type Room = (typeof ROOMS)[number];

const h = createHarness11(31);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();

interface Tally {
  pods: number;
  places: Record<Place | 'parked', number>;
  blind: number;                                  // pods dropped blind (×BLIND_DROP_MULT spread)
  worth: Record<ForgivenessClass, number>;        // summed points / colonists
  fliers: Set<string>;
}

const newTally = (): Tally => ({
  pods: 0, places: { lz: 0, mislanded: 0, 'off-site': 0, 'no-go': 0, parked: 0 }, blind: 0, worth: { gentle: 0, rough: 0, harsh: 0 }, fliers: new Set(),
});

function add(into: Tally, from: Readonly<Tally>): void {
  into.pods += from.pods;
  into.blind += from.blind;
  for (const key of Object.keys(into.places) as (keyof Tally['places'])[]) into.places[key] += from.places[key];
  for (const cls of CLASSES) into.worth[cls] += from.worth[cls];
  for (const flier of from.fliers) into.fliers.add(flier);
}

function fly(autodrop: SkillVersion | null, eaten: number, drawSeed: number, room: Room): Tally {
  const tally = newTally();
  const tight = room === 'tight' ? { room: Object.fromEntries(['LZ-A', 'LZ-B', 'LZ-C', 'LZ-D'].map((lz) => [lz, lz === TIGHT_LZ ? eaten : 0])) } : {};
  const pods = armLastLanding(h, { autodrop, eaten, drawSeed, ...tight });
  tally.fliers.add(state().landing.lastLanding!.flier);
  skipLastLanding(h.store);
  if (state().landing.lastLanding !== null || state().hollow.finale.phase !== 'done') throw new Error('last-landing-sweep: THE LAST LANDING did not end');
  for (const pod of pods) {
    const record = podRecord(state(), pod);
    tally.pods++;
    if (record.fate.kind !== 'down') {
      tally.places.parked++;
      continue;
    }
    const { place, touch } = record.fate.touchdown;
    tally.places[place]++;
    const launch = launchOf(state(), pod);
    if (Math.abs(launch.halfWidthKm - BLIND_DROP_MULT * normalS(state(), launch)) < 1e-6) tally.blind++;
    for (const cls of CLASSES) tally.worth[cls] += podPoints(place, touch, cls, record.colonists) / record.colonists;
  }
  return tally;
}

const pct = (n: number, of: number): string => `${((100 * n) / of).toFixed(0)}%`.padStart(5);
const per = (n: number, of: number): string => (n / of).toFixed(2);
const row = (label: string, t: Readonly<Tally>): string => [
  label.padEnd(12), String(t.pods).padStart(4), pct(t.places.lz, t.pods), pct(t.places.mislanded, t.pods), pct(t.places['off-site'], t.pods),
  pct(t.places['no-go'], t.pods), pct(t.places.parked, t.pods), pct(t.blind, t.pods),
  ...CLASSES.map((cls) => per(t.worth[cls], t.pods).padStart(7)), `  ${[...t.fliers].join(',')}`,
].join(' ');

const started = Date.now();
const totals = new Map<string, Tally>();
for (const room of ROOMS) {
  console.log(`\nTHE LAST LANDING on the arm's LAST LIGHT (GENTLE), ${room.toUpperCase()} room${room === 'tight' ? ` (only ${TIGHT_LZ}, as many as the restored pods)` : ' (every LZ)'}, ${SEEDS} draw seeds per row; worth = points per restored pod vs a full one`);
  console.log(`${'flier·eaten'.padEnd(12)} pods    LZ  MISL  OFFS  NOGO  PARK BLIND  gentle   rough   harsh   flier`);
  for (const flier of FLIERS) {
    const total = newTally();
    for (const eaten of EATEN) {
      const cell = newTally();
      for (let seed = 1; seed <= SEEDS; seed++) add(cell, fly(flier.autodrop, eaten, 100 + seed, room));
      console.log(row(`${flier.id}·${eaten}`, cell));
      add(total, cell);
    }
    console.log(row(`${flier.id} ALL`, total));
    totals.set(`${room}:${flier.id}`, total);
  }
}
console.log(`\n${ROOMS.length * FLIERS.length * EATEN.length * SEEDS} last landings in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const of = (id: string, room: Room = 'open'): Tally => totals.get(`${room}:${id}`)!;
const worth = (t: Readonly<Tally>, cls: ForgivenessClass = 'gentle'): number => t.worth[cls] / t.pods;
check('every flier is the one asked for (a healthy orbit always has a drop solution)',
  ROOMS.every((room) => FLIERS.every((flier) => of(flier.id, room).fliers.size === 1 && of(flier.id, room).fliers.has(flier.id))));
check('no restored pod is left parked on a healthy orbit (blind takes as many passes as it needs)',
  ROOMS.every((room) => FLIERS.every((flier) => of(flier.id, room).places.parked === 0)));
check('v3 on a healthy orbit: every restored pod soft in an LZ with room, full points (01 §3.17), none left to the blind drop, open or tight',
  ROOMS.every((room) => of('v3', room).places.lz === of('v3', room).pods && of('v3', room).worth.gentle === of('v3', room).pods && of('v3', room).blind === 0),
  ROOMS.map((room) => row(`v3 ${room}`, of('v3', room))).join(' | '));
check('the blind drop with room: about 0.75 of a full pod on GENTLE (0.6–0.9)', worth(of('blind')) >= 0.6 && worth(of('blind')) <= 0.9, per(of('blind').worth.gentle, of('blind').pods));
check('…and about 0.5 on HARSH (0.35–0.65), the same touchdowns', worth(of('blind'), 'harsh') >= 0.35 && worth(of('blind'), 'harsh') <= 0.65,
  per(of('blind').worth.harsh, of('blind').pods));
check('AUTODROP at any version is worth more than the blind drop, open or tight',
  ROOMS.every((room) => ['v1', 'v2', 'v3'].every((id) => worth(of(id, room)) > worth(of('blind', room)))));
check('…and with the room tight, v1 (the split left to luck) is worth less than v3 (the plan)', worth(of('v1', 'tight')) < worth(of('v3', 'tight')),
  `${per(of('v1', 'tight').worth.gentle, of('v1', 'tight').pods)} vs ${per(of('v3', 'tight').worth.gentle, of('v3', 'tight').pods)}`);
writeMetrics('last-landing-sweep', {
  'll.blind.gentle': worth(of('blind')), 'll.blind.harsh': worth(of('blind'), 'harsh'),
  'll.v1.gentle': worth(of('v1')), 'll.v2.gentle': worth(of('v2')), 'll.v3.gentle': worth(of('v3')),
}, { seeds: SEEDS });
finish();
