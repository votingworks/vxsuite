import assert from 'node:assert';
import { relative } from 'node:path';
import { inspect } from 'node:util';
import yargs from 'yargs';
import { extractErrorMessage } from '@votingworks/basics';
import { FileSystemEntryType, listDirectoryRecursive } from '@votingworks/fs';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { NODE_ENV } from '@votingworks/backend';
import { BackupRoot } from '../backup_root.js';
import { StyledPrinter } from './styled_printer.js';
import * as views from './views.js';
import { Backup } from '../backup.js';
import { ProgressEvent } from '../create/types.js';
import { createBackup } from '../create/index.js';

/**
 * IO streams given to the CLI.
 */
export interface Streams {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
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
  { stdin, stdout, stderr }: Streams
): Promise<number> {
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
    .epilogue(
      'Stop VxAdmin before running these commands: they use its workspace.'
    )
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

  switch (args._[0]) {
    case 'create':
      return await create(args, { stdin, stdout, stderr });
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
 * Create a backup using the CLI-provided arguments.
 */
async function create(
  args: BackupArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  assert(typeof args.workspace === 'string');
  assert(typeof args.target === 'string');

  if (NODE_ENV === 'development') {
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';
  }

  const logger = new BaseLogger(LogSource.VxAdminService);

  function onProgressEvent(event: ProgressEvent) {
    console.log(event);
  }

  const createBackupResult = await createBackup({
    workspace: args.workspace,
    target: args.target,
    logger,
    onProgressEvent,
  });
  if (createBackupResult.isErr()) {
    stderr.write(`Error: ${createBackupResult.err().message}\n`);
    return 1;
  }

  stdout.write('Backup done!\n');

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
    const readManifestResult = await backup.manifestFile.readManifest();
    if (readManifestResult.isErr()) {
      views.unreadableManifest(errorPrinter, {
        manifestPath: backup.manifestFile.path,
        error: readManifestResult.err(),
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
  const readManifestResult = await backup.manifestFile.readManifest();

  if (readManifestResult.isErr()) {
    stderr.write(
      `Error: unable to read manifest at ${
        backup.manifestFile.path
      }: ${extractErrorMessage(readManifestResult.err())}`
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
