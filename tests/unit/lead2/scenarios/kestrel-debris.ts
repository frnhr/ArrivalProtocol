// LEAD-2 scenario (not a test by itself: tests/unit/lead2/kestrel-debris.test.ts runs it on this tree and on the tree before
// LEAD-2, tests/unit/lead2/base/, and compares). KESTREL with its sensor healed and HOLLOW asleep: a kid who presses F
// whenever SKIP is offered, until the ship has passed the debris cloud. MODE=hit: the kid never makes the IN
// correction, so the cloud hits rack C. MODE=dodge: the kid makes it where the first SKIP stopped (15 tac s before the
// dodge's deadline), holding SPACE (IN) until the strip says RELEASE, then turns RETRO. Prints one JSON line: the hit
// (game time, files, their loss), the zone-forecast verdict changes in order, where each SKIP stopped and why, the
// dodge's deadline, whether its last DODGE_TACTICAL_LEAD_TAC ran at TACTICAL, and the wall time it all took.
import { createHarness9 } from '../../wp9/harness9';
import { getPrediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { DODGE_TACTICAL_LEAD_TAC } from '@data/tuning';

const mode = process.env.MODE ?? 'hit';
if (mode !== 'hit' && mode !== 'dodge') throw new Error(`kestrel-debris: MODE ${mode} is neither hit nor dodge`);
const h = createHarness9(5);
const state = () => h.store.getState();
h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
for (let i = 0; i < 4; i++) h.step();
const warp = state().level.tacticalWarp;
const firstPred = getPrediction();
const debris = firstPred.zoneHits.find((zone) => zone.kind === 'debris');
const deadlineTac = debris?.dodgeInSec === null || debris?.dodgeInSec === undefined ? null : (firstPred.asOfTSec + debris.dodgeInSec) / warp;

const skipEnds: { tac: number; pace: string; refusal: string | null }[] = [];
let skipping = false;
let wall = 0;
let hitTac: number | null = null;
let hitAt: { x: number; y: number } | null = null;
// The deadline's last DODGE_TACTICAL_LEAD_TAC run at TACTICAL (slice 3b review: folded in from lead2/dodge-rules, which
// flew the same stop again): seen at all, and TACTICAL on every tick of it.
let lastSecondsSeen = false;
let lastSecondsTactical = true;
// MODE=dodge: 'wait' for the first SKIP to stop, 'hold' the IN correction until RELEASE, then 'done'.
let dodge: 'wait' | 'hold' | 'done' = mode === 'dodge' ? 'wait' : 'done';
while (wall < 600 && h.status() === 'approaching') {
  if (dodge !== 'hold' && state().clock.skipWarp === null && skipBlockReason(state(), getPrediction()) === null) h.press('KeyF');
  h.step();
  wall += 0.05;
  const nowSkipping = state().clock.skipWarp !== null;
  if (skipping && !nowSkipping) {
    skipEnds.push({ tac: state().clock.tSec / warp, pace: state().clock.pace, refusal: skipBlockReason(state(), getPrediction()) });
    if (dodge === 'wait') {
      dodge = 'hold';
      h.press('KeyA');
      h.keyDown('Space');
    }
  }
  if (dodge === 'hold' && /^RELEASE/.test(h.objective()?.text ?? '')) {
    h.keyUp('Space');
    h.press('KeyS');
    dodge = 'done';
  }
  skipping = nowSkipping;
  const nowTac = state().clock.tSec / warp;
  if (deadlineTac !== null && nowTac > deadlineTac - DODGE_TACTICAL_LEAD_TAC + 0.1 && nowTac < deadlineTac - 0.05) {
    lastSecondsSeen = true;
    if (state().clock.pace !== 'tactical') lastSecondsTactical = false;
  }
  if (hitTac === null && state().hazards.hitIds.length > 0) {
    hitTac = state().clock.tSec / warp;
    hitAt = { x: state().orbit.x, y: state().orbit.y };
  }
  const hit = h.events.find((event) => event.name === 'zone-hit');
  // Past the cloud: the hit is in and the ship is out of it (the zone's TACTICAL hold has ended), or, dodged, the
  // ship is past the cloud's radius on its way in.
  if (hit && state().clock.pace !== 'tactical' && getPrediction().zoneHits.every((zone) => !zone.insideNow)) break;
  const cloud = state().level.zones.find((zone) => zone.kind === 'debris');
  const radius = Math.hypot(state().orbit.x, state().orbit.y);
  if (mode === 'dodge' && dodge === 'done' && cloud?.kind === 'debris' && radius < Math.hypot(cloud.centre.x, cloud.centre.y) - 2 * cloud.r) break;
}
const hitEvent = h.events.find((event) => event.name === 'zone-hit');
const hitPayload = hitEvent?.payload as { hits: { segId: string; from: number; to: number; rack: string }[] } | undefined;
console.log(JSON.stringify({
  deadlineTac,
  hitTac,
  hitAt,
  hits: hitPayload?.hits.map((item) => ({ segId: item.segId, rack: item.rack, from: item.from, to: item.to })) ?? [],
  spentIds: state().hazards.hitIds,
  forecasts: h.events.filter((event) => event.name === 'zone-forecast').map((event) => {
    const payload = event.payload as { from: string; to: string };
    return `${payload.from}→${payload.to}`;
  }),
  skipEnds,
  lastSecondsTactical: lastSecondsSeen && lastSecondsTactical,
  wall,
  status: h.status(),
}));
