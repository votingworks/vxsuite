- `parseArgs` in `cli.ts.` is not similar to other CLIs in the repo. We either
  manually parse specific options/flags or use a package like `yargs`. I don't
  really love either of those patterns, but it's probably best to just use
  `yargs` here.
- use the ellipsis character "…" instead of "..." in user-facing messages.
- create a zod schema for parsing `BackupManifest` and use it wherever we
  currently just use `JSON.parse`. It should parse `createdAt` and other dates
  as dates.
- there are a lot of places that know `data.db` is the location of the database
  and `ballot-images` is the location of the ballot images in the vxadmin
  workspace. this should be consolidated to one place, perhaps the existing
  `Workspace` type?
- `performBackup` only cleaning up on failure of `doBackup` only if
  `getCurrentElectionBackupInfo` succeeds is a bit weird. looks like what we
  actually want is the in-progress backup path. does it make sense for that to
  be in `BackupContext`? why are we computing that path more than once?
- `getInternalAvailableSpace` does not provide any additional context to
  `getAvailableDiskSpace`. just replace it with a direct call to
  `getAvailableDiskSpace`?
- `formatSize` in `cli.ts` and `formatBytes` in `fs_utils.ts` are duplicative.
  we want the one that has KB support, but it probably doesn't belong in
  `cli.ts`.
- why the indirection around `ctx.backupDatabase`? is it serving a useful
  purpose? maybe for testing/mocking? but surely `backupDatabaseFn` isn't that
  useful and can be inlined?
- `cleanupDirSafe` and `cleanupSafe` feel like they could be replaced with
  `ignoreMissing`. do you agree?
- `validateManifestSignature` says it will be updated to validate the full
  certificate chain and vxsig signature. why doesn't it do that now? presumably
  it should be using the existing signing stuff in `libs/auth`.
- you have duplicative logic for determining the `previousWorkspacePath` value.
- `listBackups` and `doRestore` seem to duplicate some logic, e.g. calculating
  `totalSize`.
- why does `doRestore` read the `manifestJson` value? seems like it just writes
  it to the `restoreInProgressPath`, but then it's not referenced again?
- should we use the `copyFileWithHash` utility in `restore.ts` too instead of
  doing a `copyFile` followed by a `sha256File` call?
- this line in `restore.ts` will always match since `rename` resolves to
  `undefined` and `ignoreMissing` resolves to either `undefined` or the value
  the promise you give it resolves to:
  `if (!(await ignoreMissing(rename(newImagesPath, ctx.ballotImagesPath)))) {`.
- add JSDoc comments to the `BackupContext` properties to indicate what they
  are.
- seems like it might be a good idea to use a symlink to change the current
  workspace data. right now when we restore the backup we have to manage the
  `data.db` file and the `ballot-images` directory, but it's possible renaming
  the first can succeed while the second fails. please look into keeping both in
  a directory within the workspace and having a `current` or similar symlink
  that points to the one we actually want to use, making a restore (more)
  atomic.
- what do you think about having `createSigintCanceller` return a value that can
  be used with `using` (i.e. `Symbol.dispose`)? I'm thinking it'd replace the
  `cleanup` function on the returned object.
