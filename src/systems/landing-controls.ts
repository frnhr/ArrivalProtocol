// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): [L] down and up, [G]. Others ask
// by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { LaunchIntent, LaunchResult } from '@/types/landing';
import { registerKeys } from '@systems/input';
import { requestLaunch } from '@systems/landing';

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

export interface LandingKeyDeps {
  confirm: LaunchConfirm;
}

// [L] launches (game layer; input.ts drops auto-repeat, so holding it launches once). In the MIND it refuses with
// SHIP SCREEN (requestLaunch: the buzz and `SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]`), as SPACE does. Outside
// LANDING it does nothing: no buzz for a key that means nothing yet.
// [G] (KeyG) is reserved for the landing (prevented in input.ts) and bound by Track SIM if 01-landing gives it a job.
export function registerLandingKeys(store: Store<GameState>, deps: LandingKeyDeps): () => void {
  return registerKeys({
    layer: 'game',
    codes: ['KeyL'],
    onDown: () => {
      if (store.getState().run.phase !== 'landing') return;
      playerLaunch(store, deps.confirm);
    },
  });
}
