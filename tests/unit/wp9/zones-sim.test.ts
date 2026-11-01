// WP9 acceptance 2 (§9 WP9, §6.8): KESTREL's debris cloud, headless, on the real sim.
// Slice 1a: KESTREL's racks are phase 2's with `C` → `P`, so POD 07–12 sit where C07–C12 did.
// • A pilot who never corrects takes exactly 1 debris hit, and each rack-C pod's driver loses 25; the files elsewhere
//   are untouched (slice 2: no HOLLOW aboard KESTREL); the pace is TACTICAL from 20 tactical s before the contact.
// • The strip-following kid whose IN correction starts ≤ 80 tactical s after the boot: 0 hits, locked, FUEL ≥ 20%.
// • A correction started at 170 tactical s (past the dodge's deadline, about 154 since WP9 fix round 1): 1 hit.
// Edge cases (§9 WP9): contact during SKIP (the SKIP ends before the cloud, TACTICAL at contact); a file straddling
// a rack border (proportional damage); a file moved into the rack before contact (hit) and one moved out (spared);
// a FIREWALL in the rack (no health: skipped); the debris rack on a later run (B or C, seeded, fixed per seed); the
// predictor's hazard span and zoneHits agree with the hit; the strip's upcoming event `DEBRIS C m:ss` and its
// `DEBRIS C?` under PATH UNCERTAIN; the TOO WIDE line promises the dodge only while the correction can still make it.
// (WP9 fix round 1: the promise counts down its deadline, `· 1:51 to dodge DEBRIS C`, then says `· too late to dodge
// DEBRIS C`; and SKIP waits while the dodge is open, so the SKIP edge case asks once it has run out.)
import { check, finish } from '../wp1/harness';
import { createHarness9 } from './harness9';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { debrisDamagePlan, resolveZones, zoneContains, inboundPoint } from '@systems/zones';
import { upcomingEvents } from '@systems/flight-hud';
import { requestSkip } from '@systems/pace';
import { driversInMemory } from '@state/selectors';
import { segmentStarts, freeSegment } from '@systems/memory-ops';
import { createRng, childRng } from '@systems/rng';
import { podCode } from '@data/landing-text';
import { debrisHitLine } from '@data/zone-text';
import { RACK_BLOCKS, SKIP_END_LEAD_TAC } from '@data/tuning';
import { classicShip } from '@data/classic-five';
import type { Segment, DriverSegment } from '@/types/segment';

const h = createHarness9(1);
const state = () => h.store.getState();
const tacNow = (): number => state().clock.tSec / state().level.tacticalWarp;
const rackOf = (seg: Segment): string => {
  const index = state().memory.indexOf(seg);
  return 'ABCDEF'[Math.floor(segmentStarts(state().memory)[index]! / RACK_BLOCKS)]!;
};
const RACK_C_PODS = [7, 8, 9, 10, 11, 12];

// --- The pilot who never corrects ------------------------------------------------------------------------------
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  const ship = classicShip(2);
  check('KESTREL: r0 25,000, ▼ 9,000 (TOO WIDE), ring 5,000–7,000, Δv 2.1, ×25 / ×80, IN engaged',
    state().level.r0 === 25000 && Math.round(h.rp()) === 9000 && state().level.ring.min === 5000 && state().level.ring.max === 7000
    && state().level.dvBudgetKmS === 2.1 && state().level.tacticalWarp === 25 && state().level.cruiseWarp === 80 && state().burn.sasMode === 'radial-in');
  const zone = state().level.zones[0]!;
  const centre = inboundPoint(ship.flight, 14000);
  check('its debris cloud: r 900, centred on the arrival path at r 14,000, rack C on the written run',
    state().level.zones.length === 1 && zone.kind === 'debris' && zone.r === 900 && zone.rack === 'C'
    && Math.abs(Math.hypot(zone.centre.x, zone.centre.y) - 14000) < 1e-6 && zone.centre.x === centre.x, JSON.stringify(zone));
  const hit = getPrediction().zoneHits[0]!;
  const warp = state().level.tacticalWarp;
  check('the predicted path enters it about 212 tac s in (centre 225), one hit, a hazard span on the drawn path',
    hit.enterInSec !== null && Math.abs(hit.enterInSec / warp - 212) < 3 && Math.abs((hit.closestInSec ?? 0) / warp - 225) < 2
    && hit.expectedHits === 1 && getPrediction().hazardSpans.length === 1, JSON.stringify({ enter: (hit.enterInSec ?? 0) / warp, spans: getPrediction().hazardSpans }));
  const span = getPrediction().hazardSpans[0]!;
  const spanInside = getPrediction().points.slice(span.from + 1, span.to).every((point) => zoneContains(zone, point));
  check('…the span\'s points lie inside the cloud', spanInside && span.to > span.from);
  check('the strip names it ahead: `DEBRIS C m:ss` among the upcoming events', /DEBRIS C \d+:\d\d/.test(upcomingEvents(state(), getSensedPrediction())),
    upcomingEvents(state(), getSensedPrediction()));
  check('TOO WIDE says the IN correction also dodges it, and until when', /^TOO WIDE — hold \[SPACE\] · \d+:\d\d to dodge DEBRIS C$/.test(h.objective()?.text ?? '')
    && h.objective()?.urgency === 'now', h.objective()?.text);

  const before = new Map(driversInMemory(state()).map((soul) => [soul.pod, soul.integrity]));
  const shipFiles = new Map(state().memory.filter((seg) => seg.type === 'ship').map((seg) => [seg.id, 'integrity' in seg ? seg.integrity : 0]));
  let tacticalAtLead = false;
  let paceAtContact = '';
  let contactTac = -1;
  const end = h.wall() + 200;
  while (h.wall() < end && h.status() === 'approaching') {
    h.step();
    const toEntryTac = 212 - tacNow();
    if (toEntryTac < 18 && toEntryTac > 1 && state().clock.pace === 'tactical') tacticalAtLead = true;
    if (contactTac < 0 && h.zoneHits().length > 0) { contactTac = tacNow(); paceAtContact = state().clock.pace; }
    if (tacNow() > 300) break;
  }
  const hits = h.zoneHits();
  check('the pilot who never corrects takes exactly one debris hit', hits.length === 1 && hits[0]!.zoneId === zone.id, JSON.stringify(hits));
  check('…at about 212 tac s, at TACTICAL pace (TACTICAL already 18 s before)', Math.abs(contactTac - 212) < 2 && paceAtContact === 'tactical' && tacticalAtLead,
    `contact ${contactTac.toFixed(1)} tac s, pace ${paceAtContact}`);
  const after = driversInMemory(state());
  check('each rack-C driver lost 25 (POD 07–12 at 75), rack B untouched', after.every((soul) => (RACK_C_PODS.includes(soul.pod)
    ? Math.abs(soul.integrity - (before.get(soul.pod)! - 25)) < 1e-9 : soul.integrity === before.get(soul.pod)) && rackOf(soul) === (RACK_C_PODS.includes(soul.pod) ? 'C' : 'B')),
  after.map((soul) => `${soul.pod}:${soul.integrity}`).join(' '));
  // Slice 2: KESTREL carries no HOLLOW of its own (the SEEDS act), so there is no root to spare.
  check('…the ship files in rack A untouched', state().memory.filter((seg) => seg.type === 'ship')
    .every((seg) => 'integrity' in seg && seg.integrity === shipFiles.get(seg.id)));
  const hitLine = debrisHitLine('C', RACK_C_PODS.map((pod) => ({ label: podCode(pod), lost: 25 })));
  check(`…the TERMINAL names the rack and the pods (\`${hitLine}\`)`, hitLine.startsWith('> DEBRIS HIT RACK C: POD 07 POD 08')
    && state().log.entries.some((entry) => entry.text === hitLine),
    state().log.entries.filter((entry) => entry.text.includes('DEBRIS')).map((entry) => entry.text).join(' | '));
  check('…the cloud is spent: no hazard span ahead, no more hits expected, the strip no longer names it',
    state().hazards.hitIds.includes(zone.id) && getPrediction().hazardSpans.length === 0 && getPrediction().zoneHits[0]!.expectedHits === 0
    && !/DEBRIS/.test(upcomingEvents(state(), getSensedPrediction())));
}

// --- The strip-following kid: an early IN correction clears the cloud ----------------------------------------
for (const startTac of [0, 40, 80]) {
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  while (tacNow() < startTac) h.step();
  h.flyDefending9(900);
  const fuel = state().burn.fuelPct;
  check(`the follower correcting IN at ${startTac} tac s: 0 debris hits, ORBIT LOCKED, FUEL ≥ 20%`,
    h.zoneHits().length === 0 && h.status() === 'locked' && fuel >= 20, `${h.zoneHits().length} hits, ${h.status()}, FUEL ${fuel.toFixed(1)}%`);
}

// --- A late correction does not -----------------------------------------------------------------------------
// (WP9 fix round 1: the strip now asks for the correction to be held through the sweet zone until the path clears
// (KEEP HOLDING — dodge DEBRIS C), and the countdown promises exactly that, so the window runs to about 154 tac s:
// at 140 it is still open and the strip-follower dodges; the late correction is flown at 170 tac s.)
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  while (tacNow() < 140) h.step();
  check('at 140 tac s the countdown still runs (`· 0:1n to dodge DEBRIS C`)', /· 0:1\d to dodge DEBRIS C$/.test(h.objective()?.text ?? '')
    && getPrediction().zoneHits[0]!.correctionClears === true, h.objective()?.text);
  const lines = h.flyDefending9(900);
  check('…a correction started then, held as the strip asks (KEEP HOLDING — dodge DEBRIS C): 0 debris hits, locked',
    lines.includes('KEEP HOLDING — dodge DEBRIS C') && h.zoneHits().length === 0 && h.status() === 'locked',
    `${h.zoneHits().length} hits, ${h.status()} | ${[...new Set(lines)].slice(0, 8).join(' | ')}`);
}
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  while (tacNow() < 170) h.step();
  check('at 170 tac s TOO WIDE no longer promises the dodge: it says it is too late (a correction now would still hit)',
    h.objective()?.text === 'TOO WIDE — hold [SPACE] · too late to dodge DEBRIS C' && getPrediction().zoneHits[0]!.correctionClears === false, h.objective()?.text);
  h.flyDefending9(900);
  check('a correction started at 170 tac s: 1 debris hit', h.zoneHits().length === 1, `${h.zoneHits().length} hits, ${h.status()}`);
}

// --- Contact during SKIP ------------------------------------------------------------------------------------
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  h.step();
  // WP9 review round 2 (the lead's ruling): while the IN correction can still dodge the cloud, its deadline is SKIP's
  // next event: a SKIP ends SKIP_END_LEAD_TAC before it, and in that last stretch F is refused (round 1 refused SKIP
  // for the whole window).
  const deadlineTac = (getPrediction().asOfTSec + getPrediction().zoneHits[0]!.dodgeInSec!) / state().level.tacticalWarp;
  const early = requestSkip(h.store);
  h.stepUntil(() => state().clock.skipWarp === null, 60);
  const stoppedAt = tacNow();
  const near = requestSkip(h.store);
  check('a SKIP while the dodge is open stops SKIP_END_LEAD_TAC before its deadline; then F says DODGE THE DEBRIS FIRST',
    early.ok && Math.abs(deadlineTac - stoppedAt - SKIP_END_LEAD_TAC) < 1 && !near.ok && near.reason === 'DODGE THE DEBRIS FIRST',
    `${JSON.stringify(early)} stopped ${(deadlineTac - stoppedAt).toFixed(1)} tac s before; then ${JSON.stringify(near)}`);
  h.stepUntil(() => getPrediction().zoneHits[0]!.correctionClears === false, 120);
  const skip = requestSkip(h.store);
  let skipEndedTac = -1;
  let paceAtContact = '';
  while (h.zoneHits().length === 0 && tacNow() < 300 && h.status() === 'approaching') {
    h.step();
    if (skipEndedTac < 0 && state().clock.skipWarp === null) skipEndedTac = tacNow();
    if (h.zoneHits().length > 0) paceAtContact = state().clock.pace;
  }
  check('a SKIP toward the capture stops before the cloud (its TACTICAL lead), and contact comes at TACTICAL',
    skip.ok && skipEndedTac > 150 && skipEndedTac <= 212 - 18 && paceAtContact === 'tactical' && h.zoneHits().length === 1,
    `skip ok ${skip.ok}, ended at ${skipEndedTac.toFixed(1)} tac s, contact pace ${paceAtContact}`);
  // Inside the cloud: SKIP is refused.
  const inside = requestSkip(h.store);
  check('…inside the cloud SKIP is refused (IN THE DEBRIS)', !inside.ok && inside.reason === 'IN THE DEBRIS', JSON.stringify(inside));
}

// --- A file straddling the rack border, a file moved in, a file moved out, a FIREWALL --------------------------
// Rack C's free tail after POD 12 is 16 blocks: a driver 11 blocks into it has 5 of its 8 blocks in rack C.
const STRADDLE_AT = 11;
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  const memory = state().memory;
  const starts = segmentStarts(memory);
  // POD 12's free tail in rack C (16 blocks since slice 2's calm layouts) runs on into rack D: POD 01 placed 11 blocks into
  // it straddles C|D (5 in C, 3 in D).
  const c12 = memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 12)!;
  const tail = memory[memory.indexOf(c12) + 1]!;
  const tailStart = starts[memory.indexOf(tail)]!;
  check('setup: after POD 12, free space from inside rack C into rack D', tail.type === 'free' && tailStart < 192 && tailStart + tail.size > 192);
  const plan = (() => {
    // Plant POD 01 and POD 10 by hand (the moves are tested in WP7; here only the addresses matter).
    const draft = structuredClone(memory);
    const c01 = draft.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 1)!;
    const c10 = draft.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 10)!;
    const tailIndex = draft.findIndex((seg) => seg.id === tail.id);
    const freeTail = draft[tailIndex]!;
    // POD 01 → 11 blocks into the tail (straddling C|D); POD 10 → the far end of rack D (out of rack C).
    draft.splice(draft.indexOf(c01), 1, freeSegment(8));
    draft.splice(draft.indexOf(c10), 1, freeSegment(8));
    draft.splice(tailIndex, 1, freeSegment(STRADDLE_AT), c01, freeSegment(freeTail.size - STRADDLE_AT - 16), c10);
    return debrisDamagePlan(draft, 'C');
  })();
  const lostOf = (pod: number): number | undefined => {
    const item = plan.find((entry) => entry.label === podCode(pod));
    return item ? item.from - item.to : undefined;
  };
  check('a driver straddling the rack border loses in proportion (POD 01: 5 of 8 blocks in rack C → 15.6)',
    Math.abs((lostOf(1) ?? 0) - 25 * 5 / 8) < 1e-9, String(lostOf(1)));
  check('…a driver moved out of rack C before contact is spared (POD 10 in rack D)', lostOf(10) === undefined);
  check('…the others in rack C lose 25', [7, 8, 9, 11, 12].every((pod) => lostOf(pod) === 25));
  const firewallMemory: Segment[] = structuredClone(memory);
  const freeIdx = firewallMemory.findIndex((seg) => seg.id === tail.id);
  firewallMemory.splice(freeIdx, 1, { id: 'fw-test', name: 'Firewall.sys', type: 'firewall', size: 2 }, freeSegment(tail.size - 2));
  check('a FIREWALL in the rack has no health: debris skips it', !debrisDamagePlan(firewallMemory, 'C').some((item) => item.segId === 'fw-test'));
}

// --- A file moved into the rack before contact is hit (the live sim) ------------------------------------------------
{
  h.kestrel(1, { hollowAsleep: true, sensorHealed: true });
  // Plant a driver from rack B 11 blocks into rack C's free tail, across the C|D border (the MOVE's result) before the contact.
  h.store.update((d) => {
    const c01 = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 1)!;
    const c12 = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 12)!;
    const tailIndex = d.memory.indexOf(c12) + 1;
    const tail = d.memory[tailIndex]!;
    d.memory.splice(d.memory.indexOf(c01), 1, freeSegment(8));
    const tailNow = d.memory.indexOf(tail);
    d.memory.splice(tailNow, 1, freeSegment(STRADDLE_AT), c01, freeSegment(tail.size - STRADDLE_AT - 8));
    d.ui.memoryRev++;
  });
  // Merge what the plant left touching (rack A's free tail and POD 01's old place).
  h.store.update((d) => {
    for (let i = d.memory.length - 1; i > 0; i--) {
      const current = d.memory[i]!;
      const prev = d.memory[i - 1]!;
      if (current.type === 'free' && prev.type === 'free') { prev.size += current.size; d.memory.splice(i, 1); }
    }
  });
  h.checkMemory();
  while (h.zoneHits().length === 0 && tacNow() < 300) h.step();
  const c01 = driversInMemory(state()).find((soul) => soul.pod === 1)!;
  check('a driver moved into rack C before contact is hit (POD 01, 5 of its 8 blocks in rack C: −15.6)', Math.abs(c01.integrity - (100 - 25 * 5 / 8)) < 1e-9,
    String(c01.integrity));
}

// --- Later runs: the rack is seeded, B or C ---------------------------------------------------------------------
{
  const ship = classicShip(2);
  const racks = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const zone = resolveZones(ship.zones, ship.flight, false, childRng(seed, 2, 'zones'))[0]!;
    if (zone.kind === 'debris') racks.add(zone.rack);
  }
  const again = resolveZones(ship.zones, ship.flight, false, childRng(7, 2, 'zones'))[0]!;
  const once = resolveZones(ship.zones, ship.flight, false, childRng(7, 2, 'zones'))[0]!;
  check('a later run draws the debris rack from B and C (both come up over 200 seeds; the same seed, the same rack)',
    racks.size === 2 && racks.has('B') && racks.has('C') && again.kind === 'debris' && once.kind === 'debris' && again.rack === once.rack,
    [...racks].join(','));
  check('…the written run always hits C', resolveZones(ship.zones, ship.flight, true, createRng(99))[0]!.kind === 'debris'
    && (resolveZones(ship.zones, ship.flight, true, createRng(99))[0] as { rack: string }).rack === 'C');
}

// --- PATH UNCERTAIN: HIT? ------------------------------------------------------------------------------------
{
  h.kestrel(1, { hollowAsleep: true, arrivalDamage: true });
  h.step();
  const events = upcomingEvents(state(), getSensedPrediction());
  check('arriving blind (Sensor Interp 45%): PATH UNCERTAIN, and the strip says `DEBRIS C? m:ss` (no promise either way)',
    h.caps().plot.mode === 'uncertain' && /DEBRIS C\? \d+:\d\d/.test(events) && /^PATH UNCERTAIN/.test(h.objective()?.text ?? ''), `${events} | ${h.objective()?.text}`);
}

finish();
