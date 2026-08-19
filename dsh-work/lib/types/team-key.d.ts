/**
 * Shared team-key sanitization, loadable by BOTH the host half and the
 * browser bundle.
 *
 * The host persists team ids and mailbox file names with `sanitizeKey`; the
 * client conversation card must re-derive the exact same id from the create
 * tool's arguments (it has no node:crypto). Keeping one implementation here
 * guarantees both sides agree — a divergence silently breaks the card for
 * non-ASCII names (see NOTES).
 *
 * Pure JS only: no node built-ins, so `src/team-key.ts` compiles into the
 * browser bundle and the host alike.
 * @module dsh-work/team-key
 */
/** Longest key emitted before truncating and appending a digest. */
export declare const MAX_KEY_LENGTH = 48;
/**
 * Short stable digest for otherwise-colliding or non-readable keys.
 * FNV-1a 32-bit, hex — deterministic, tiny, and identical in Node and the
 * browser (replaces the host's old node:crypto sha256 slice so the client can
 * reproduce it).
 * @param name - any string.
 * @returns an 8-character hex digest.
 */
export declare function keyDigest(name: string): string;
/**
 * Fold a free-form name into a safe path/key segment, Unicode-aware.
 *
 * Unicode letters and digits survive, so CJK/Cyrillic/Greek names stay
 * distinct and readable; everything else — spaces, punctuation, path
 * separators, control characters — folds to `-`. A name with no letters or
 * digits at all (pure emoji or punctuation) yields a digest-prefixed key
 * rather than a shared constant. Over-long names are truncated with a digest
 * appended, so names sharing a long prefix stay distinct and the result stays
 * within filesystem limits (CJK costs 3 bytes per character in UTF-8).
 *
 * @param name - any user-supplied name.
 * @returns a non-empty key safe as a single path segment.
 */
export declare function sanitizeKey(name: string): string;
