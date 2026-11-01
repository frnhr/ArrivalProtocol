// WP12 part 3: the smaller LEAD_NOTES `Into WP12` items, headless.
// • (WP11 verify 3, PRINT FAST offered only while a cluster is left to print: gone with PRINT FAST, slice 1a; what stays
//   is that with every pod down the finale still holds the LANDING REPORT.)
// • WP11 verify 4: in the duel with no thread free, the strip does not ask to block a verb that cannot come.
// • WP11 verify 5: a refused tool counts toward capRefusals in both wordings of a full Core.
// • WP10 verify: an ACCEPTed DEAL's 60 s pause does not hold SKIP behind `SOMETHING IS COMING`.
// • WP7 verify: the MOVE preview of a driver bitten after the pick says STILL INFECTED, not SAFE.
// • WP8 verify: with two FIREWALLs the placing line lights the one still to place, and is done once both hold.
// • WP11 TODO: a Core worn below CORE_LOW_INTEGRITY (a thread lost, nothing infected) is named on a quiet coast in blue.
import { check, finish } from '../../wp1/harness';
import { createHarness11 } from '../../wp11/harness11';
import { buildDirectorCtx, type DirectorCtx } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { FIREWALL_RULES } from '@data/script';
import { theRoot, infectNow } from '@systems/hollow';
import { actionDelete } from '@state/actions';
import { canStartOp, threadsTotal } from '@systems/ops-core';
import { skipBlockReason, SKIP_REFUSAL_SEED_COMING } from '@systems/pace';
import { movePreview } from '@systems/move-preview';
import { emit } from '@systems/events';
import { driversInMemory, isFirewall } from '@state/selectors';
import { firewallHintTarget } from '@data/fs-tools';
import { TOOL_REFUSAL } from '@data/tool-text';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { CORE_LOW_INTEGRITY } from '@data/tuning';
import type { FreeSegment } from '@/types/segment';
import { cardFiles } from '@systems/draft';
import { installAddress } from '@systems/licences';
import { newSegId, replaceRange, mergeAdjacentFree } from '@systems/memory-ops';
import { setLandingMode, landInstantly } from '../../support/landing-instant';

const h = createHarness11(5);
setLandingMode('manual');
const state = () => h.store.getState();
const ctxNow = (): DirectorCtx => buildDirectorCtx(state(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });

// --- LAST LIGHT's duel with one thread, then every pod down -----------------------------------------------------------
{
  h.lastLight(5);
  h.flyLastLight(900, { deleteRoot: false });
  if (h.status() !== 'locked') throw new Error(`minors: LAST LIGHT seed 5 did not lock (${h.status()})`);
  h.step();
  h.store.update((d) => {
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
    // A Core under 50 runs one thread (§3.3 C5): the root's DELETE takes it.
    const core = d.memory.find((seg) => seg.type === 'core');
    if (!core || !('integrity' in core)) throw new Error('no Core');
    core.integrity = 40;
    d.ui.mode = 'memory';
  });
  h.step();
  const root = theRoot(state().memory);
  if (!root) throw new Error('no root');
  check('setup: the duel is on with a 1-thread Core, and the root\'s DELETE starts', state().hollow.finale.phase === 'duel' && threadsTotal() === 1
    && actionDelete(h.store, root) === null, `${state().hollow.finale.phase} threads ${threadsTotal()}`);
  h.stepFor(0.5);
  const shown = state().director.shown;
  check('no thread free: the strip says `DELETING THE ROOT · 0:1x — keep it running`, not `block what it does`',
    !canStartOp() && shown?.id === 'finale-deleting-alone' && /^DELETING THE ROOT · \d:\d\d — keep it running$/.test(shown.text) && !/block/.test(shown.text),
    shown?.text);
  check('…the line is HOLLOW_FINALE.stripDeletingAlone', shown?.text === HOLLOW_FINALE.stripDeletingAlone(shown?.text.match(/\d:\d\d/)?.[0] ?? ''));

  // Every pod down while the root still stands: the finale holds the LANDING REPORT.
  landInstantly(h.store);
  // Phase 3 slice 2: a driver that cannot launch (OPENING's rolled hurt drivers, or one bitten) is parked and stays in
  // memory until the report (01-landing §3.10), so the landing's end is what is waited for.
  h.stepUntil(() => state().landing.ended !== null, 200);
  h.stepFor(3);
  check('every pod down, parked or lost while the root stands: still landing (the finale holds the report)', state().hollow.finale.phase === 'duel'
    && state().run.phase === 'landing' && state().landing.ended !== null, `${driversInMemory(state()).length} in memory, ${state().run.phase}`);
}

// --- capRefusals counts both wordings ---------------------------------------------------------------------------------
{
  const before = state().run.stats.capRefusals;
  emit('refused', { reason: TOOL_REFUSAL.threads, tool: true });
  emit('refused', { reason: TOOL_REFUSAL.threadsVerb, tool: true });
  h.step();
  check('a full Core refused twice (both wordings) counts twice toward capRefusals', state().run.stats.capRefusals === before + 2,
    `${before} → ${state().run.stats.capRefusals}`);
}

// --- THE DEAL's pause does not hold SKIP --------------------------------------------------------------------------------
{
  h.vesper(11, { hunt: true, hollowAsleep: false });
  h.store.update((d) => {
    d.hollow.phase = 'awake';
    d.hollow.seedMoments = 0;
    d.hollow.deal.pauseUntilAi = null;
  });
  h.step();
  check('setup: VESPER\'s HOLLOW awake, its first seed still to come: SKIP held (`SOMETHING IS COMING`)',
    skipBlockReason(state(), getPrediction()) === SKIP_REFUSAL_SEED_COMING, String(skipBlockReason(state(), getPrediction())));
  h.store.update((d) => { d.hollow.deal.pauseUntilAi = d.clock.aiSec + 60; });
  h.step();
  check('…while an ACCEPTed DEAL pauses the spread, SKIP is not held for it', skipBlockReason(state(), getPrediction()) !== SKIP_REFUSAL_SEED_COMING,
    String(skipBlockReason(state(), getPrediction())));
  h.store.update((d) => { d.hollow.deal.pauseUntilAi = d.clock.aiSec - 1; });
  h.step();
  check('…and held again once the pause is over', skipBlockReason(state(), getPrediction()) === SKIP_REFUSAL_SEED_COMING);
}

// --- The MOVE preview of a driver bitten after the pick ----------------------------------------------------------------
{
  const soul = driversInMemory(state()).find((candidate) => !candidate.infected)!;
  const free = state().memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;
  const placement = { regionSegIds: [free.id], col: Math.floor((free.size - soul.size) / 2) };
  // Final fix pass: the preview takes the racks a hazard zone is known to hit; none here (no belt or debris is asked).
  const clean = movePreview(state(), soul, placement, []);
  check('a clean driver\'s MOVE preview: not infected', clean !== null && !clean.infected);
  infectNow(h.store, soul);
  const bitten = movePreview(state(), driversInMemory(state()).find((candidate) => candidate.id === soul.id)!, placement, []);
  check('…bitten after the pick: the preview says it is infected (the painter: STILL INFECTED / REPAIR IT FIRST ✗)', bitten?.infected === true);
}

// --- Two FIREWALLs --------------------------------------------------------------------------------------------------
{
  h.vesper(12, { hunt: true, hollowAsleep: true });
  // Two FIREWALL.sys files, installed as __ap.giveCard does (debug.ts is DOM code, so the same calls here).
  for (let i = 0; i < 2; i++) {
    const memory = state().memory;
    for (const file of cardFiles('firewall', newSegId)) {
      const addr = installAddress(memory, file.size);
      replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
    }
    mergeAdjacentFree(memory);
    h.store.update((d) => { d.run.upgrades.push('firewall'); d.ui.memoryRev++; });
  }
  h.store.update((d) => { d.ui.mode = 'memory'; });
  h.step();
  const firewalls = state().memory.filter(isFirewall);
  const placeRule = FIREWALL_RULES.find((candidate) => candidate.id === 'firewall-place')!;
  const target = (): string | null => {
    const light = placeRule.highlight;
    return typeof light === 'function' ? light(ctxNow()) : light ?? null;
  };
  h.store.update((d) => { d.ui.activeTool = { kind: 'move', toolSegId: d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move')!.id }; });
  check('setup: two FIREWALLs, neither holding; with MOVE held the line lights the first one only',
    firewalls.length === 2 && target() === firewallHintTarget(firewalls[0]!.id), `${firewalls.length} · ${target()}`);
  check('…not done while any is still to place', !placeRule.doneWhen!(ctxNow()));
}

// --- A worn Core on a quiet coast --------------------------------------------------------------------------------------
{
  h.vesper(13, { hunt: true, hollowAsleep: true });
  h.store.update((d) => {
    for (const seg of d.memory) {
      // No bursts (a healthy controller) and a Core worn under the line, nothing infected.
      if (seg.role === 'thrust-ctrl' && 'integrity' in seg) seg.integrity = 100;
      if (seg.type === 'core') seg.integrity = CORE_LOW_INTEGRITY - 8;
    }
    d.ui.mode = 'memory';
  });
  h.stepFor(1);
  const shown = state().director.shown;
  check('VESPER\'s coast in blue with the Core at 42%: `AI CORE BELOW 50% — REPAIR IT TO GET A THREAD BACK`',
    shown?.id === 'hint-core-worn' && shown.text === `AI CORE BELOW ${CORE_LOW_INTEGRITY}% — REPAIR IT TO GET A THREAD BACK`, `${shown?.id}: ${shown?.text}`);
  h.store.update((d) => { for (const seg of d.memory) if (seg.type === 'core') seg.integrity = CORE_LOW_INTEGRITY + 10; });
  h.stepFor(1);
  check('…not once it is above the line', state().director.shown?.id !== 'hint-core-worn', state().director.shown?.id);
  h.store.update((d) => { d.ui.mode = 'tools'; for (const seg of d.memory) if (seg.type === 'core') seg.integrity = CORE_LOW_INTEGRITY - 8; });
  h.stepFor(1);
  check('…nor in amber (the flight\'s WAIT and its SKIP stay)', state().director.shown?.id !== 'hint-core-worn', state().director.shown?.id);
}

finish();
