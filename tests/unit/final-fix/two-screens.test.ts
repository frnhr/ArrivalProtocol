// Phase 3 slice 2: KESTREL has no root any more, so the FIREWALL case plays on VESPER (HOLLOW boarded there), and the COPY
// case gives VESPER the HUNT stage, whose seeds hunt tools.
// Final fix pass (the final review's third major): a lesson worded for each screen (its amber `-tab` line and its blue
// line) retires as one, so the two screens' strips stop sending the kid back and forth. The kid run looped for 22 s
// and 33 s (.tmp/final-review/journey/kj-full-1440.log):
// • KESTREL: `[TAB], MOVE your FIREWALL (FW) next to UNIT-046` in amber; in blue its twin stood its 15 s and retired, the
//   blue strip said `TURN AROUND — [TAB], press [S] (RETRO)`, and back in amber the -tab twin (on the strip for only a
//   few seconds) asked for the TAB again;
// • VESPER: the COPY lesson the same way (`… IS HUNTING YOUR TOOLS — [TAB], COPY your Repair`).
// Each case is played on the live director (harness11, every DOM-free system): the amber wording first (8 AI s), then
// the blue one until it retires. Then each screen's strip is read: both wordings are done, neither screen shows the
// lesson any more, the two screens name the same next step (one line, its [TAB] twin, or the flight's SKIP and blue's
// MIND CLEAR), and they do not both ask for a TAB. Also: maxShownSec and the one-shot completion are counted per lesson
// (director.ts completedOneShots, outlivedOneShots), checked on the real rule table.
// Usage: node_modules/.bin/tsx --tsconfig tsconfig.json tests/unit/final-fix/two-screens.test.ts
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { followDirector } from '../wp2/harness2';
import { setMode } from '@systems/mode';
import { installTool, installAddress } from '@systems/licences';
import { cardFiles } from '@systems/draft';
import { replaceRange, mergeAdjacentFree, newSegId } from '@systems/memory-ops';
import { setIntegrity } from '@state/actions';
import { outlivedOneShots, lessonOf } from '@systems/director';
import { GUIDE_RULES } from '@data/script';
import { COPY_LESSON_SHOW_SEC, FIREWALL_HINT_SHOW_SEC } from '@data/tuning';
import type { GameState, ObjectiveLine, ViewMode } from '@state/schema';
import { phase2HollowOf } from '../support/hollow-world';

const h = createHarness11(7);
const state = (): Readonly<GameState> => h.store.getState();
const shown = (): ObjectiveLine | null => state().director.shown;

// The pure half first: one clock per lesson on the real rule table.
{
  const clock = new Map<string, number>();
  const early = outlivedOneShots(GUIDE_RULES, 'firewall-place-tab', FIREWALL_HINT_SHOW_SEC - 1, clock);
  const late = outlivedOneShots(GUIDE_RULES, 'firewall-place', 1, clock);
  check('maxShownSec counts the lesson: 14 s on the amber wording and 1 s on the blue one retire both',
    early.length === 0 && late.includes('firewall-place') && late.includes('firewall-place-tab'), `${early} / ${late}`);
  // Phase 3 slice 2: the first-seed lesson has a second pair of twins, the beam seeds' (data/threat-rules.ts).
  const lessons: [string, number][] = [['firewall-place', 2], ['copy-repair', 2], ['wall-rule', 2], ['seed-first', 4]];
  check('the twins of the FIREWALL, COPY and WALL-rule lessons each name one lesson, and the first-seed lesson\'s two pairs too',
    lessons.every(([lesson, wordings]) => GUIDE_RULES.filter((rule) => lessonOf(rule) === lesson).length === wordings));
}

// Flies the strip (the guidance follower) until the flight's own line is a WAIT: the coast.
class Coasting extends Error {}
function flyToCoast(maxWall: number): void {
  try {
    followDirector(h, {
      reactionSec: 0.4,
      maxWall,
      mistake: () => {
        if (h.objective()?.urgency === 'wait') throw new Coasting();
        return false;
      },
    });
  } catch (error) {
    if (!(error instanceof Coasting)) throw error;
  }
  h.keyUp('Space');
  if (h.objective()?.urgency !== 'wait') throw new Error(`two-screens: no coast (${h.objective()?.text})`);
}

function stepWall(sec: number): void {
  const end = h.wall() + sec;
  while (h.wall() < end) h.step();
}

// The line the strip settles on in `mode` (past the 0.3 s hysteresis).
function lineIn(mode: ViewMode): ObjectiveLine | null {
  setMode(h.store, mode);
  stepWall(0.6);
  return shown();
}

const asksTab = (line: ObjectiveLine | null): boolean => line !== null && (line.keys.includes('TAB') || line.text.includes('[TAB]'));
// The same next step on both screens: one line, a line and its [TAB] twin (a lesson's wordings, or `x` and `x-tab`), or
// SKIP named twice (the flight's `… · [F] SKIP` in amber, `MIND CLEAR — press [F] to SKIP` in blue).
function sameStep(amber: ObjectiveLine | null, blue: ObjectiveLine | null): boolean {
  if (amber === null || blue === null) return amber === blue;
  if (amber.id === blue.id || amber.id === `${blue.id}-tab`) return true;
  const ruleOf = (id: string) => GUIDE_RULES.find((rule) => rule.id === id);
  const amberRule = ruleOf(amber.id);
  const blueRule = ruleOf(blue.id);
  if (amberRule && blueRule && lessonOf(amberRule) === lessonOf(blueRule)) return true;
  const offersSkip = (line: ObjectiveLine): boolean => line.id === 'hint-mind-clear' || (line.source === 'flight' && line.keys.includes('F'));
  return offersSkip(amber) && offersSkip(blue);
}

// The kid's back-and-forth: the amber wording for `amberSec`, then TAB, and the blue one until it retires.
function playLesson(name: string, amberId: string, blueId: string, retireBy: number, amberSec = 8): void {
  setMode(h.store, 'tools');
  stepWall(0.6);
  check(`${name}: in amber the strip shows the lesson (${amberId})`, shown()?.id === amberId, shown()?.text);
  stepWall(amberSec - 0.6);
  setMode(h.store, 'memory');
  stepWall(0.6);
  check(`${name}: TAB, and in blue its twin (${blueId})`, shown()?.id === blueId, shown()?.text);
  const end = h.wall() + retireBy;
  while (!state().director.done.includes(blueId) && h.wall() < end) h.step();
  const retiredAt = h.wall();
  check(`${name}: the blue twin retires`, state().director.done.includes(blueId));
  check(`${name}: …and the amber wording with it (one lesson, one clock)`, state().director.done.includes(amberId));
  const blue = lineIn('memory');
  const amber = lineIn('tools');
  console.log(`      ${name} after ${(retiredAt - (end - retireBy)).toFixed(1)} s in blue: blue [${blue?.id}] ${blue?.text} | amber [${amber?.id}] ${amber?.text}`);
  check(`${name}: neither screen shows the lesson again`, blue?.id !== blueId && amber?.id !== amberId && blue?.id !== amberId && amber?.id !== blueId);
  check(`${name}: both screens name the same next step`, sameStep(amber, blue), `amber ${amber?.id} · blue ${blue?.id}`);
  check(`${name}: the two screens do not both send the kid to the other one ([TAB])`, !(asksTab(amber) && asksTab(blue)),
    `amber ${amber?.text} · blue ${blue?.text}`);
}

// --- The FIREWALL to place (phase 3 slice 2: on VESPER, the first ship with HOLLOW's root aboard; KESTREL has none) ----
{
  h.vesper(7, { hollowAsleep: true });
  for (const kind of ['repair', 'move'] as const) if (!state().run.licences.includes(kind)) installTool(h.store, kind);
  // A healthy Thrust Ctrl: no uncommanded bursts and their alarms on this coast.
  h.store.update((d) => {
    const thrust = d.memory.find((seg) => seg.type === 'ship' && seg.role === 'thrust-ctrl');
    if (!thrust || !('integrity' in thrust)) throw new Error('two-screens: no Thrust Ctrl');
    setIntegrity(thrust, 100);
    d.ui.memoryRev++;
  });
  flyToCoast(400);
  // A FIREWALL carried in, as a card's file arrives (debug.ts giveCard), and HOLLOW awake with its timers held still.
  h.store.update((d) => {
    for (const file of cardFiles('firewall', newSegId)) {
      const addr = installAddress(d.memory, file.size);
      replaceRange(d.memory, addr, addr + file.size, [file], { opId: null, own: [] });
    }
    mergeAdjacentFree(d.memory);
    d.hollow.phase = 'awake';
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.ui.memoryRev++;
  });
  playLesson('VESPER (FIREWALL)', 'firewall-place-tab', 'firewall-place', FIREWALL_HINT_SHOW_SEC + 5);
}

// --- VESPER: the COPY lesson ---------------------------------------------------------------------------------------
{
  h.vesper(7, { hollowAsleep: true });
  for (const kind of ['repair', 'move', 'delete'] as const) if (!state().run.licences.includes(kind)) installTool(h.store, kind);
  // A healthy Thrust Ctrl (no uncommanded bursts and their alarms on this coast) and the seeds on their way.
  h.store.update((d) => {
    const thrust = d.memory.find((seg) => seg.type === 'ship' && seg.role === 'thrust-ctrl');
    if (!thrust || !('integrity' in thrust)) throw new Error('two-screens: no Thrust Ctrl');
    setIntegrity(thrust, 100);
    // Phase 3 slice 2: tool-hunting seeds are the HUNT stage's (phase 2's VESPER), which the fixed five no longer reach.
    d.hollow.cfg = phase2HollowOf(3);
    d.hollow.seedsLanded = 1;
    d.ui.memoryRev++;
  });
  stepWall(1);
  if (!state().run.licences.includes('copy')) throw new Error('two-screens: COPY not licensed on VESPER');
  playLesson('VESPER', 'tut-copy-repair-tab', 'tut-copy-repair', COPY_LESSON_SHOW_SEC + 5);
}

finish();
