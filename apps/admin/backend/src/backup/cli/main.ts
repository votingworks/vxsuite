import assert from 'node:assert';
import { relative } from 'node:path';
import yargs from 'yargs';
import { isNonExistentFileOrDirectoryError } from '@votingworks/basics';
import { FileSystemEntryType, listDirectoryRecursive } from '@votingworks/fs';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { getNodeEnv } from '@votingworks/backend';
import { BackupRoot } from '../backup_root.js';
import { StyledPrinter } from './styled_printer.js';
import { DisplayProgress, ProgressDisplay } from './progress_display.js';
import * as views from './views.js';
import { inspect } from 'node:util';
import { ProgressEvent } from '../progress.js';
import { createBackup } from '../create/index.js';
import { openWorkspace, Workspace } from '../../util/workspace.js';
import { Backup } from '../backup.js';
import { BackupManifestFile } from '../backup_manifest_file.js';

/**
 * IO streams given to the CLI.
 */
export interface Streams {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

/**
 * Everything the CLI needs from its caller: the IO streams, and optionally
 * where to send log messages. Without a logger, log messages go to a real
 * {@link BaseLogger}, i.e. to stdout as JSON lines — tests pass a mock so log
 * output doesn't interleave with the command's own.
 */
export interface MainContext extends Streams {
  logger?: BaseLogger;
}

interface BackupArguments {
  _: Array<string | number>;
  workspace?: string;
  target?: string;
  backup?: string;
  [key: string]: unknown;
}

/**
 * Entry point for the `backups` CLI.
 */
export async function main(
  argv: readonly string[],
  { stdin, stdout, stderr, logger: providedLogger }: MainContext
): Promise<number> {
  const logger = providedLogger ?? new BaseLogger(LogSource.VxAdminService);
  const parser = yargs()
    .scriptName('backups')
    .usage('Usage: $0 <command> [options]')
    .command('create', 'Back up a workspace', (command) =>
      command.options({
        workspace: {
          type: 'string',
          description: 'VxAdmin workspace directory',
          default: process.env['ADMIN_WORKSPACE'],
          defaultDescription: '$ADMIN_WORKSPACE',
          demandOption: true,
          requiresArg: true,
        },
        target: {
          type: 'string',
          description: 'Backup drive mount point, e.g. /media/vx/backup',
          demandOption: true,
          requiresArg: true,
        },
      })
    )
    .command(
      'validate <backup>',
      'Check a backup against its signed manifest',
      (command) =>
        command.positional('backup', {
          type: 'string',
          description: 'Backup directory to check',
        })
    )
    .command('list <target>', 'List the backups on a backup drive', (command) =>
      command.positional('target', {
        type: 'string',
        description: 'Backup drive mount point, e.g. /media/vx/backup',
      })
    )
    .command('restore', 'Restore a backup to a workspace', (command) =>
      command.options({
        workspace: {
          type: 'string',
          description: 'VxAdmin workspace directory',
          default: process.env['ADMIN_WORKSPACE'],
          defaultDescription: '$ADMIN_WORKSPACE',
          demandOption: true,
          requiresArg: true,
        },
        backup: {
          type: 'string',
          description: 'Backup directory to restore from',
          demandOption: true,
          requiresArg: true,
        },
      })
    )
    .demandCommand(1, 'A command is required')
    .strict()
    .exitProcess(false)
    .version(false);

  let parseError: Error | undefined;
  let parserOutput = '';

  const args = (await parser.parseAsync(
    argv.slice(2),
    (error: Error | undefined, _parsed: unknown, output: string) => {
      parseError = error;
      parserOutput = output;
    }
  )) as BackupArguments;

  if (parseError || parserOutput) {
    stderr.write(`${parserOutput}\n`);
    return parseError ? 1 : 0;
  }

  // Every command authenticates backups through `libs/auth`, which reads
  // `NODE_ENV` and `VX_MACHINE_TYPE` straight from the environment and throws
  // when they aren't set, so normalize whatever we resolved into the
  // environment instead of making the caller export them.
  const nodeEnv = getNodeEnv();
  assert(
    nodeEnv !== 'production',
    `the backups CLI is a development tool, but NODE_ENV is ${nodeEnv}`
  );
  (process.env as { NODE_ENV?: string }).NODE_ENV = nodeEnv;
  (process.env as { VX_MACHINE_TYPE?: string }).VX_MACHINE_TYPE = 'admin';

  switch (args._[0]) {
    case 'create':
      return await create(args, { stdin, stdout, stderr, logger });
    case 'validate':
      return await validate(args, { stdin, stdout, stderr });
    case 'list':
      return await list(args, { stdin, stdout, stderr });
    case 'restore':
      return await restore(args, { stdin, stdout, stderr });
    /* istanbul ignore next: `strict` rejects unknown commands */
    default:
      throw new Error(`Unknown command: ${args._[0]}`);
  }
}

/**
 * What each backup step is called on screen. A `Record` over the event union
 * so that adding an event without a label fails to compile.
 */
const PROGRESS_LABELS: Record<ProgressEvent['type'], string> = {
  preparing: 'Preparing',
  db_snapshot: 'Snapshotting database',
  staging_files: 'Staging files',
  copy_files: 'Copying files',
  writing_manifest: 'Writing manifest',
  flushing_backup: 'Flushing to device',
  swapping_backup: 'Swapping into place',
  verifying: 'Verifying restored files',
  flushing_workspace: 'Flushing to disk',
};

function displayProgress(event: ProgressEvent): DisplayProgress {
  const label = PROGRESS_LABELS[event.type];

  switch (event.type) {
    case 'copy_files':
      return {
        label,
        bytesCompleted: event.copiedBytes,
        bytesTotal: event.totalBytes,
      };

    case 'db_snapshot':
    case 'staging_files':
      return { label, fraction: event.progress };

    default:
      return { label };
  }
}

/**
 * Opens the workspace to back up, or returns `undefined` if there is no
 * workspace at `path`. Any other failure to open it is a bug and throws.
 */
function openWorkspaceIfPresent(
  path: string,
  logger: BaseLogger
): Workspace | undefined {
  try {
    return openWorkspace(path, logger);
  } catch (error) {
    if (isNonExistentFileOrDirectoryError(error)) {
      return undefined;
    }

    throw error;
  }
}

/**
 * Create a backup using the CLI-provided arguments.
 */
async function create(
  args: BackupArguments,
  { stdout, stderr, logger }: Streams & { logger: BaseLogger }
): Promise<number> {
  assert(typeof args.workspace === 'string');
  assert(typeof args.target === 'string');

  // Progress goes to stderr so that stdout carries only the command's own
  // output, and so redirecting one doesn't garble the other.
  const display = new ProgressDisplay(
    stderr,
    Boolean((stderr as NodeJS.WriteStream).isTTY)
  );

  // The CLI owns the workspace it opens: `createBackup` snapshots over the
  // connection it is given and leaves closing it to the caller.
  using workspace = openWorkspaceIfPresent(args.workspace, logger);

  if (!workspace) {
    stderr.write('Error: Workspace directory could not be found\n');
    return 1;
  }

  const createBackupResult = await createBackup({
    workspace,
    target: args.target,
    logger,
    onProgressEvent: (event) => display.update(displayProgress(event)),
  });

  if (createBackupResult.isErr()) {
    // Leave the bar where it stopped: it says which step failed.
    display.finish();
    stderr.write(`Error: ${createBackupResult.err().message}\n`);
    return 1;
  }

  // Replace the bar with what `list` would show for the backup just written.
  display.clear();
  views.backupInfo(new StyledPrinter(stdout), createBackupResult.ok());

  return 0;
}

/**
 * Validate a backup using the CLI-provided arguments.
 */
async function validate(
  args: BackupArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  const { backup } = args;
  assert(typeof backup === 'string');

  stderr.write('NOT IMPLEMENTED YET.\n');
  stdout.write('Here are the backup files to be validated:\n');

  const { errorCount } = await enumerateSourceFiles(backup, { stdout, stderr });
  return errorCount ? 1 : 0;
}

/**
 * List backups at the CLI-given location.
 */
async function list(
  args: BackupArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  const { target } = args;
  assert(typeof target === 'string');

  const root = new BackupRoot(target);
  const listBackupsResult = await root.listBackups();
  if (listBackupsResult.isErr()) {
    stderr.write(
      `Error: unable to list backups: [${listBackupsResult.err().type}] ${
        listBackupsResult.err().message
      }\n`
    );
    return 1;
  }

  const backups = listBackupsResult.ok();
  if (backups.length === 0) {
    stdout.write('No backups found.\n');
  }

  const printer = new StyledPrinter(stdout);
  const errorPrinter = new StyledPrinter(stderr);
  let printedBackup = false;

  for (const backup of backups) {
    const openBackupResult = await backup.open();
    if (openBackupResult.isErr()) {
      views.unreadableManifest(errorPrinter, {
        manifestPath: backup.manifestPath,
        error: openBackupResult.err().message,
      });
      continue;
    }

    await using authenticatedBackup = openBackupResult.ok();
    const readManifestResult = await authenticatedBackup.readManifest();
    if (readManifestResult.isErr()) {
      views.unreadableManifest(errorPrinter, {
        manifestPath: backup.manifestPath,
        error: readManifestResult.err().message,
      });
      continue;
    }

    if (printedBackup) {
      printer.println();
    }
    printedBackup = true;

    views.backupInfo(printer, {
      path: backup.path,
      manifest: readManifestResult.ok(),
    });
  }

  return 0;
}
/**
 * Restores a backup using the CLI-given locations.
 */
async function restore(
  args: BackupArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  assert(typeof args.workspace === 'string');
  assert(typeof args.backup === 'string');

  stderr.write('NOT IMPLEMENTED YET.\n');

  const backup = new Backup(args.backup);
  const readManifestResult = await new BackupManifestFile(
    backup.manifestPath
  ).readManifest();

  if (readManifestResult.isErr()) {
    stderr.write(
      `Error: unable to read manifest at ${backup.manifestPath}: ${
        readManifestResult.err().message
      }`
    );
    return 1;
  }

  const manifest = readManifestResult.ok();
  stdout.write(inspect(manifest));
  stdout.write('\n');

  return await Promise.resolve(0);
}

async function enumerateSourceFiles(
  source: string,
  { stdout, stderr }: Pick<Streams, 'stdout' | 'stderr'>
): Promise<{ errorCount: number }> {
  let errorCount = 0;

  for await (const result of listDirectoryRecursive(source)) {
    if (result.isErr()) {
      stderr.write(
        `!! Failed to read source entry: [${result.err().type}] ${
          result.err().message
        }`
      );
      errorCount += 1;
      continue;
    }

    const entry = result.ok();
    stdout.write(
      `${relative(source, entry.path)}${
        entry.type === FileSystemEntryType.Directory ? '/' : ''
      }\n`
    );
  }

  return { errorCount };
}
