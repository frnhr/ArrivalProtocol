// World reset registry. Any module that keeps run state outside the store (caches, timers,
// held keys) registers a reset here, in the package that creates that state. A new ship or
// a NEW RUN then resets everything by calling resetWorld() (systems/run.ts resetWorldForShip, then
// one store update with the new ship's slices), never by reloading the page and never by re-mounting.
//
// Every module also reports its state (`snapshot`: a small JSON-able summary of what it keeps). The
// one taken when it registers, at mount, is its initial state, and resetReport() lists every module
// whose report differs from it: right after a reset that list must be empty (§9 WP7 acceptance 2:
// "every registered reset module reports its initial state"), so a reset that forgets a field fails
// loudly in the tests instead of leaking one ship's state into the next.

type ResetFn = () => void;
type SnapshotFn = () => unknown;

interface Registration {
  reset: ResetFn;
  snapshot: SnapshotFn;
  initial: string;
}

const resets = new Map<string, Registration>();

export function onWorldReset(name: string, reset: ResetFn, snapshot: SnapshotFn): () => void {
  // A duplicate name means a module was mounted twice; failing here beats resetting twice.
  if (resets.has(name)) throw new Error(`onWorldReset: '${name}' is already registered`);
  resets.set(name, { reset, snapshot, initial: JSON.stringify(snapshot()) });
  return () => { resets.delete(name); };
}

export function resetWorld(): void {
  for (const { reset } of resets.values()) reset();
}

export function listResets(): string[] {
  return [...resets.keys()];
}

// The modules whose state is not what it was at mount, with both reports (empty: all initial).
export interface ResetDrift {
  name: string;
  initial: string;
  now: string;
}

export function resetReport(): ResetDrift[] {
  const drift: ResetDrift[] = [];
  for (const [name, registration] of resets) {
    const now = JSON.stringify(registration.snapshot());
    if (now !== registration.initial) drift.push({ name, initial: registration.initial, now });
  }
  return drift;
}
