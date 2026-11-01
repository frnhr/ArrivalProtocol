// WP12 part 3, the lead's ruling 1 (2026-10-21 06:20): HALCYON's opener must not be a death spiral for a kid whose
// release is slower than the 0.75 s ▼ takes to cross the sweet zone. The opening correction (TOO WIDE: IN, hold SPACE)
// is flown by a kid who lets go `reaction` s after the strip first says RELEASE; where ▼ stops is checked against
// the ring (and, for a quick kid, the sweet zone). For comparison the old trigger (▼ entering the sweet zone) is
// flown with the same reactions: the slow ones used to land ▼ under the ring.
// Then the whole flight is flown by a strip-follower with that reaction on every RELEASE, to the end: it must lock.
import { check, finish, TICK } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { sweetZone } from '@systems/predict';
import { classicShip } from '@data/classic-five';

const HALCYON = 1;
const h = createHarness7(1);
const ship = classicShip(HALCYON);
const ring = ship.flight.ring;
const sweet = sweetZone(ring);
const line = (): string => h.store.getState().director.shown?.text ?? '';
const rp = (): number => h.rp();

// Fly the opener: hold on TOO WIDE until `trigger` holds, let go `reaction` s later. Returns ▼ (km) and FUEL after.
function opener(seed: number, reaction: number, trigger: 'strip' | 'zone'): { rp: number; fuel: number; releaseRp: number } {
  h.shipAlone(HALCYON, seed);
  for (let i = 0; i < 10; i++) h.step();
  if (!/TOO WIDE/.test(line())) throw new Error(`HALCYON opens on '${line()}', not TOO WIDE`);
  if (h.store.getState().burn.sasMode !== 'radial-in') h.press('KeyA');
  h.keyDown('Space');
  let triggeredAt: number | null = null;
  let releaseRp = NaN;
  for (let i = 0; i < 30 / TICK; i++) {
    h.step();
    const fired = trigger === 'strip' ? /RELEASE/.test(line()) : rp() <= sweet.hi;
    if (triggeredAt === null && fired) { triggeredAt = h.wall(); releaseRp = rp(); }
    if (triggeredAt !== null && h.wall() - triggeredAt >= reaction - 1e-9) break;
  }
  h.keyUp('Space');
  for (let i = 0; i < 4; i++) h.step();
  return { rp: rp(), fuel: h.store.getState().burn.fuelPct, releaseRp };
}

const REACTIONS = [0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4];
console.log(`HALCYON ring ${ring.min}–${ring.max} km, sweet zone ${sweet.lo}–${sweet.hi} km`);
const rows: string[] = [];
const landed = new Map<number, { now: number; before: number }>();
for (const reaction of REACTIONS) {
  const now = opener(1, reaction, 'strip');
  const before = opener(1, reaction, 'zone');
  landed.set(reaction, { now: now.rp, before: before.rp });
  rows.push(`  reaction ${reaction.toFixed(1)} s: ▼ ${Math.round(now.rp)} km (RELEASE said at ${Math.round(now.releaseRp)}) · old trigger ▼ ${Math.round(before.rp)} km`);
}
console.log(rows.join('\n'));
const inRing = (value: number): boolean => value >= ring.min && value <= ring.max;
const inSweet = (value: number): boolean => value >= sweet.lo && value <= sweet.hi;
check('the old trigger: a 1.2 s release landed ▼ under the ring (the death spiral\'s first step)', !inRing(landed.get(1.2)!.before), `${Math.round(landed.get(1.2)!.before)} km`);
for (const reaction of [0.4, 0.6, 0.8, 1.0, 1.2]) {
  check(`a release ${reaction.toFixed(1)} s after RELEASE stops ▼ in the ring`, inRing(landed.get(reaction)!.now), `${Math.round(landed.get(reaction)!.now)} km`);
}
check('a quick kid (0.4 s) stops ▼ in the sweet zone', inSweet(landed.get(0.4)!.now), `${Math.round(landed.get(0.4)!.now)} km`);

// The whole flight, by the strip, with a slow (1.2 s) reaction on every RELEASE and on every hold (SLOPPY's), seeds 1–6:
// the opener no longer ping-pongs, and the ship locks with FUEL to spare.
function slowFollower(seed: number, reaction: number): { status: string; fuel: number; corrections: number } {
  h.shipAlone(HALCYON, seed);
  // HOLLOW asleep for good: this measures the flight (its bites hold SKIP and ask for TABs).
  h.store.mutate((d) => { d.hollow.phase = 'dormant'; });
  let holding = false;
  let pendingSince: number | null = null;
  let pendingWant: boolean | null = null;
  let corrections = 0;
  let lastId = '';
  const end = h.wall() + 600;
  while (h.wall() < end && h.status() === 'approaching') {
    const shown = h.store.getState().director.shown;
    const text = shown?.text ?? '';
    if (shown && shown.id !== lastId && /^F[78]-/.test(shown.id)) corrections++;
    lastId = shown?.id ?? '';
    if (/\[F\]/.test(text) && h.store.getState().clock.skipWarp === null) h.press('KeyF');
    const press = text.match(/press \[([WASD])\]/);
    if (press) h.press(`Key${press[1]}`);
    const want: boolean = holding
      ? !/RELEASE|HOLD STEADY|TOO EARLY|WAIT|TURN AROUND|GET READY/.test(text)
      : /NOW|KEEP HOLDING|hold \[SPACE\]/.test(text);
    if (want !== holding) {
      if (pendingWant !== want) { pendingWant = want; pendingSince = h.wall(); }
      if (pendingSince !== null && h.wall() - pendingSince >= reaction - 1e-9) {
        if (want) h.keyDown('Space'); else h.keyUp('Space');
        holding = want;
        pendingWant = null;
        pendingSince = null;
      }
    } else { pendingWant = null; pendingSince = null; }
    h.step();
  }
  if (holding) h.keyUp('Space');
  return { status: h.status(), fuel: h.store.getState().burn.fuelPct, corrections };
}
const flights = [1, 2, 3, 4, 5, 6].map((seed) => ({ seed, ...slowFollower(seed, 1.2) }));
console.log(flights.map((flight) => `  seed ${flight.seed}: ${flight.status} at ${flight.fuel.toFixed(1)}% FUEL, ${flight.corrections} ▼ corrections asked`).join('\n'));
check('a 1.2 s kid following the strip locks HALCYON on every seed (no ping-pong to an empty tank)',
  flights.every((flight) => flight.status === 'locked' && flight.fuel > 0), flights.map((flight) => `${flight.status} ${flight.fuel.toFixed(1)}%`).join(', '));
check('…asked for at most two ▼ corrections (the opener, and at most one touch-up)', flights.every((flight) => flight.corrections <= 2),
  flights.map((flight) => flight.corrections).join(', '));

finish();
