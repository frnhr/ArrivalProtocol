// Final fix pass (the final review's LAST LIGHT major, items 1 and 3): the MOVE preview never calls a spot SAFE in a
// rack a known hazard zone will hit, and the bitten-again ask names a rack whose SAFE spot is out of the belt.
// On LAST LIGHT with the belt ahead (its zoneHit says the path enters it, Sensor Interp healthy):
// • knownHitRacks names racks A and B (the belt), and nothing under PATH UNCERTAIN, after the flight, or with no entry;
// Slice 1a: POD 12 (right of LAST LIGHT's root, across a 1-block GAP) stands in for phase 2's C13.
// • the preview for a pod's driver over rack A's free tail says `⚠ BELT HITS RACK A` (hazard A), over rack D nothing;
//   a FIREWALL (no health: zones can't hurt it) gets no hazard;
// • safestSpot never picks a spot in rack A or B, prefers a spot that leaves no seed a WALL to split beside the cluster
//   and the strip's bitten-again ask names the rack of the spot it picks
//   (`POD 12 IS BITTEN EVERY TIME — MOVE it behind a WALL in RACK D`), which is never A or B; within 70 characters;
// • with no belt ahead the preview is as before (no hazard).
// Usage: node_modules/.bin/tsx --tsconfig tsconfig.json tests/unit/final-fix/move-hazard.test.ts
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { knownHitRacks } from '@systems/zones';
import { movePreview, safestSpot, placementRack, memoryAfterMove } from '@systems/move-preview';
import { buildDirectorCtx } from '@systems/director';
import { getPrediction, type Prediction } from '@systems/predict';
import { capabilitiesNow } from '@systems/capabilities';
import { installTool } from '@systems/licences';
import { cardFiles } from '@systems/draft';
import { setIntegrity } from '@state/actions';
import { segmentStarts, requireAddr } from '@systems/memory-ops';
import { GUIDE_RULES, WORST_CASE_VARS } from '@data/script';
import { MOVE_PREVIEW_TEXT } from '@data/hollow-text';
import { ZONE_WORD } from '@data/zone-text';
import { RACK_NAMES } from '@data/memory';
import { BITTEN_AGAIN_COUNT, MAX_LINE_CHARS, RACK_BLOCKS } from '@data/tuning';
import type { GameState, PendingPlacement } from '@state/schema';
import type { Segment, DriverSegment } from '@/types/segment';

const h = createHarness11(5);
const state = (): Readonly<GameState> => h.store.getState();

h.lastLight(5, { hollowAsleep: true });
if (!state().run.licences.includes('move')) installTool(h.store, 'move');
// A healthy sensor (exact): the MIND knows what the belt will do.
h.store.update((d) => {
  const sensor = d.memory.find((seg) => seg.role === 'sensor');
  if (!sensor || !('integrity' in sensor)) throw new Error('move-hazard: no Sensor Interp');
  setIntegrity(sensor, 100);
  d.ui.memoryRev++;
});
for (let i = 0; i < 5; i++) h.step();

// The prediction with the belt ahead (entered in 60 game s), or never entered.
function withBelt(enters: boolean): Prediction {
  const pred = getPrediction();
  return {
    ...pred,
    zoneHits: pred.zoneHits.map((hit) => (hit.kind !== 'belt' ? hit
      : { ...hit, spent: false, insideNow: false, enterInSec: enters ? 60 : null, exitInSec: enters ? 150 : null })),
  };
}

const ahead = withBelt(true);
const hazards = knownHitRacks(state(), ahead);
check('the belt ahead: knownHitRacks names racks A and B (the belt\'s)',
  JSON.stringify(hazards) === JSON.stringify([{ rack: 'A', kind: 'belt' }, { rack: 'B', kind: 'belt' }]), JSON.stringify(hazards));
check('…none when the path never enters it', knownHitRacks(state(), withBelt(false)).length === 0);
check('…none under PATH UNCERTAIN (the MIND can\'t tell)',
  knownHitRacks(state(), ahead, { ...capabilitiesNow(state()).plot, mode: 'uncertain' }).length === 0);

const memory = state().memory;
const starts = segmentStarts(memory);
const c13 = memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 12)!;
// Rack A's free tail (the ship files end before it) and the open rack D.
const freeIn = (rack: string, size: number): PendingPlacement => {
  const rackStart = RACK_NAMES.indexOf(rack) * RACK_BLOCKS;
  const index = memory.findIndex((seg, i) => seg.type === 'free' && starts[i]! >= rackStart && starts[i]! + size <= rackStart + RACK_BLOCKS
    && seg.size >= size);
  if (index < 0) throw new Error(`move-hazard: no free run of ${size} in rack ${rack}`);
  return { regionSegIds: [memory[index]!.id], col: memory[index]!.size - size };
};
const inA = movePreview(state(), c13, freeIn('A', c13.size), hazards);
const inD = movePreview(state(), c13, freeIn('D', c13.size), hazards);
check('POD 12 over rack A\'s free tail: the preview names the belt (hazard A), not SAFE', inA?.hazard?.rack === 'A' && inA.hazard.kind === 'belt'
  && !inA.dest.exposed, JSON.stringify(inA));
check(`…which the label says as \`${MOVE_PREVIEW_TEXT.hazard(ZONE_WORD.belt, 'A')}\``, MOVE_PREVIEW_TEXT.hazard(ZONE_WORD.belt, 'A') === '⚠ BELT HITS RACK A');
check('POD 12 over rack D: no hazard', inD !== null && inD.hazard === null, JSON.stringify(inD?.hazard));
check('…and with no belt ahead, rack A has no hazard either', movePreview(state(), c13, freeIn('A', c13.size), knownHitRacks(state(), withBelt(false)))?.hazard === null);
const firewall = cardFiles('firewall', (prefix) => `${prefix}-test`)[0]!;
h.store.update((d) => {
  // A FIREWALL file in memory to pick (in rack F's free end); zones can't hurt it, so no hazard.
  const tail = d.memory[d.memory.length - 1]!;
  if (tail.type !== 'free' || tail.size < firewall.size) throw new Error('move-hazard: no room at the end of memory');
  d.memory.splice(d.memory.length - 1, 1, ...(tail.size > firewall.size ? [{ ...tail, size: tail.size - firewall.size }] : []), firewall);
  d.ui.memoryRev++;
});
const placedFirewall = state().memory.find((seg) => seg.id === firewall.id)!;
check('a FIREWALL over rack A: no hazard (it has no health)', movePreview(state(), placedFirewall, freeIn('A', placedFirewall.size), hazards)?.hazard === null);

// The SAFE spot the strip names, and its rack.
const spot = safestSpot(state(), c13, hazards);
const rack = spot === null ? '' : placementRack(state().memory, spot);
check('safestSpot for POD 12 is out of the belt\'s racks', spot !== null && rack !== 'A' && rack !== 'B', rack);
// The spot leaves no seed a WALL to aim at beside POD 12: each free gap beside it under 4 blocks or 10 and more (a seed in
// its middle bites nothing).
const afterMove = spot === null ? null : memoryAfterMove(state().memory, c13, spot);
const beside = afterMove === null ? [] : (() => {
  const index = afterMove.findIndex((seg) => seg.id === c13.id);
  return [afterMove[index - 1], afterMove[index + 1]].map((seg) => (seg?.type === 'free' ? seg.size : 0));
})();
check('…and seed-proof: no WALL a seed could split beside it (each gap < 4 or ≥ 10)', beside.length === 2
  && beside.every((free) => free < 4 || free >= 10), `${rack}: ${beside.join(' | ')}`);
check('…and the preview calls it SAFE', spot !== null && (() => {
  const preview = movePreview(state(), c13, spot, hazards);
  return preview !== null && !preview.dest.exposed && !preview.bridges && preview.hazard === null && !preview.infected;
})());

// POD 12 bitten twice in the same spot: the ask names the rack.
h.store.update((d) => {
  d.hollow.phase = 'awake';
  d.hollow.biteInSec = 9999;
  d.hollow.seedInSec = 9999;
  d.hollow.verbInSec = 9999;
  const soul = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 12)!;
  d.hollow.bitesAt = [{ pod: 12, addr: requireAddr(d.memory, soul), count: BITTEN_AGAIN_COUNT }];
  d.ui.memoryRev++;
});
const ctx = buildDirectorCtx(state(), ahead, { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
const ruleText = (id: string): string => GUIDE_RULES.find((candidate) => candidate.id === id)!.text(ctx);
check('the bitten-again ask names the SAFE spot\'s rack', ctx.vars.bittenAgain === 'POD 12' && ctx.vars.bittenAgainRack === `RACK ${rack}`
  && ruleText('hollow-move-again') === `POD 12 IS BITTEN EVERY TIME — MOVE it behind a WALL in RACK ${rack}`, `${ctx.vars.bittenAgainRack}: ${ruleText('hollow-move-again')}`);
check('…in amber too', ruleText('hollow-move-again-tab') === `[TAB], MOVE POD 12 behind a WALL in RACK ${rack} — it is bitten every time`, ruleText('hollow-move-again-tab'));
const worst = { vars: WORST_CASE_VARS };
const worstTexts = ['hollow-move-again', 'hollow-move-again-tab'].map((id) => GUIDE_RULES.find((candidate) => candidate.id === id)!.text(worst));
check(`…both within ${MAX_LINE_CHARS} characters with the worst-case names`, worstTexts.every((text) => text.length <= MAX_LINE_CHARS),
  worstTexts.map((text) => `${text.length}: ${text}`).join(' | '));
const noRack = { vars: { ...WORST_CASE_VARS, bittenAgainRack: '' } };
check('…and with nowhere SAFE the ask names no rack (the old words)',
  GUIDE_RULES.find((candidate) => candidate.id === 'hollow-move-again')!.text(noRack) === `${WORST_CASE_VARS.bittenAgain} IS BITTEN EVERY TIME — MOVE it behind a WALL`,
  GUIDE_RULES.find((candidate) => candidate.id === 'hollow-move-again')!.text(noRack));

// The segment a unit test may pick from memory must still be in it (the firewall was spliced in above).
check('(memory still holds the planted FIREWALL)', state().memory.some((seg: Segment) => seg.id === firewall.id));

finish();
