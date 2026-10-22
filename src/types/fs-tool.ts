// The filesystem tools (§3.2, §6.5). SWAP (WP10, VESPER) hands a ship file's job to its backup.
export type FsToolKind = 'scan' | 'repair' | 'move' | 'copy' | 'delete' | 'swap';
