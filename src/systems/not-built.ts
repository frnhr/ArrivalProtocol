// Slice 7b FOUNDATION scaffolding (docs/phase3/impl/slice-7-plan.md §5.2), as slices 4, 4c–4e, 5, 6 and 7a had it: the
// stubs whose entry points change state throw through this, naming the function and the track that owns it, so a caller
// that reaches one too early fails loudly. Stubs on a hot path (the 'merge' resolver, the view's models) return a neutral
// answer instead and never come here. Every argument is passed in, so a stub's final signature compiles under
// noUnusedParameters with its real parameter names. The batch's fix pass deletes this file once no stub is left (grep
// notBuilt).
export type Track = 'DROP' | 'VIEW';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 7 plan §5.2, ${args.length} argument(s))`);
}
