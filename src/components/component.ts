import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

export interface MountCtx {
  store: Store<GameState>;
}

// A component mounts itself onto `target` and returns a teardown function
// that removes listeners, unsubscribes from the store, and detaches DOM.
export type Component<Props = void> = (
  target: HTMLElement,
  props: Props,
  ctx: MountCtx,
) => () => void;
