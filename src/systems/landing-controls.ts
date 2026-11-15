// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): [L] down and up, [G]. Others ask
// by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { LaunchIntent, LaunchResult } from '@/types/landing';
import { registerKeys } from '@systems/input';
import { requestLaunch } from '@systems/landing';
import { pressAutodrop } from '@systems/autodrop';
import type { ConfirmRequest } from '@systems/fs-tools';
import { LAUNCH_CONFIRM_TEXT } from '@data/landing-text';

// The kid's landing controls (01-landing §3.3, plan §1.4): [L] and every launch button (the POD BAY window, the phone
// bar) go through playerLaunch, so the inline confirm loop lives in one place. DOM-free: the confirm is injected
// (main.ts passes components/hud/InlineConfirm askInline). Track SIM owns the key handling here; UI's buttons call
// playerLaunch only.

// Shows `text` as an inline confirm and calls onYes if the kid confirms (Enter or the ✓).
export type LaunchConfirm = (text: string, onYes: () => void) => void;

// One launch as the kid asks for it: requestLaunch; a guard ('confirm': off-site, or an LZ already full) is asked
// through `confirm`, and a yes asks again with that answer. A refusal has already buzzed and flashed its line
// (requestLaunch, source 'player'). Returns the first answer (the confirm's yes runs later).
export function playerLaunch(store: Store<GameState>, confirm: LaunchConfirm, pod?: number): LaunchResult {
  const intent: LaunchIntent = pod === undefined ? { source: 'player' } : { source: 'player', pod };
  const result = requestLaunch(store, intent);
  if (result.kind === 'confirm') {
    const ask = result.ask;
    confirm(result.text, () => { requestLaunch(store, { ...intent, confirmed: ask }); });
  }
  return result;
}

// The question a guard asks, as the inline confirm shows it (main.ts's LaunchConfirm passes it to askInline). Playtest 1
// (note 23, plan §3.4.3): centred and big, over the NAV PLOT (next to a mouse the kid was not using it went unseen), and
// answered by a second [L] or ENTER, or [N] or ESC. The first [L]'s keyup goes to the game layer that saw its keydown
// (input.ts), so one press never answers its own question.
export function launchConfirmRequest(text: string, onYes: () => void): ConfirmRequest {
  return {
    text: { question: text, detail: '' },
    answers: { yes: LAUNCH_CONFIRM_TEXT.yes, no: LAUNCH_CONFIRM_TEXT.no },
    onYes,
    placement: 'centre',
    yesCodes: ['KeyL', 'Enter', 'NumpadEnter'],
    noCodes: ['KeyN', 'Escape'],
    keys: LAUNCH_CONFIRM_TEXT.keys,
  };
}

export interface LandingKeyDeps {
  confirm: LaunchConfirm;
}

// [L] launches (game layer; input.ts drops auto-repeat, so holding it launches once). In the MIND it refuses with
// SHIP SCREEN (requestLaunch: the buzz and `SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]`), as SPACE does. Outside
// LANDING it does nothing: no buzz for a key that means nothing yet.
// Playtest 1 (note 9, plan §3.4.2): [L] is always the plain manual launch, with its confirms (slice 4c's hold for AUTODROP
// v1 went: a press in GET READY launched nothing until the centre, and looked dead). [G] (KeyG, prevented in input.ts) arms
// AUTODROP from either screen (v1's window, v2's pass, v3's plan) and cancels it again.
export function registerLandingKeys(store: Store<GameState>, deps: LandingKeyDeps): () => void {
  const offL = registerKeys({
    layer: 'game',
    codes: ['KeyL'],
    onDown: () => { launchDown(store, deps.confirm); },
  });
  const offG = registerKeys({
    layer: 'game',
    codes: ['KeyG'],
    onDown: () => {
      if (store.getState().run.phase !== 'landing') return;
      pressAutodrop(store);
    },
  });
  return () => {
    offL();
    offG();
  };
}

// A launch control pressed ([L] down, the POD BAY's LAUNCH, the phone bar's): the manual launch, and its result (null outside
// the landing: nothing happens, no buzz for a key that means nothing yet).
export function launchDown(store: Store<GameState>, confirm: LaunchConfirm): LaunchResult | null {
  if (store.getState().run.phase !== 'landing') return null;
  return playerLaunch(store, confirm);
}
