import type { MemoryClass, PodRackName } from '@/types/map';
import { layoutFor } from '@data/memory';
import {
  RACK_BLOCKS, DRIVER_BLOCKS, POD_RACK_MAX_DRIVERS, ROOT_GAP_BEFORE_BLOCKS, ROOT_GAP_AFTER_BLOCKS, PRE_FINAL_ROOT_CAP,
  FINAL_ROOT_MAX_BLOCKS, POD_RACK_MIN_FREE, UNIT_TAIL_BLOCKS,
} from '@data/tuning';

// 01-landing §3.16's pod-rack rule (slice-3a-plan §2.7 step 2): a ship's pod racks from its pods, class, root slot and
// final role. Pods fill rack B (at most POD_RACK_MAX_DRIVERS, two fewer when a slot needs them to flank it), then rack C
// around the slot, `k` pods then `P _2 S _1 P`, k as large as keeps C's trailing free at least the largest root the slot
// may hold (data/memory.ts maxRootFor), then rack D (FULL only); then the 40-free and 24-tail checks. The lead is the
// slot's GAP-1 neighbour (bitten first: 04's POD 12 · OKAFOR), else the last pod. It reproduces LAST LIGHT's
// `P×7 _8 / P P P P _2 S _1 P _21 / P P P P _32` and 01 §3.16's TIGHT rows (`P P P _40 / _64`, `P P P _40 / P _2 S _1 P _45`).
// Pure; it throws on its own bad output (fail loudly: the generator never ships a layout the memory checks would refuse).
// Track GEN owns this file after the foundation.

export interface PodLayout {
  podRacks: Partial<Record<PodRackName, string>>;
  lead: number;
}

// One rack as a layout string: its tokens, the free blocks that close it added so it sums to RACK_BLOCKS.
function rackString(tokens: readonly string[]): string {
  const used = tokens.reduce((sum, token) => sum + (token === 'P' ? DRIVER_BLOCKS : token === 'S' ? 0 : Number(token.slice(1))), 0);
  const free = RACK_BLOCKS - used;
  if (free < 0) throw new Error(`layoutPods: a rack of ${used} blocks (${tokens.join(' ')})`);
  return [...tokens, ...(free > 0 ? [`_${free}`] : [])].join(' ');
}

const pods = (n: number): string[] => Array.from({ length: n }, () => 'P');

export function layoutPods(podCount: number, cls: MemoryClass, hasSlot: boolean, isFinal: boolean): PodLayout {
  const fail = (why: string): never => { throw new Error(`layoutPods (${podCount} pods, ${cls}, slot ${hasSlot}, final ${isFinal}): ${why}`); };
  const layout = layoutFor(cls);
  if (!(Number.isInteger(podCount) && podCount >= 1)) fail('the pod count must be a whole number ≥ 1');
  if (podCount > layout.maxPods) fail(`over a ${cls} memory's ${layout.maxPods}`);
  if (isFinal && !hasSlot) fail('a final ship always has a root slot (its FINALE)');
  const racks = layout.podRacks;
  const maxRoot = isFinal ? FINAL_ROOT_MAX_BLOCKS : PRE_FINAL_ROOT_CAP;
  const out: Partial<Record<PodRackName, string>> = {};
  let lead: number;
  if (hasSlot) {
    if (podCount < 2) fail('a slot needs two drivers to flank it');
    const inB = Math.min(POD_RACK_MAX_DRIVERS, podCount - 2);
    const rest = podCount - inB;
    // C's blocks with k more pods: 8k + the two flanking drivers + the gaps; its trailing free must take the largest root.
    const flank = 2 * DRIVER_BLOCKS + ROOT_GAP_BEFORE_BLOCKS + ROOT_GAP_AFTER_BLOCKS;
    const kMax = Math.floor((RACK_BLOCKS - flank - maxRoot) / DRIVER_BLOCKS);
    const hasD = racks.includes('D');
    const k = hasD ? Math.min(kMax, rest - 2) : rest - 2;
    if (k > kMax) fail(`rack C would hold ${k + 2} pods around the slot, leaving less than a ${maxRoot}-block root`);
    const inD = rest - 2 - k;
    out.B = rackString(pods(inB));
    out.C = rackString([...pods(k), 'P', `_${ROOT_GAP_BEFORE_BLOCKS}`, 'S', `_${ROOT_GAP_AFTER_BLOCKS}`, 'P']);
    if (hasD) out.D = rackString(pods(inD));
    else if (inD > 0) fail(`${inD} pods left with no rack D`);
    lead = inB + k + 2;
  } else {
    const inB = Math.min(POD_RACK_MAX_DRIVERS, podCount);
    let rest = podCount - inB;
    out.B = rackString(pods(inB));
    if (racks.includes('D')) {
      const inC = Math.min(POD_RACK_MAX_DRIVERS, rest);
      rest -= inC;
      out.C = rackString(pods(inC));
      out.D = rackString(pods(rest));
    } else {
      out.C = rackString(pods(rest));
    }
    lead = podCount;
  }
  checkBudget(out, racks, hasSlot, maxRoot, fail);
  return { podRacks: out, lead };
}

// 01 §3.16's budget, on the strings just built (data/memory.ts validatePodRacks says the same of a whole ShipDef): at least
// POD_RACK_MIN_FREE free blocks across the pod racks, the root's GAPs and the largest root not counted; the slot's rack ends
// in room for that root; the last pod rack ends in the unit's UNIT_TAIL_BLOCKS tail (less the root when the slot is there).
function checkBudget(
  out: Partial<Record<PodRackName, string>>, racks: readonly PodRackName[], hasSlot: boolean, maxRoot: number, fail: (why: string) => never,
): void {
  const trailing = (words: readonly string[]): number => {
    let free = 0;
    for (let i = words.length - 1; i >= 0 && words[i]!.startsWith('_'); i--) free += Number(words[i]!.slice(1));
    return free;
  };
  let free = 0;
  let slotRack: PodRackName | null = null;
  for (const rack of racks) {
    const words = out[rack]!.split(' ');
    if (words.includes('S')) slotRack = rack;
    words.forEach((word, index) => {
      if (!word.startsWith('_')) return;
      const nextToSlot = words[index - 1] === 'S' || words[index + 1] === 'S';
      if (!nextToSlot) free += Number(word.slice(1));
    });
  }
  if (hasSlot) {
    if (slotRack === null) fail('no slot written');
    const slotTrailing = trailing(out[slotRack]!.split(' '));
    if (slotTrailing < maxRoot) fail(`rack ${slotRack} ends in ${slotTrailing} free blocks, under a ${maxRoot}-block root`);
    free -= maxRoot;
  }
  if (free < POD_RACK_MIN_FREE) fail(`${free} free blocks across the pod racks, under ${POD_RACK_MIN_FREE}`);
  const last = racks[racks.length - 1]!;
  const tail = trailing(out[last]!.split(' ')) - (slotRack === last ? maxRoot : 0);
  if (tail < UNIT_TAIL_BLOCKS) fail(`the last pod rack ends in ${tail} free blocks, under the unit's ${UNIT_TAIL_BLOCKS}`);
}
