// Slice 4 FOUNDATION scaffolding (docs/phase3/impl/slice-4-plan.md §5.1 item 5): the stubs the three tracks fill throw
// through this, naming the function and the track that owns it, so a caller that reaches one too early fails loudly. Every
// argument is passed in, so a stub's final signature compiles under noUnusedParameters with its real parameter names. The
// batch's review deletes this file once no stub is left (grep notBuilt).
export type Track = 'TREE' | 'FLIGHT' | 'UI';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 4 plan §5.2, ${args.length} argument(s))`);
}
