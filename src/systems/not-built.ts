// Slices 4c–4e FOUNDATION scaffolding (docs/phase3/impl/slice-4cde-plan.md §7.1 item 5), recreated from slice 4's: the
// stubs whose entry points change state throw through this, naming the function and the track that owns it, so a caller
// that reaches one too early fails loudly. Stubs on a hot path (resolvers, guidance lines, boot counts, tutorial checks,
// status hooks, pure helpers) return a neutral answer instead and never come here. Every argument is passed in, so a
// stub's final signature compiles under noUnusedParameters with its real parameter names. The batch's review deletes this
// file once no stub is left (grep notBuilt).
export type Track = 'DROP' | 'SENTRY' | 'ORBIT';

export function notBuilt(what: string, track: Track, ...args: readonly unknown[]): never {
  throw new Error(`${what}: not built (Track ${track}; slice 4c–4e plan §7.2, ${args.length} argument(s))`);
}
