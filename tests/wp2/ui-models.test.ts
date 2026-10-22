// WP2 part 2: the DOM-free models behind the new UI. Header crumbs (§7.1) through a whole flight,
// the strip's upcoming events, the typewriter core (key caps pop in whole, spaces are silent,
// the lead-in), the HOLD STEADY count, and the reduced-motion flag in the initial state.
import { check, finish } from '../wp1/harness';
import { createHarness2, followDirector } from './harness2';
import { headerCrumbs, upcomingEvents, splitKeyCaps, type HeaderCrumbs } from '@systems/flight-hud';
import { lockCount } from '@systems/flight-events';
import { getPrediction } from '@systems/predict';
import { mainCountdown } from '@systems/pace';
import { receiveTransmission } from '@systems/boot';
import { createInitialState } from '@state/initial';
import { partsLength, revealParts, unitChar, unitsAt } from '../../src/components/hud/typewriter';
import { LOCK_HOLD_AI_SEC, MAX_LINE_CHARS, UPCOMING_EVENTS_MAX } from '@data/tuning';

const h = createHarness2(1);
const crumbs = (): HeaderCrumbs => headerCrumbs(h.store.getState(), getPrediction());

// --- Header crumbs ---------------------------------------------------------------------------
{
  h.resetTo('title');
  h.step();
  check('crumbs: title → STANDBY', crumbs().phase.text === 'STANDBY' && crumbs().unit === 'UNIT-047' && crumbs().ship === 'ARES-VII',
    JSON.stringify(crumbs()));
  receiveTransmission(h.store);
  h.step();
  check('crumbs: boot → RECEIVING', crumbs().phase.text === 'RECEIVING');

  h.resetTo('flight');
  h.step();
  check('crumbs: the opening reads IMPACT COURSE in red', crumbs().phase.text === 'IMPACT COURSE' && crumbs().phase.tone === 'danger');
  const seen: string[] = [];
  const upcoming: string[] = [];
  let upcomingTooMany = false;
  let upcomingRepeatsChip = false;
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 300,
    mistake: () => {
      const phase = crumbs().phase.text;
      if (seen[seen.length - 1] !== phase) seen.push(phase);
      const line = upcomingEvents(h.store.getState(), getPrediction());
      if (line) {
        const items = line.replace(' ▸▸', '').split(' · ');
        if (items.length > UPCOMING_EVENTS_MAX) upcomingTooMany = true;
        const chip = mainCountdown(h.store.getState(), getPrediction());
        const chipGlyph = chip?.kind === 'peri' ? '▼' : chip?.kind === 'apo' ? '▲' : null;
        if (chipGlyph && items.some((item) => item.startsWith(chipGlyph))) upcomingRepeatsChip = true;
        const generic = line.replace(/\d\d:\d\d/g, 'mm:ss');
        if (upcoming[upcoming.length - 1] !== generic) upcoming.push(generic);
        if (line.length > MAX_LINE_CHARS) upcomingTooMany = true;
      }
      return false;
    },
  });
  seen.push(crumbs().phase.text);
  console.log(`      crumbs: ${seen.join(' → ')}`);
  console.log(`      upcoming: ${upcoming.join(' → ')}`);
  const expectedOrder = ['IMPACT COURSE', 'FLYBY', 'GET READY', 'CAPTURED', 'IN RING', 'HOLD STEADY', 'ORBIT LOCKED'];
  const positions = expectedOrder.map((word) => seen.indexOf(word));
  check('crumbs: a clean flight walks IMPACT COURSE → FLYBY → GET READY → CAPTURED → IN RING → HOLD STEADY → ORBIT LOCKED',
    positions.every((index, i) => index >= 0 && (i === 0 || index > positions[i - 1]!)), seen.join(' → '));
  check('crumbs: ORBIT LOCKED is green', crumbs().phase.tone === 'good');
  check('upcoming: never more than 2 events, never longer than a line', !upcomingTooMany);
  check('upcoming: never repeats the ▼/▲ the header chip counts', !upcomingRepeatsChip);
  check('upcoming: shows something during the coast', upcoming.some((line) => line.includes('▼') || line.includes('▲')));
  check('upcoming: empty once the flight is over', upcomingEvents(h.store.getState(), getPrediction()) === '');

  h.resetTo('flight');
  h.step();
  check('upcoming: nothing to add on the opening impact course', upcomingEvents(h.store.getState(), getPrediction()) === '');
  while (h.status() === 'approaching' && h.wall() < 400) h.step();
  check('crumbs: a crash reads CRASHED', crumbs().phase.text === 'CRASHED' && crumbs().phase.tone === 'danger');
}

// --- Typewriter core ---------------------------------------------------------------------------
{
  const parts = splitKeyCaps("DON'T HIT THE PLANET — hold [SPACE]");
  check('typewriter: a key cap counts as one unit', partsLength(parts) === "DON'T HIT THE PLANET — hold ".length + 1, String(partsLength(parts)));
  const beforeCap = revealParts(parts, "DON'T HIT THE PLANET — hold ".length);
  check('typewriter: the cap is not shown before its turn', beforeCap.every((part) => !part.key));
  const all = revealParts(parts, partsLength(parts));
  check('typewriter: the cap pops in whole', all.at(-1)?.key === true && all.at(-1)?.text === 'SPACE');
  check('typewriter: a partial reveal cuts inside the text', revealParts(parts, 3).map((part) => part.text).join('') === 'DON');
  check('typewriter: unitChar finds spaces (silent ticks)', unitChar(parts, 5) === ' ' && unitChar(parts, 0) === 'D');
  check('typewriter: unitChar of the key cap is empty', unitChar(parts, partsLength(parts) - 1) === '');
  check('typewriter: nothing during the lead-in', unitsAt(0.2, 0.3, 40, 50) === 0);
  check('typewriter: 40 cps after the lead-in', unitsAt(0.3 + 0.5, 0.3, 40, 50) === 20);
  check('typewriter: never past the end', unitsAt(10, 0, 40, 50) === 50);
}

// --- HOLD STEADY count -------------------------------------------------------------------------
{
  check('lock count: none before the hold', lockCount(0) === null);
  check('lock count: 3 the moment it starts', lockCount(0.001) === 3);
  check('lock count: 2 after one second', lockCount(1.2) === 2);
  check('lock count: 1 in the last second', lockCount(LOCK_HOLD_AI_SEC - 0.01) === 1 && lockCount(LOCK_HOLD_AI_SEC + 0.2) === 1);
}

// --- Reduced motion lives in the state (the page seeds it from prefers-reduced-motion) ---------
{
  check('reduced motion: off by default', createInitialState({ seed: 1 }).ui.reducedMotion === false);
  check('reduced motion: carried by createInitialState', createInitialState({ seed: 1, reducedMotion: true }).ui.reducedMotion === true);
}

finish();
