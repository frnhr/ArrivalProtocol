// Playtest 1, A-LAND (Fran's notes 10 and 23; docs/phase3/impl/playtest-1-plan.md §3.4.3): landing more pods than an LZ was
// planned for asks first, and the question is now plain to see and to answer from the keys the kid already has under the
// fingers:
// • [L]'s guards ask through landing-controls.ts launchConfirmRequest: centred (placement 'centre'), answered by a second
//   [L] or ENTER (yes), [N] or ESC (no); a tool's delete keeps the cursor pill, ENTER and ESC (confirmAnswerFor);
// • the real key path: the first [L] (game layer) asks, its keyup and its auto-repeat never answer it (input.ts: a keyup
//   goes to the layer that saw the keydown), a second fresh [L] lands the pod mislanded; [N] keeps it aboard;
// • the words: `LZ-A IS FULL · LAND IT ANYWAY? scores n`, `DOT OFF-SITE · LAUNCH ANYWAY? …`, and the POD BAY's status says
//   the state alone (`DOT OFF-SITE`, `LZ-A FULL`: no `asks first`).
import { check, finish } from './checks';
import type { ConfirmRequest } from '@systems/fs-tools';
import { registerKeys, pushModal } from '@systems/input';
import { launchConfirmRequest, registerLandingKeys } from '@systems/landing-controls';
import { confirmAnswerFor, CONFIRM_ANSWER_CODES } from '@components/hud/InlineConfirm';
import { LAUNCH_CONFIRM_TEXT, POD_BAY_STATUS_TEXT } from '@data/landing-text';
import { lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { setLandingMode } from '../support/landing-instant';
import { podRecord } from '@systems/landing-rules';
import { DRIVER_RULES } from '@data/script';
import { MAX_LINE_CHARS } from '@data/tuning';

// --- The request and its keys ------------------------------------------------------------------------------------------
const noop = (): void => {};
const asked = launchConfirmRequest(LAUNCH_CONFIRM_TEXT.full('LZ-A', 150), noop);
check('[L]\'s guard asks centred, `[L] YES` / `[N] NO`, with the key hint under them',
  asked.placement === 'centre' && asked.answers?.yes === '[L] YES' && asked.answers.no === '[N] NO' && asked.keys === LAUNCH_CONFIRM_TEXT.keys,
  JSON.stringify(asked));
check('…a second [L] or ENTER says yes, [N] or ESC no, anything else nothing',
  confirmAnswerFor(asked, 'KeyL') === true && confirmAnswerFor(asked, 'Enter') === true && confirmAnswerFor(asked, 'NumpadEnter') === true
  && confirmAnswerFor(asked, 'KeyN') === false && confirmAnswerFor(asked, 'Escape') === false
  && confirmAnswerFor(asked, 'Space') === null && confirmAnswerFor(asked, 'KeyG') === null);
check('…every key it names is one the confirm layer hears',
  [...(asked.yesCodes ?? []), ...(asked.noCodes ?? [])].every((code) => CONFIRM_ANSWER_CODES.includes(code)));
const toolDelete: ConfirmRequest = { text: { question: 'DELETE CARGO CTRL?', detail: '' }, onYes: noop };
check('a tool\'s delete keeps the cursor pill: ENTER yes, ESC no, and [L] / [N] answer nothing there',
  toolDelete.placement === undefined && confirmAnswerFor(toolDelete, 'Enter') === true && confirmAnswerFor(toolDelete, 'Escape') === false
  && confirmAnswerFor(toolDelete, 'KeyL') === null && confirmAnswerFor(toolDelete, 'KeyN') === null);

// --- The words --------------------------------------------------------------------------------------------------------
check('the full LZ: `LZ-A IS FULL · LAND IT ANYWAY? scores 150`', LAUNCH_CONFIRM_TEXT.full('LZ-A', 150) === 'LZ-A IS FULL · LAND IT ANYWAY? scores 150');
check('…off-site: `DOT OFF-SITE · LAUNCH ANYWAY? PLAINS · scores 100`',
  LAUNCH_CONFIRM_TEXT.offSite('PLAINS', 100) === 'DOT OFF-SITE · LAUNCH ANYWAY? PLAINS · scores 100');
check('…the POD BAY\'s status says the state only (note 10): `DOT OFF-SITE`, `LZ-A FULL`',
  POD_BAY_STATUS_TEXT.offSite === 'DOT OFF-SITE' && POD_BAY_STATUS_TEXT.full('LZ-A') === 'LZ-A FULL'
  && !Object.values(POD_BAY_STATUS_TEXT).some((entry) => typeof entry === 'string' && /asks first/i.test(entry)));
check('…the longest words fit a line', [LAUNCH_CONFIRM_TEXT.offSite('GRASSLAND', 99_999), LAUNCH_CONFIRM_TEXT.full('LZ-D', 99_999), LAUNCH_CONFIRM_TEXT.keys]
  .every((line) => line.length <= MAX_LINE_CHARS));

// --- The real key path on a landing ------------------------------------------------------------------------------------
// The confirm layer as components/hud/InlineConfirm mounts it (DOM-free here): the question opens the 'confirm' modal and
// the layer answers by confirmAnswerFor.
const h = createHarness7(5);
const state = () => h.store.getState();
let open: { request: ConfirmRequest; close: () => void } | null = null;
let questions = 0;
registerLandingKeys(h.store, {
  confirm: (text, onYes) => {
    questions++;
    open = { request: launchConfirmRequest(text, onYes), close: pushModal('confirm') };
  },
});
registerKeys({
  layer: 'confirm',
  codes: CONFIRM_ANSWER_CODES,
  onDown: (code) => {
    if (open === null) return;
    const yes = confirmAnswerFor(open.request, code);
    if (yes === null) return;
    const { request, close } = open;
    open = null;
    close();
    if (yes) request.onYes();
  },
});

h.shipAlone(1, 5);
h.store.update((draft) => { draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'lesson-pods-dot', 'lesson-split'); });
lockOn(h);
setLandingMode('manual');
// The sure part of the window (the whole drop inside the bracket), so the yes lands in the LZ it asked about.
h.stepUntil(() => state().landing.window?.sure === true && state().landing.pods.some((record) => record.fate.kind === 'aboard'), 600);
const windowLz = state().landing.window?.lz ?? null;
check('a sure window opens on the ship alone', windowLz !== null, String(windowLz));
// Every LZ planned for no pods: the dot's LZ is full, so [L] asks (the 'full' guard: a yes lands it MISLANDED).
h.store.update((draft) => { for (const lz of draft.landing.lzs) lz.pods = 0; });
h.stepFor(0.05);
const aboard = (): number => state().landing.pods.filter((record) => record.fate.kind === 'aboard').length;
const before = aboard();
h.keyDown('KeyL');
check('[L] at a full LZ asks, centred, and launches nothing yet', questions === 1 && open !== null
  && (open as { request: ConfirmRequest }).request.placement === 'centre'
  && (open as { request: ConfirmRequest }).request.text.question.includes('IS FULL · LAND IT ANYWAY?') && aboard() === before,
  open === null ? 'no question' : (open as { request: ConfirmRequest }).request.text.question);
// The key still held: the browser's auto-repeat (keyWith spreads its fields onto the event; it types only modifiers),
// then its keyup.
h.keyWith('keydown', 'KeyL', { repeat: true } as unknown as Parameters<typeof h.keyWith>[2]);
h.keyUp('KeyL');
check('…its keyup and its auto-repeat do not answer it (the keyup goes to the game layer that saw the keydown)',
  open !== null && questions === 1 && aboard() === before);
h.keyDown('KeyN');
h.keyUp('KeyN');
check('…[N] says no: the question closes, the pod stays aboard', open === null && aboard() === before);
h.keyDown('KeyL');
h.keyUp('KeyL');
check('…[L] again asks again', open !== null && questions === 2 && aboard() === before);
h.keyDown('KeyL');
h.keyUp('KeyL');
const launched = state().landing.pods.find((record) => record.fate.kind !== 'aboard');
check('…and a second [L] says yes: the pod leaves for the full LZ', open === null && questions === 2 && aboard() === before - 1 && launched !== undefined,
  `${aboard()} aboard of ${before}`);
h.stepUntil(() => launched !== undefined && podRecord(state(), launched.pod).fate.kind === 'down', 400);
const fate = launched === undefined ? null : podRecord(state(), launched.pod).fate;
check('…where it lands MISLANDED (over the plan, still counted)', fate?.kind === 'down' && fate.touchdown.place === 'mislanded',
  JSON.stringify(fate));
h.keyDown('Enter');
h.keyUp('Enter');
check('ENTER with no question open does nothing here', open === null);
setLandingMode('instant');

finish();
