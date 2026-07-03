/**
 * SaveGame — the on-disk save format (doc 04 §3.4).
 *
 * A save is a snapshot (fast load path) plus the full command log and
 * per-EndTurn hash chain (replay verification path, spectate, bug repro,
 * desync forensics). Command logs are guaranteed replayable only within a
 * saveVersion; cross-version loads rely on the snapshot.
 */

import type { Command } from '../commands/types';
import type { SerializedState } from '../state/gameState';

/** Bumped on any state-shape change. v0 is the first real save format. */
export const SAVE_VERSION = 0;

/**
 * The engine's own version, recorded in saves for forensics only (loads never
 * branch on it — saveVersion governs compatibility). Matches the
 * @civ8/engine package.json version.
 */
export const ENGINE_VERSION = '0.0.0';

/**
 * Placeholder content hash. No data-driven content packs exist yet (they
 * arrive with mapgen/units in M2+); until then every save carries this
 * documented constant so the field's shape is exercised from day one.
 */
export const CONTENT_HASH_PLACEHOLDER = 'content:none';

export interface SaveGame {
  readonly saveVersion: number;
  readonly engineVersion: string;
  /** Content pack the game was created with (placeholder until M2+). */
  readonly contentHash: string;
  readonly seed: number;
  /** Canonical plain-data snapshot — the fast load path. */
  readonly snapshot: SerializedState;
  /** Full command log — replay, spectate, bug repro. */
  readonly commandLog: Command[];
  /** Per-EndTurn hash chain — desync forensics. */
  readonly turnHashes: string[];
}
