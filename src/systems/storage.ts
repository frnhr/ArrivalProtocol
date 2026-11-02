// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
// What the page keeps in localStorage (phase 3 slice 3c moved it out of systems/meta.ts): the archive (meta.ts) and the
// run save (save-write.ts) both write through it. Headless suites pass stubs.

// The part of localStorage a keeper needs. The provider is a function because reaching window.localStorage can itself
// throw (storage blocked by the browser, a sandboxed frame): that is OFFLINE, said on screen, never a crash.
export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type StorageProvider = () => MetaStorage;

// The page's storage (§4.5): localStorage, reached through this function every time, inside the caller's own try.
export function browserStorage(): MetaStorage {
  return window.localStorage;
}
