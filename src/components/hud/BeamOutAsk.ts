import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ConfirmRequest } from '@systems/fs-tools';
import { startBeamOut } from '@systems/run';
import { soulsInMemory } from '@state/selectors';
import { play } from '@systems/audio';
import { askInline, answerInlineConfirm, currentInlineConfirm, onInlineConfirmChange } from '@components/hud/InlineConfirm';
import { isLastShip } from '@data/ships';
import { BEAM_OUT_TEXT } from '@data/script';

// BEAM OUT's question (§9 WP7 item 6: "with the inline confirm"), asked by the Engine window's button and
// COMMS' ABANDON SHIP alike: what leaving costs (the colonists still aboard stay, two more transit hits, or
// the run's end on the last ship), answered ✓ BEAM OUT / ✗ STAY. The world does not stop for it (§9 WP3: P
// is the only pause), so the IMPACT countdown keeps racing the decision. A yes that comes too late (the
// ship was saved while the question stood) is refused with a buzz. Once the flight is over under it (a
// crash, the Core eaten) the question answers itself no: left open it would float over the LOST card, and
// the kid's first click on the card's button would only dismiss it.

function flightLive(state: Readonly<GameState>): boolean {
  return state.run.phase === 'flight' && state.burn.status === 'approaching' && !state.run.coreLost;
}

export function askBeamOut(store: Store<GameState>): void {
  const state = store.getState();
  const aboard = soulsInMemory(state).reduce((sum, soul) => sum + soul.souls, 0);
  const request: ConfirmRequest = {
    text: { question: BEAM_OUT_TEXT.question, detail: BEAM_OUT_TEXT.detail(state.level.shipName, aboard, isLastShip(state.run.shipIndex)) },
    answers: { yes: BEAM_OUT_TEXT.yes, no: BEAM_OUT_TEXT.no },
    onYes: () => { if (startBeamOut(store) !== null) play('buzz'); },
  };
  askInline(request);
  const unsubFlight = store.subscribe(flightLive, (live) => {
    if (!live && currentInlineConfirm() === request) answerInlineConfirm(false);
  });
  // The watch ends with the question, however it was answered.
  const offChange = onInlineConfirmChange((open) => {
    if (open === request) return;
    unsubFlight();
    offChange();
  });
}
