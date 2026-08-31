/**
 * Thrown from a snapshot's progress callback to stop it partway, which is the
 * only way `better-sqlite3` offers to abort one: it closes the backup and
 * rejects when the callback throws. Never escapes {@link Client.backup}, which
 * reports a stopped snapshot as a `cancelled` result.
 */
export class BackupCancelledError extends Error {}
