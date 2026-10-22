// A tiny pub/sub store with selector-based subscriptions.
// Listeners only fire when the selected slice changes (Object.is by default).

export type Listener<T> = (slice: T, prev: T) => void;
export type Selector<S, T> = (state: S) => T;
export type Equals<T> = (a: T, b: T) => boolean;

export interface Store<S> {
  getState(): Readonly<S>;
  update(mutator: (draft: S) => void): void;
  // Mutate state WITHOUT firing subscribers. For high-frequency writes that no
  // store subscriber cares about (clock tSec, telemetry velocity) — the writer
  // patches DOM directly and other readers pull on demand. Misuse will silently
  // desynchronize subscriber-driven UI; only use when you can prove no one
  // subscribes to the touched slice.
  mutate(mutator: (draft: S) => void): void;
  subscribe<T>(selector: Selector<S, T>, listener: Listener<T>, equals?: Equals<T>): () => void;
  // Manually re-evaluate all selectors. Used by action functions that mutate state
  // in place (avoiding update() so memory slice references stay stable for the
  // op-engine's stored seg references). Components that use update() never need this.
  notify(): void;
  // True while subscribers are being called. say() asserts it is false: a line spoken from a
  // store listener would nest an update inside the fan-out (§9 tick discipline).
  isNotifying(): boolean;
}

interface SubRecord<S, T> {
  selector: Selector<S, T>;
  listener: Listener<T>;
  equals: Equals<T>;
  last: T;
}

export function createStore<S>(initial: S): Store<S> {
  let state: S = initial;
  const subs = new Set<SubRecord<S, unknown>>();
  let notifyDepth = 0;

  function getState(): Readonly<S> {
    return state;
  }

  function fireAll(): void {
    notifyDepth++;
    try {
      for (const sub of subs) {
        const next = sub.selector(state);
        if (!sub.equals(next, sub.last)) {
          const prev = sub.last;
          sub.last = next;
          sub.listener(next, prev);
        }
      }
    } finally {
      notifyDepth--;
    }
  }

  function mutate(mutator: (draft: S) => void): void {
    mutator(state);
  }

  function update(mutator: (draft: S) => void): void {
    // Mutate in place. Action functions hold direct references to memory and to
    // individual segments (e.g. the `seg` arg passed in, captured in startOp
    // callbacks). Cloning would desynchronize those — use update() only for
    // pointer-like fields (selectedId, pendingPlacement) and notify() for
    // in-place segment mutations. Object-slice subscribers must supply a custom
    // `equals` if they care about internal changes.
    mutator(state);
    fireAll();
  }

  function subscribe<T>(
    selector: Selector<S, T>,
    listener: Listener<T>,
    equals: Equals<T> = Object.is,
  ): () => void {
    const record: SubRecord<S, T> = {
      selector,
      listener,
      equals,
      last: selector(state),
    };
    subs.add(record as SubRecord<S, unknown>);
    return () => { subs.delete(record as SubRecord<S, unknown>); };
  }

  function notify(): void {
    fireAll();
  }

  return { getState, update, mutate, subscribe, notify, isNotifying: () => notifyDepth > 0 };
}

// Common equality helpers.
export function shallowArrayEquals<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
