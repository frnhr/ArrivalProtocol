// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): [L] down and up, [G]. Others ask
// by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { LaunchIntent, LaunchResult } from '@/types/landing';
import { registerKeys } from '@systems/input';
import { requestLaunch } from '@systems/landing';
import { autodropKeyDown, autodropKeyUp, pressAutodrop } from '@systems/autodrop';

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
// Slice 4c (plan §3.2, R4): with AUTODROP v1 or better working on the SHIP screen, [L] pressed in (or within GET READY of) a
// window with a sure part is a HOLD: AUTODROP times the volley while it is down (autodrop.ts autodropKeyDown says 'held'),
// and its keyup (or input.ts's release on a blur) lets go. Anywhere else [L] is the manual launch, with its confirms.
// [G] (KeyG, prevented in input.ts) arms AUTODROP v2's pass or v3's plan from either screen, and cancels it again.
export function registerLandingKeys(store: Store<GameState>, deps: LandingKeyDeps): () => void {
  const offL = registerKeys({
    layer: 'game',
    codes: ['KeyL'],
    onDown: () => { launchDown(store, deps.confirm); },
    onUp: () => { launchUp(store); },
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

// A launch control pressed ([L] down, the POD BAY's LAUNCH or the phone bar's pointer down): AUTODROP's hold when v1 can
// take it, else the manual launch. Returns which (null outside the landing: nothing happens).
export function launchDown(store: Store<GameState>, confirm: LaunchConfirm): 'held' | 'manual' | null {
  if (store.getState().run.phase !== 'landing') return null;
  if (autodropKeyDown(store) === 'held') return 'held';
  playerLaunch(store, confirm);
  return 'manual';
}

// The launch control let go: AUTODROP's hold ends (a tap that sent nothing is R4's `'released'`).
export function launchUp(store: Store<GameState>): void {
  autodropKeyUp(store);
}
