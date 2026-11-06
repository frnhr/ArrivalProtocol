// Slice 4, Track FLIGHT (plan §6; 03 §3.7, §3.5): LOCK RANGE and what shows it, headless on KESTREL.
// • LOCK RANGE 90 → 270 → 810 by the file's lock, graded by damage (one level per colour): [B] works while the mode's first
//   burn is that close; the NAV PLOT's LOCK bracket is that stretch of the path, ending at START BURN, and triples per level.
// • Entering the bracket sounds once ('autoburn-in-lock'); the AUTO button glows ('ready') only inside it, and names the
//   mode (`AUTO · GREEN [B]`); the ghost shows v2's target loop once [B] would engage it.
// • No thread is held while armed (the claim is AUTO_THREAD_CLAIM_TAC before the burn), even on an 810 lock armed early.
// • The Engine window's AUTOBURN pip names the version and what it works as (`AUTOBURN v2▸v1`).
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { giveSkillFile } from '../support/skills';
import { autoburnRefusal, lockRangeTac } from '@systems/autoburn';
import { getPrediction, secUntil } from '@systems/predict';
import { skillLive } from '@systems/capabilities';
import { threadsBusy } from '@systems/ops-core';
import { lockBracket, autoButton, autoGhost, autoburnPip } from '@systems/flight-hud';
import { AUTOBURN_REFUSAL, AUTO_BUTTON_TEXT } from '@data/skill-text';
import { LOCK_RANGE_TAC, RA_TARGET_FRAC } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { LockLevel, SkillVersion } from '@/types/skill';

const h = createHarness9(5);
const state = (): GameState => h.store.getState();
const warp = (): number => state().level.tacticalWarp;
const captureInTac = (): number => {
  const pred = getPrediction();
  return pred.burnPoint ? secUntil(pred, pred.burnPoint.inSec, state().clock.tSec) / warp() : NaN;
};

// KESTREL after the IN correction, AUTOBURN at `version` with `lock`, at `integrity`, the capture `inTac` away.
function kestrelAt(inTac: number, version: SkillVersion, lock: LockLevel, integrity = 100): void {
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.store.update((d) => { d.run.stats.demos.push({ offsetTac: 0 }, { offsetTac: 0 }); });
  const file = giveSkillFile(h.store, 'autoburn', version, lock);
  h.store.update((d) => { const seg = d.memory.find((candidate) => candidate.id === file.id); if (seg && 'integrity' in seg) seg.integrity = integrity; });
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.stepUntil(() => captureInTac() <= inTac, 300);
}

// --- The range per level, and the bracket ---------------------------------------------------------------------------------
{
  const spans: number[] = [];
  for (const lock of [0, 1, 2] as const) {
    kestrelAt(300, 1, lock);
    const bracket = lockBracket(state(), getPrediction());
    const range = lockRangeTac(skillLive(state().memory, 'autoburn'));
    const spanTac = bracket ? (bracket.toInSec - bracket.fromInSec) / warp() : NaN;
    spans.push(spanTac);
    const inTac = captureInTac();
    const refusal = autoburnRefusal(state(), getPrediction());
    const expectIn = inTac <= LOCK_RANGE_TAC[lock];
    check(`LOCK ${LOCK_RANGE_TAC[lock]}: the range reads ${LOCK_RANGE_TAC[lock]}; the capture ${inTac.toFixed(0)} tac s off is ${expectIn ? 'inside' : 'TOO FAR'}`,
      range === LOCK_RANGE_TAC[lock] && (expectIn ? refusal === null : refusal === AUTOBURN_REFUSAL.tooFar), `${range} ${refusal}`);
    check(`…the bracket ends at START BURN and spans min(range, coast left): ${spanTac.toFixed(0)} tac s, inside ${bracket?.inside}`, bracket !== null
      && Math.abs(bracket.toInSec / warp() - inTac) < 0.5 && Math.abs(spanTac - Math.min(LOCK_RANGE_TAC[lock], inTac)) < 0.5 && bracket.inside === expectIn,
      JSON.stringify(bracket));
    const button = autoButton(state(), getPrediction());
    check(`…the AUTO button glows only inside it (${button.look})`, button.look === (expectIn ? 'ready' : 'blocked'), JSON.stringify(button));
  }
  console.log(`INFO the LOCK bracket 300 tac s before KESTREL's capture: ${spans.map((span) => span.toFixed(0)).join(' → ')} tac s`);
  check('LOCK 270 triples 90; 810 reaches back over the whole coast left', spans[1]! > 2.9 * spans[0]! && spans[2]! >= spans[1]!);
}

// --- Graded damage: one lock level per colour, and the pip ------------------------------------------------------------------
{
  kestrelAt(300, 2, 2, 64);
  const live = skillLive(state().memory, 'autoburn');
  const pip = autoburnPip(state());
  check('a v2 + LOCK 810 file at 64%: works as v1 with LOCK 270', live.version === 1 && live.lock === 1 && lockRangeTac(live) === 270,
    `v${live.version} lock ${live.lock}`);
  check('…its pip reads `AUTOBURN v2▸v1`, 64%, the degraded look', pip?.label === 'AUTOBURN v2▸v1' && pip.reading === '64%' && pip.look === 'degraded',
    JSON.stringify(pip));
  h.store.update((d) => { const seg = d.memory.find((candidate) => candidate.type === 'upgrade' && candidate.upgrade === 'autoburn'); if (seg && 'integrity' in seg) seg.integrity = 40; });
  check('…at 40% (failing) v2 is OFF: no range, refused DAMAGED', lockRangeTac(skillLive(state().memory, 'autoburn')) === null
    && autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.damaged && autoburnPip(state())?.label === 'AUTOBURN v2▸off');
}

// --- Entering the bracket: one chime; the button and the ghost for v2 ----------------------------------------------------------
{
  kestrelAt(150, 2, 0);
  const before = autoGhost(state(), getPrediction());
  const headBefore = autoButton(state(), getPrediction()).head;
  h.events.length = 0;
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 120);
  h.stepFor(1);
  const chimes = h.events.filter((event) => event.name === 'autoburn-in-lock').length;
  const ghost = autoGhost(state(), getPrediction());
  const button = autoButton(state(), getPrediction());
  check('entering the bracket sounds once (`autoburn-in-lock`)', chimes === 1, String(chimes));
  check('v2: the button names GREEN (`AUTO · GREEN [B]`, `MAKES IT GREEN`), outside the bracket too', button.head === AUTO_BUTTON_TEXT.modeHead('green')
    && button.note === AUTO_BUTTON_TEXT.readyGreen && headBefore === AUTO_BUTTON_TEXT.modeHead('green'), `${headBefore} | ${button.head} ${button.note}`);
  const ring = state().level.ring;
  check('…the ghost: none before [B] would engage, then GREEN\'s target loop (▼ kept, ▲ at max(▼, 0.95 of the ring\'s edge))', before === null && ghost?.mode === 'green'
    && Math.abs(ghost.raKm - Math.max(ghost.rpKm, RA_TARGET_FRAC * ring.max)) < 1 && Math.abs(ghost.rpKm - getPrediction().fit.rp) < 1, JSON.stringify(ghost));
}

// --- An 810 lock armed early holds no thread until the claim ---------------------------------------------------------------
{
  kestrelAt(600, 1, 2);
  h.press('KeyB');
  h.step();
  let held = 0;
  h.stepUntil(() => {
    if (!state().burn.auto.claimed) held = Math.max(held, threadsBusy());
    return state().burn.auto.claimed || state().burn.auto.phase !== 'armed';
  }, 300);
  check('LOCK 810 armed ~10 tac min out: no thread held while it waits, one at the claim', state().burn.auto.phase === 'armed' && state().burn.auto.claimed
    && held === 0 && threadsBusy() === 1, `${state().burn.auto.phase} held ${held} busy ${threadsBusy()}`);
}

finish();
