// A tiny pub/sub store with selector-based subscriptions.
// Listeners only fire when the selected slice changes (Object.is by default).

export type Listener<T> = (slice: T, prev: T) => void;
export type Selector<S, T> = (state: S) => T;
export type Equals<T> = (a: T, b: T) => boolean;

export interface Store<S> {
  getState(): Readonly<S>;
  update(mutator: (draft: S) => void): void;
  subscribe<T>(selector: Selector<S, T>, listener: Listener<T>, equals?: Equals<T>): () => void;
  // Manually re-evaluate all selectors. Used by legacy code that mutates state in place
  // without going through update(). Components that use update() never need to call this.
  notify(): void;
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

  function getState(): Readonly<S> {
    return state;
  }

  function fireAll(): void {
    for (const sub of subs) {
      const next = sub.selector(state);
      if (!sub.equals(next, sub.last)) {
        const prev = sub.last;
        sub.last = next;
        sub.listener(next, prev);
      }
    }
  }

  function update(mutator: (draft: S) => void): void {
    // Mutate in place. Re-enable structuredClone once legacy.ts is fully migrated
    // and no module outside this store holds long-lived references to state slices —
    // cloning while legacy holds an aliased `memory` reference desynchronizes them.
    // Object-slice subscribers must supply a custom `equals` if they care about
    // internal changes (since the array reference itself won't change).
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

  return { getState, update, subscribe, notify };
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
