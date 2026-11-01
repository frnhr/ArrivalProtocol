// Phase 3 slice 2: ships 1–2 are calm; cases A and B plant phase 2's root and its ARRIVAL stage (support/hollow-world.ts
// phase2ShipOne), whose story timing is the same code on every ARRIVAL.
// LEAD-1 review round 1, slice 1a (story-printer became story-landing): HOLLOW's story after the ship-1 fight and the
// landing. Phase 2's printer went quiet for the story; the landing's launches and touchdowns are the kid's (and the
// instant landing's) and may come at any moment, so what holds is the story's own rule: each beat waits until BOTH
// screens have typed every line said before it (launch and touchdown echoes included), plus its silence, and the
// LANDING REPORT waits for the story.
// • A: POD 01 repaired after the lock; the pods launch while the story is being told (right after `> ...047?`):
//   CONTROL still comes a full silence after their echoes have typed, `> ...047?` a silence after every line before it,
//   and the LANDING REPORT only once the story is told.
// • B: the kid who never TABs: POD 01 is eaten after the lock; `> ...047?` comes a silence after HOLLOW's slow eat echo
//   has typed; the report waits for the story, and POD 01 is parked (eaten).
// • (C, the colonists ask standing aside for an owed reveal: gone with the reveal.)
// • D: say.ts createStory: a beat ready from its first check waits for the voices only; one seen not ready counts its
//   silence from the moment it became ready.
import { check, finish, followStrip } from '../../wp1/harness';
import { createHarness6 } from '../../wp6/harness6';
import { actionRepair } from '@state/actions';
import { installTool } from '@systems/licences';
import { getByRole } from '@state/selectors';
import { say, createStory, typingSec, voicesQuietFromAi } from '@systems/say';
import { podRecord } from '@systems/landing-rules';
import { HOLLOW_STORY } from '@data/hollow-text';
import { HOLLOW_STORY_SILENCE_SEC } from '@data/tuning';
import type { LogEntry } from '@state/schema';
import { phase2ShipOne } from '../../support/hollow-world';
import { setLandingMode, landInstantly } from '../../support/landing-instant';

const TICK = 0.05;
const h = createHarness6(1, { soulsFound: false });
setLandingMode('manual');
const state = () => h.store.getState();
const now = () => state().clock.aiSec;

// The end of a line's typing on its screen, by the screens' own sequential queues (say.ts channelTypedByAi).
function typedEnd(entry: LogEntry): number {
  let typedBy = -Infinity;
  for (const other of state().log.entries) {
    if (other.channel !== entry.channel) continue;
    typedBy = Math.max(other.t, typedBy) + typingSec(other.speaker, other.text);
    if (other.id === entry.id) return typedBy;
  }
  throw new Error(`no log entry ${entry.id}`);
}
// The moment both screens had finished typing every line said before `entry`.
function quietBefore(entry: LogEntry): number {
  let quiet = -Infinity;
  for (const other of state().log.entries) {
    if (other.id === entry.id) break;
    quiet = Math.max(quiet, typedEnd(other));
  }
  return quiet;
}
const podEchoes = (): LogEntry[] => state().log.entries.filter((entry) => entry.speaker === 'cmd' && /^> (launch pod|pod\d\d)/.test(entry.text));
const find = (speaker: string, text: string): LogEntry | undefined =>
  state().log.entries.find((entry) => entry.speaker === speaker && entry.text === text);

// Steps to the LANDING REPORT, noting when the story was pending and told; `each` runs every tick.
function toReport(each?: () => void): { pendingAt: number; toldAt: number } {
  let pendingAt = NaN;
  let toldAt = NaN;
  h.stepUntil(() => {
    each?.();
    if (Number.isNaN(pendingAt) && state().hollow.story === 'pending') pendingAt = now();
    if (Number.isNaN(toldAt) && state().hollow.story === 'told') toldAt = now();
    return state().run.phase === 'report';
  }, 240);
  return { pendingAt, toldAt };
}

// --- A: the pods launch while the story is told ---------------------------------------------------------------------
{
  h.resetTo('flight');
  phase2ShipOne(h.store);
  followStrip(h, 0.4, 400, () => {
    const line = state().director.shown;
    if (line?.id === 'tut-repair-engine' || line?.id === 'tut-engine-weak') {
      const engine = getByRole(state(), 'engine-io');
      if (engine && engine.type === 'tool' && engine.state !== 'repairing') actionRepair(h.store, engine);
    }
  });
  const locked = h.status() === 'locked';
  h.step();
  const pod1 = h.maybeSoul('POD 01');
  if (!state().run.licences.includes('repair')) installTool(h.store, 'repair');
  const repaired = pod1 !== null && pod1.infected !== undefined && actionRepair(h.store, pod1) === null;
  let launchedAt = NaN;
  const { pendingAt, toldAt } = toReport(() => {
    // The pods go the moment `> ...047?` has been said (the story half told).
    if (Number.isNaN(launchedAt) && find('hollow', HOLLOW_STORY.noticed(47)) !== undefined) {
      launchedAt = now();
      landInstantly(h.store);
    }
  });
  const noticed = find('hollow', HOLLOW_STORY.noticed(47));
  const control = find('control', HOLLOW_STORY.control);
  const echoes = podEchoes().filter((entry) => entry.t >= launchedAt);
  check('A setup: locked with POD 01 still being eaten, repaired after the lock, the story told, the pods launched during it',
    locked && repaired && !Number.isNaN(pendingAt) && !Number.isNaN(toldAt) && echoes.length >= 3 && launchedAt < toldAt,
    `${h.status()}, repaired ${repaired}, story ${pendingAt.toFixed(2)}–${toldAt.toFixed(2)}, launched ${launchedAt.toFixed(2)}, ${echoes.length} echoes`);
  check('A: `> ...047?` and CONTROL each come a full silence after every line before them has typed (the pods\' echoes too)',
    noticed !== undefined && control !== undefined
    && noticed.t >= quietBefore(noticed) + HOLLOW_STORY_SILENCE_SEC - TICK && control.t >= quietBefore(control) + HOLLOW_STORY_SILENCE_SEC - TICK
    && echoes.every((entry) => typedEnd(entry) <= control.t),
    noticed && control ? `047 ${noticed.t.toFixed(2)} (quiet from ${quietBefore(noticed).toFixed(2)}), CONTROL ${control.t.toFixed(2)} `
      + `(quiet from ${quietBefore(control).toFixed(2)})` : 'a story line was never said');
  check('A: the LANDING REPORT comes only once the story is told, with all 600 down', state().run.phase === 'report'
    && state().landing.pods.every((record) => record.fate.kind === 'down'), state().run.phase);
}

// --- B: the kid who never TABs: POD 01 is eaten after the lock ------------------------------------------------------
{
  h.resetTo('flight');
  phase2ShipOne(h.store);
  let lockedAt = NaN;
  followStrip(h, 0.4, 400);
  if (h.status() === 'locked') lockedAt = now();
  let eatenAt = NaN;
  let echo: LogEntry | undefined;
  const { pendingAt, toldAt } = toReport(() => {
    echo ??= state().log.entries.find((entry) => entry.speaker === 'hollow' && entry.text.startsWith('> eat pod01'));
    if (echo && Number.isNaN(eatenAt)) {
      eatenAt = echo.t;
      // The fight is decided: the two pods left go down.
      landInstantly(h.store);
    }
  });
  const noticed = find('hollow', HOLLOW_STORY.noticed(47));
  const echoTypedBy = echo ? typedEnd(echo) : NaN;
  const pod1 = podRecord(state(), 1).fate;
  check('B setup: locked with POD 01 still being eaten, and POD 01 eaten after the lock',
    !Number.isNaN(lockedAt) && eatenAt > lockedAt, `locked ${lockedAt.toFixed(2)}, eaten ${eatenAt.toFixed(2)}`);
  check('B: `> ...047?` comes a full silence after HOLLOW\'s slow eat echo (and the pods\' echoes) have typed',
    noticed !== undefined && noticed.t >= echoTypedBy + HOLLOW_STORY_SILENCE_SEC - TICK && noticed.t >= quietBefore(noticed) + HOLLOW_STORY_SILENCE_SEC - TICK,
    `eaten ${eatenAt.toFixed(2)}, echo typed by ${echoTypedBy.toFixed(2)}, 047 at ${noticed?.t.toFixed(2)}`);
  check('B: the LANDING REPORT waits for the story; POD 01 is parked (eaten, restorable)', state().run.phase === 'report'
    && !Number.isNaN(toldAt) && pendingAt <= toldAt && pod1.kind === 'parked' && pod1.why === 'eaten', `${state().run.phase} ${JSON.stringify(pod1)}`);
}

// --- D: createStory, a beat ready from its first check vs one that becomes ready -----------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.stepFor(12);
  say('hollow', '> a line before the story', { critical: true });
  let readyLater = false;
  const started = now();
  const story = createStory([
    { ready: () => true, silenceSec: 1, tell: () => { say('hollow', '> ready at once', { critical: true }); } },
    { ready: () => readyLater, silenceSec: 1, tell: () => { say('hollow', '> ready later', { critical: true }); } },
  ], started);
  let quietForSecond = NaN;
  let readyAt = NaN;
  for (let i = 0; i < 600 && !story.advance(h.store); i++) {
    h.step();
    if (find('hollow', '> ready at once') && Number.isNaN(quietForSecond)) quietForSecond = voicesQuietFromAi(state());
    if (!readyLater && now() > quietForSecond + 3) { readyLater = true; readyAt = now(); }
  }
  const before = find('hollow', '> a line before the story')!;
  const first = find('hollow', '> ready at once')!;
  const second = find('hollow', '> ready later')!;
  check('D: a beat ready from its first check is told its silence after the voices are quiet (no wait of its own)',
    Math.abs(first.t - (typedEnd(before) + 1)) <= 2 * TICK, `typed by ${typedEnd(before).toFixed(2)}, told ${first.t.toFixed(2)}`);
  check('D: a beat that was not ready counts its silence from the moment it became ready, though the voices were long quiet',
    second.t >= readyAt + 1 - TICK && second.t <= readyAt + 1 + 2 * TICK, `ready ${readyAt.toFixed(2)}, told ${second.t.toFixed(2)}`);
}

finish();
