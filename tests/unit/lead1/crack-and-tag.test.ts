// LEAD-1 items 7 and 8, the headless halves (the browser halves are in shots.mjs, items 7 and 8, and
// fix1/probes/tag-fit.mjs).
// (8) The colonist crack replayed once if the kid TABbed out during the ~1.6 s crack itself: hiding the
//     view cancels the animation (animationcancel, not animationend), the chips kept .cracking, and
//     showing the view again restarted it from its first frame. settleCracks (run by ModeToggle just
//     before the memory view is shown) drops .cracking from chips whose crack has played on the reveal's
//     clock, and lets a chip still mid-crack continue where that clock is.
// (7) The hollow chip's owner name ellipsizes before its tag (`??? ATE C12` wrapped at 1280×720); since
//     review round 1, once HOLLOW is done for the ship (hollow-quiet) the tag drops under a name that
//     does not fit beside it (`UNIT-046` / `ATE C12`, not `UN… ATE C12`).
import { readFileSync } from 'node:fs';
import { check, finish } from '../wp1/harness';
import { createHarness5 } from '../wp5/harness5';
import { revealSouls, crackDelaySec } from '@systems/reveal';
import { setMode } from '@systems/mode';
import { settleCracks } from '@components/memory-view/SegmentBlock';
import { REVEAL_CRACK_ANIM_SEC, REVEAL_CRACK_STAGGER_SEC } from '@data/tuning';

// --- (8) settleCracks against the real reveal clock, on stand-in chips ----------------------------------
interface FakeChip { dataset: { cluster: string }; classList: { remove(name: string): void }; style: { setProperty(name: string, value: string): void }; classes: Set<string>; delay: string | null }

function fakeStrip(codes: readonly string[]): { root: ParentNode; chips: FakeChip[] } {
  const chips: FakeChip[] = codes.map((code) => {
    const chip: FakeChip = {
      dataset: { cluster: code },
      classes: new Set(['seg', 'soul', 'cracking']),
      delay: null,
      classList: { remove: (name) => { chip.classes.delete(name); } },
      style: { setProperty: (name, value) => { if (name === '--crack-delay') chip.delay = value; } },
    };
    return chip;
  });
  const root = {
    querySelectorAll: (selector: string) => {
      if (selector !== '.seg.soul.cracking') throw new Error(`unexpected selector ${selector}`);
      return chips.filter((chip) => chip.classes.has('cracking'));
    },
  } as unknown as ParentNode;
  return { root, chips };
}

const h = createHarness5(1);
const codes = Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
const crackSec = (codes.length - 1) * REVEAL_CRACK_STAGGER_SEC + REVEAL_CRACK_ANIM_SEC;

// Plays the reveal in blue up to the moment the slabs crack (the kid is watching).
function toTheCrack(): void {
  h.resetTo('flight');
  h.noFault();
  setMode(h.store, 'memory');
  revealSouls(h.store, 'scan');
  h.stepUntil(() => h.events.some((event) => event.name === 'crack-shown'), 30);
}

{
  toTheCrack();
  h.stepFor(0.3);                     // a third of the way into the ~1.6 s crack…
  setMode(h.store, 'tools');           // …the kid TABs out (the view is display:none: the animations cancel)
  h.stepFor(2);                       // the crack's time runs out while they are away
  const { root, chips } = fakeStrip(codes);
  settleCracks(root);
  const still = chips.filter((chip) => chip.classes.has('cracking')).map((chip) => chip.dataset.cluster);
  check(`TAB out mid-crack, back after it would have ended: no chip keeps .cracking, so nothing replays (crack ${crackSec.toFixed(2)} s)`,
    still.length === 0 && codes.every((code) => crackDelaySec(code) === null), still.join(',') || 'none');
}

{
  toTheCrack();
  h.stepFor(0.3);
  setMode(h.store, 'tools');
  h.stepFor(0.2);                     // a quick double TAB: back while the crack is still running
  const { root, chips } = fakeStrip(codes);
  settleCracks(root);
  const first = chips[0]!;
  const last = chips[chips.length - 1]!;
  check('a quick double TAB mid-crack: the chips still cracking continue where the reveal\'s clock is (negative delay)',
    !first.classes.has('cracking') || (first.delay !== null && Number.parseFloat(first.delay) < 0),
    `C01 ${first.classes.has('cracking') ? `continues at ${first.delay}` : 'done'}, C12 ${last.classes.has('cracking') ? `at ${last.delay}` : 'done'}`);
  check('…and a chip that has not started yet keeps its wait for its turn', last.classes.has('cracking') && last.delay !== null,
    `C12 delay ${last.delay}`);
}

{
  // The crack that played out of sight (the 12 s cap cracked the slabs in amber) is kept whole for the first look.
  h.resetTo('flight');
  h.noFault();
  revealSouls(h.store, 'scan');
  h.stepUntil(() => h.events.some((event) => event.name === 'souls-unsealed'), 40);
  const { root, chips } = fakeStrip(codes);
  settleCracks(root);
  check('a crack nobody saw yet is left whole for the first look (every chip keeps .cracking, C01 from 0 s)',
    chips.every((chip) => chip.classes.has('cracking')) && chips[0]!.delay === '0.000s', `C01 delay ${chips[0]!.delay}`);
}

// --- (7) the hollow chip's name: one line, cut before the tag; the tag under it once the chip is quiet ------
{
  const css = readFileSync('src/styles/game.css', 'utf8');
  const rule = /\.seg\.hollow \.hollow-head \.seg-name \{([^}]*)\}/g;
  const rules = [...css.matchAll(rule)];
  const bodies = rules.map((match) => match[1] ?? '').join(' ');
  const wants = ['white-space: nowrap', 'min-width: 0', 'overflow: hidden', 'text-overflow: ellipsis', 'display: block'];
  const missing = wants.filter((want) => !bodies.includes(want));
  const tagWhole = /\.seg\.hollow \.hollow-tag \{[^}]*flex-shrink: 0[^}]*white-space: nowrap/.test(css);
  check('the hollow chip\'s name is one line that ellipsizes, and the tag never shrinks or wraps',
    missing.length === 0 && tagWhole, missing.length ? `missing: ${missing.join(', ')}` : 'rule present');
  check('review round 1: one rule for the name (the duplicate is merged), and a quiet chip lets the tag drop under it',
    rules.length === 1 && /\.seg\.hollow\.hollow-quiet \.hollow-head \{[^}]*flex-wrap: wrap/.test(css)
    && !/\.seg\.hollow \.hollow-head \{[^}]*flex-wrap/.test(css), `${rules.length} name rule(s)`);
}

finish();
