# TODOs

## Done

- `parseArgs` in `cli.ts` replaced with `yargs`.
- Use the ellipsis character "…" instead of "..." in user-facing messages.
- Create a zod schema for parsing `BackupManifest` and use it wherever we
  currently just use `JSON.parse`. Note: `createdAt` is validated as an ISO 8601
  string via `Iso8601TimestampSchema` but kept as a string type, consistent with
  the rest of the codebase. `electionDate` is validated as a non-empty string.
- Consolidated `data.db` and `ballot-images` path knowledge into
  `WORKSPACE_DB_FILENAME` and `WORKSPACE_BALLOT_IMAGES_DIR` constants in
  `workspace.ts`.
- `performBackup` cleanup no longer depends on `getCurrentElectionBackupInfo`
  succeeding. `doBackup` returns the in-progress path alongside the result.
- `getInternalAvailableSpace` removed, replaced with direct
  `getAvailableDiskSpace` calls.
- `formatSize` in `cli.ts` and `formatBytes` in `fs_utils.ts` merged into a
  single `formatBytes` in `fs_utils.ts` with KB support.
- `backupDatabaseFn` in `cli.ts` inlined at the call site.
- `cleanupDirSafe` and `cleanupSafe` merged into a single `cleanupSafe` that
  accepts `{ recursive?: boolean }`.
- `validateManifestSignature` has a TODO comment about using `libs/auth` for
  full certificate chain / vxsig validation.
- Duplicative `previousWorkspacePath` logic consolidated — computed once in
  `performRestore` and passed to `doRestore`.
- `listBackups` and `doRestore` share `manifestTotalSize()` from `types.ts`.
- Dead `manifestJson` read in `doRestore` removed.
- `copyFileWithHash` moved to `fs_utils.ts` and used in both `backup.ts` and
  `restore.ts`.
- `ignoreMissing(rename(...))` always-truthy bug in `restore.ts` fixed.
- JSDoc comments added to `BackupContext` and `RestoreContext` properties.
- `createSigintCanceller` returns a value with `Symbol.dispose` support for use
  with `using`.

## Not yet done

- Use a `current` symlink for atomic workspace data swaps during restore.
  Currently the db rename and ballot-images rename are two separate operations
  that can partially fail. A TODO comment in `restore.ts` describes the design:
  keep data in versioned subdirectories and atomically swap a symlink. Requires
  changes to `Workspace`, `Store`, `BackupManager`, and a migration strategy for
  existing deployments.
- `validateManifestSignature` should actually validate the full certificate chain
  and vxsig signature using `libs/auth` (currently just a TODO comment).
