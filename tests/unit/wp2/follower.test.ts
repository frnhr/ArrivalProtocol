// WP2 acceptance 7: the WP1 literal follower still locks with the director in the loop (it obeys
// the composed strip, not the bare flight table), including WP1's three injected mistakes. Also:
// the strip never flickers, the moments fire once each in order (the juice and the stamps hang
// off them), and a SPACE held through a skipped boot does not burn until a fresh press.
import { check, finish } from '../wp1/harness';
import { createHarness2, followDirector, scriptOf, type Harness2, type FollowOpts } from './harness2';
import { receiveTransmission } from '@systems/boot';
import { OBJECTIVE_HYSTERESIS_SEC } from '@data/tuning';

const h = createHarness2(1);
const REACTION_SEC = 0.4;
const MAX_WALL = 400;

function summary(): string {
  const burn = h.store.getState().burn;
  return `status=${burn.status} wall=${h.wall().toFixed(1)}s fuel=${burn.fuelPct.toFixed(1)}%`;
}

// --- (d) the literal follower, reading the director's strip ---------------------------------------
{
  h.resetTo('flight');
  // Flicker watch: a calm line that comes back within the hysteresis window of leaving.
  const leftAt = new Map<string, number>();
  let lastId = '';
  let flickers = 0;
  const texts = followDirector(h, {
    reactionSec: REACTION_SEC,
    maxWall: MAX_WALL,
    mistake: () => {
      const line = h.shown();
      const id = line?.id ?? '';
      if (id !== lastId) {
        if (lastId) leftAt.set(lastId, h.wall());
        const left = leftAt.get(id);
        if (line && line.urgency !== 'now' && left !== undefined && h.wall() - left < OBJECTIVE_HYSTERESIS_SEC) flickers++;
        lastId = id;
      }
      return false;
    },
  });
  check('(d) the follower locks with the director in the loop', h.status() === 'locked', summary());
  check('(d) the strip never flickered', flickers === 0, `${flickers} flicker(s)`);
  console.log(`      script:\n      ${scriptOf(texts)}`);

  // The moments a clean flight produces, once each and in order.
  const names = h.events.map((event) => event.name);
  const once = (name: string): boolean => names.filter((candidate) => candidate === name).length === 1;
  check('events: CLEAR OF THE PLANET once', once('clear-of-planet'));
  check('events: CAPTURED (loop-closed) once', once('loop-closed'));
  check('events: locked once', once('locked'));
  const counts = h.events.filter((event) => event.name === 'lock-count').map((event) => (event.payload as { count: number }).count);
  check('events: HOLD STEADY counts 3, 2, 1', JSON.stringify(counts) === '[3,2,1]', JSON.stringify(counts));
  const order = (['clear-of-planet', 'loop-closed', 'lock-count', 'locked'] as const).map((name) => names.indexOf(name));
  check('events: in flight order', order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]!)), JSON.stringify(order));
  const lastCount = h.events.filter((event) => event.name === 'lock-count').at(-1)!;
  const locked = h.events.find((event) => event.name === 'locked')!;
  check('events: STABLE ORBIT about a second after the 1', Math.abs(locked.wall - lastCount.wall - 1) < 0.15,
    `${(locked.wall - lastCount.wall).toFixed(2)} s`);
  check('events: burn-point GET READY and NOW both fired', names.includes('burn-point')
    && h.events.some((event) => event.name === 'burn-point' && (event.payload as { stage: string }).stage === 'now'));
  const radio = h.log().filter((entry) => entry.speaker === 'companion').map((entry) => entry.text);
  check('voice: PAL said hello, clear, captured and locked', radio.length === 4
    && radio[0]!.startsWith('Hello') && radio[2] === 'Captured! Mostly. :)' && radio[3] === 'Great orbit! Probably. :)',
    radio.join(' | '));
}

// --- (e) the follower with WP1's injected mistakes -------------------------------------------------
type Mistake = { name: string; apply: NonNullable<FollowOpts['mistake']> };

function mistakes(): Mistake[] {
  return [
    (() => {
      let started = -1;
      let done = false;
      return {
        name: '2 s RETRO 60 tac s early',
        apply: (harness: Harness2, ctx: { holding: boolean; setHolding: (on: boolean) => void }) => {
          if (done) return false;
          const burnPointTac = harness.burnPointTac();
          const burn = harness.store.getState().burn;
          if (started < 0 && burn.sasMode === 'retrograde' && !burn.firing && burnPointTac !== null && burnPointTac <= 60 && harness.pred().outcome === 'open') {
            started = harness.wall();
            ctx.setHolding(true);
          }
          if (started < 0) return false;
          if (harness.wall() - started >= 2) { ctx.setHolding(false); done = true; return false; }
          return true;
        },
      };
    })(),
    (() => {
      let started = -1;
      let done = false;
      return {
        name: 'hold 2 s past RELEASE when green',
        apply: (harness: Harness2, ctx: { holding: boolean }) => {
          if (done) return false;
          if (started < 0 && harness.shown()?.id === 'F3' && ctx.holding) started = harness.wall();
          if (started < 0) return false;
          if (harness.wall() - started >= 2) { done = true; return false; }
          return true;
        },
      };
    })(),
    (() => {
      let started = -1;
      let done = false;
      return {
        name: 'capture 10 tac s late',
        apply: (harness: Harness2) => {
          if (done) return false;
          const state = harness.store.getState();
          if (started < 0 && harness.shown()?.id === 'F10-now') started = state.clock.tSec;
          if (started < 0) return false;
          if ((state.clock.tSec - started) / state.level.tacticalWarp >= 10) { done = true; return false; }
          return true;
        },
      };
    })(),
  ];
}

for (const mistake of mistakes()) {
  h.resetTo('flight');
  followDirector(h, { reactionSec: REACTION_SEC, maxWall: MAX_WALL, mistake: mistake.apply });
  const status = h.status();
  check(`(e) ${mistake.name}: locked or accepted, never crashed`, status === 'locked' || status === 'accepted', summary());
}

// --- (b) the idle pilot still crashes on time with the director running ----------------------------
{
  h.resetTo('flight');
  while (h.status() === 'approaching' && h.wall() < MAX_WALL) h.step();
  check('(b) idle pilot crashes at 163 ± 5 wall-s', h.status() === 'crashed' && Math.abs(h.wall() - 163) <= 5, summary());
  const alarmAt = h.events.find((event) => event.name === 'countdown-beep' && (event.payload as { kind: string }).kind === 'impact');
  check('(b) the impact beeps start 10 s before the crash', alarmAt !== undefined && Math.abs(h.wall() - alarmAt.wall - 10) < 0.3,
    alarmAt ? `${(h.wall() - alarmAt.wall).toFixed(2)} s before` : 'no beep');
  check('(b) PAL: "Oh no. :)"', h.log().some((entry) => entry.text === 'Oh no. :)'));
}

// --- A SPACE held through a skipped boot does not burn until pressed again --------------------------
{
  h.resetTo('title');
  h.step();
  check('boot: the page opens on the title', h.store.getState().run.phase === 'title');
  receiveTransmission(h.store);
  h.stepFor(1);
  // Playtest 1 (C-UNROLL): the first SPACE hurries the SELF-CHECK's stage, the second skips the rest (the title layer owns
  // the key) and stays held; the cut to amber waits until the findings it showed have been seen.
  h.keyDown('Space');
  h.keyUp('Space');
  check('boot: the first SPACE hurries the SELF-CHECK (still in blue)', h.store.getState().run.phase === 'boot' && h.store.getState().ui.mode === 'memory');
  h.keyDown('Space');
  h.stepFor(1.5);
  check('boot: the second SPACE skips the boot', h.store.getState().run.phase === 'flight' && h.store.getState().ui.mode === 'tools');
  h.stepFor(2);
  const burn = h.store.getState().burn;
  check('boot: the held SPACE does not burn', !burn.firing && burn.dvDeliveredKmS === 0, `firing ${burn.firing}, Δv ${burn.dvDeliveredKmS}`);
  h.keyUp('Space');
  h.keyDown('Space');
  h.stepFor(0.5);
  check('boot: a fresh press burns', h.store.getState().burn.firing && h.store.getState().burn.dvDeliveredKmS > 0);
  h.keyUp('Space');
  const bootLines = h.log().filter((entry) => entry.speaker === 'mind-sys').map((entry) => entry.text);
  // Track RETIRE: on run 1's arm the boot's TERMINAL also says the INBOX line after the three (`> 1 NEW MESSAGE · INBOX`).
  // C-UNROLL: the ECC line is a SELF-CHECK mark (logged, never typed); the other three type.
  check('boot: all three boot lines were said, even when skipped, then the INBOX line', bootLines.length === 4 && bootLines[2]!.startsWith('> ECC:')
    && bootLines[3]!.endsWith('INBOX') && h.log().filter((entry) => entry.speaker === 'mind-sys' && entry.mark === true).length === 1, bootLines.join(' | '));
}

finish();
