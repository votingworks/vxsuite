/**
 * CLI for managing VxAdmin election backups.
 *
 * Usage:
 *   bin/backup list <mount-point>
 *   bin/backup validate <backup-dir-path>
 *   bin/backup backup [options]
 *   bin/backup restore [options]
 */

import { access, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { DEV_MACHINE_ID } from '@votingworks/types';
import yargs from 'yargs/yargs';

import { listBackups, performBackup, validateBackup } from './backup';
import { performRestore } from './restore';
import { BackupProgress, RestoreProgress } from './types';
import { formatBackupStopReason } from './format_backup_stop_reason';
import { formatBytes } from './fs_utils';
import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../util/workspace';

/** Streams for CLI output. */
export interface Io {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

interface SigintCanceller {
  controller: AbortController;
  cleanup: () => void;
  [Symbol.dispose]: () => void;
}

/** Format backup progress for display. */
export function formatProgress(progress: BackupProgress): string {
  switch (progress.phase) {
    case 'preflight':
      return 'Pre-flight checks…';
    case 'snapshot':
      return 'Creating database snapshot…';
    case 'images':
      if (progress.imagesTotal === 0) return 'Processing images…';
      return `Copying images: ${progress.imagesCopied}/${progress.imagesTotal}`;
    case 'signing':
      return 'Signing manifest…';
    case 'validating':
      return 'Validating backup…';
    default:
      return `${progress.phase}…`;
  }
}

/** Format restore progress for display. */
export function formatRestoreProgress(progress: RestoreProgress): string {
  switch (progress.phase) {
    case 'preflight':
      return 'Validating backup and checking disk space…';
    case 'copying':
      if (progress.filesTotal === 0) return 'Copying files…';
      return `Copying files: ${progress.filesCopied}/${progress.filesTotal}`;
    case 'activating':
      return 'Activating restored data…';
    default:
      return `${progress.phase}…`;
  }
}

/** Register a SIGINT handler for graceful cancellation with force-quit on double press. */
export function createSigintCanceller(io: Io): SigintCanceller {
  const controller = new AbortController();
  function handler() {
    if (controller.signal.aborted) {
      process.exit(130);
    }
    controller.abort();
    io.stderr.write('\nCancelling… (press Ctrl+C again to force quit)\n');
  }
  process.on('SIGINT', handler);
  function cleanup() {
    process.removeListener('SIGINT', handler);
  }
  return {
    controller,
    cleanup,
    [Symbol.dispose]: cleanup,
  };
}

function getMachineId(): string {
  return process.env.VX_MACHINE_ID || DEV_MACHINE_ID;
}

function getCodeVersion(): string {
  return process.env.VX_CODE_VERSION || 'dev';
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function validateWorkspace(workspacePath: string): Promise<void> {
  if (!(await pathExists(workspacePath))) {
    throw new Error(`Workspace does not exist: ${workspacePath}`);
  }
  const dbPath = join(workspacePath, WORKSPACE_DB_FILENAME);
  if (!(await pathExists(dbPath))) {
    throw new Error(
      `Database not found at ${dbPath}. Is this a valid workspace?`
    );
  }
}

async function validateMountPoint(mountPoint: string): Promise<void> {
  if (!(await pathExists(mountPoint))) {
    throw new Error(`Mount point does not exist: ${mountPoint}`);
  }
  const mountPointStat = await stat(mountPoint);
  if (!mountPointStat.isDirectory()) {
    throw new Error(`Mount point is not a directory: ${mountPoint}`);
  }
}

async function resolveBackupDir(mountPoint: string): Promise<string> {
  const [first, second] = await listBackups(mountPoint);
  if (!first) {
    throw new Error('No backups found on this drive.');
  }
  if (second) {
    throw new Error(
      'Multiple backups found on this drive. Expected exactly one.'
    );
  }
  return first.directoryName;
}

async function commandList(io: Io, mountPoint?: string): Promise<number> {
  const { stdout, stderr } = io;
  if (!mountPoint) {
    stderr.write('Error: mount point is required\n');
    return 1;
  }

  const resolvedPath = resolve(mountPoint);
  try {
    await access(resolvedPath);
  } catch {
    stderr.write(`Error: mount point does not exist: ${resolvedPath}\n`);
    return 1;
  }

  const backups = await listBackups(resolvedPath);
  if (backups.length === 0) {
    stdout.write('No backups found.\n');
    return 0;
  }

  stdout.write(`Found ${backups.length} backup(s):\n\n`);
  for (const backup of backups) {
    stdout.write(`  ${backup.directoryName}/\n`);
    stdout.write(`    Election: ${backup.electionTitle}\n`);
    stdout.write(`    Date:     ${backup.electionDate}\n`);
    stdout.write(`    Created:  ${backup.createdAt}\n`);
    stdout.write(`    Size:     ${formatBytes(backup.sizeBytes)}\n`);
    stdout.write(`    Machine:  ${backup.machineId}\n`);
    stdout.write(`    Version:  ${backup.softwareVersion}\n`);
    stdout.write('\n');
  }
  return 0;
}

async function commandValidate(
  io: Io,
  backupDirPath?: string
): Promise<number> {
  const { stdout, stderr } = io;
  if (!backupDirPath) {
    stderr.write('Error: backup directory path is required\n');
    return 1;
  }

  const resolvedPath = resolve(backupDirPath);
  try {
    await access(resolvedPath);
  } catch {
    stderr.write(`Error: backup directory does not exist: ${resolvedPath}\n`);
    return 1;
  }

  stdout.write(`Validating ${resolvedPath}…\n`);
  const validateResult = await validateBackup(resolvedPath);

  if (validateResult.isErr()) {
    stderr.write(
      `Error: backup directory validation failed: ${formatBackupStopReason(
        validateResult.err()
      )}\n`
    );
    return 1;
  }

  const manifest = validateResult.ok();

  stdout.write('Validation passed.\n');
  stdout.write(`  Election: ${manifest.electionTitle}\n`);
  stdout.write(`  Date:     ${manifest.electionDate}\n`);
  stdout.write(`  Files:    ${manifest.files.length}\n`);
  stdout.write(`  Created:  ${manifest.createdAt}\n`);
  return 0;
}

async function commandBackup(
  io: Io,
  workspace: string,
  mountPoint: string,
  logger: BaseLogger
): Promise<number> {
  const { stdout } = io;
  const resolvedWorkspace = resolve(workspace);
  const resolvedMountPoint = resolve(mountPoint);

  await validateWorkspace(resolvedWorkspace);
  await validateMountPoint(resolvedMountPoint);

  const dbPath = join(resolvedWorkspace, WORKSPACE_DB_FILENAME);
  const ballotImagesPath = join(resolvedWorkspace, WORKSPACE_BALLOT_IMAGES_DIR);

  const machineId = getMachineId();
  const softwareVersion = getCodeVersion();

  using sigint = createSigintCanceller(io);

  stdout.write(`Backing up to ${resolvedMountPoint}…\n`);
  stdout.write(`  Workspace: ${resolvedWorkspace}\n`);
  stdout.write(`  Machine:   ${machineId}\n\n`);

  const backupResult = await performBackup({
    workspacePath: resolvedWorkspace,
    dbPath,
    ballotImagesPath,
    backupDriveMountPoint: resolvedMountPoint,
    machineId,
    softwareVersion,
    logger,
    backupDatabase: (destPath: string) =>
      DbClient.fileClient(dbPath, logger).backup(destPath),
    onProgress: (progress: BackupProgress) => {
      stdout.write(`\r  ${formatProgress(progress)}`.padEnd(60));
    },
    signal: sigint.controller.signal,
  });

  if (backupResult.isErr()) {
    const error = backupResult.err();
    if (error.type === 'cancelled') {
      stdout.write('\n\nBackup cancelled.\n');
      return 130;
    }

    throw new Error(formatBackupStopReason(error));
  }

  stdout.write('\n\nBackup completed successfully.\n');
  return 0;
}

async function commandRestore(
  io: Io,
  workspace: string,
  mountPoint: string,
  logger: BaseLogger
): Promise<number> {
  const { stdout } = io;
  const resolvedWorkspace = resolve(workspace);
  const resolvedMountPoint = resolve(mountPoint);
  const softwareVersion = getCodeVersion();

  await validateMountPoint(resolvedMountPoint);

  // For restore, the workspace may not have a data.db yet (fresh restore)
  if (!(await pathExists(resolvedWorkspace))) {
    throw new Error(`Workspace does not exist: ${resolvedWorkspace}`);
  }

  const backupDir = await resolveBackupDir(resolvedMountPoint);

  const dbPath = join(resolvedWorkspace, WORKSPACE_DB_FILENAME);
  const ballotImagesPath = join(resolvedWorkspace, WORKSPACE_BALLOT_IMAGES_DIR);

  using sigint = createSigintCanceller(io);

  stdout.write(`Restoring from ${backupDir}…\n`);
  stdout.write(`  Workspace: ${resolvedWorkspace}\n\n`);

  const restoreResult = await performRestore({
    workspacePath: resolvedWorkspace,
    dbPath,
    ballotImagesPath,
    backupDriveMountPoint: resolvedMountPoint,
    backupDirectoryName: backupDir,
    softwareVersion,
    logger,
    onProgress: (progress: RestoreProgress) => {
      stdout.write(`\r  ${formatRestoreProgress(progress)}`.padEnd(60));
    },
    signal: sigint.controller.signal,
  });

  if (restoreResult.isErr()) {
    const error = restoreResult.err();
    if (error.type === 'cancelled') {
      stdout.write(
        '\n\nRestore cancelled. Previous data has been preserved.\n'
      );
      return 130;
    }

    throw new Error(formatBackupStopReason(error));
  }

  const manifest = restoreResult.ok();

  stdout.write('\n\nRestore completed successfully.\n');
  stdout.write(`  Election: ${manifest.electionTitle}\n`);
  stdout.write(`  Date:     ${manifest.electionDate}\n`);
  stdout.write(`  Files:    ${manifest.files.length}\n`);
  return 0;
}

/** CLI entry point for backup management commands. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  const { stderr } = io;
  const logger = new BaseLogger(LogSource.System);

  let helpRequested = false;
  let exitCode: number | undefined;
  const parser = yargs()
    .strict()
    .exitProcess(false)
    .scriptName('backup')
    .usage('Usage: $0 <command> [options]')
    .help(false)
    .option('help', {
      alias: 'h',
      type: 'boolean',
      describe: 'Show help',
    })
    .version(false)
    .fail((msg) => {
      stderr.write(`${msg}\n`);
      exitCode = 1;
    })
    .command('list <mount-point>', 'List backups on a drive', (y) =>
      y.positional('mount-point', {
        type: 'string',
        describe: 'USB drive mount point',
      })
    )
    .command(
      'validate <backup-dir-path>',
      "Validate a backup's integrity",
      (y) =>
        y.positional('backup-dir-path', {
          type: 'string',
          describe: 'Path to backup directory',
        })
    )
    .command('backup', 'Run a backup to a USB drive', (y) =>
      y
        .option('workspace', {
          type: 'string',
          describe: 'Workspace directory (contains data.db, ballot-images/)',
          demandOption: true,
        })
        .option('mount-point', {
          type: 'string',
          describe: 'USB drive mount point',
          demandOption: true,
        })
    )
    .command('restore', 'Restore from a backup', (y) =>
      y
        .option('workspace', {
          type: 'string',
          describe: 'Workspace directory to restore into',
          demandOption: true,
        })
        .option('mount-point', {
          type: 'string',
          describe: 'USB drive mount point',
          demandOption: true,
        })
    )
    .command('help', 'Show help')
    .epilogue(
      `Environment:\n` +
        `  VX_MACHINE_ID              Machine ID (default: ${DEV_MACHINE_ID})\n` +
        `  VX_CODE_VERSION            Software version (default: dev)\n` +
        `  DEBUG=admin:backup         Enable debug logging\n` +
        `  DEBUG=admin:restore        Enable debug logging for restore`
    )
    .demandCommand(1, '')
    .middleware((parsedArgs) => {
      if (parsedArgs['help'] || parsedArgs._[0] === 'help') {
        helpRequested = true;
      }
    });

  const args = await parser.parse(argv.slice(2));

  if (helpRequested) {
    parser.showHelp((text) => {
      io.stdout.write(`${text}\n`);
    });
    return 0;
  }

  if (typeof exitCode !== 'undefined') {
    return exitCode;
  }

  const command = args._[0];

  try {
    switch (command) {
      case 'list':
        return await commandList(io, args['mount-point'] as string | undefined);

      case 'validate':
        return await commandValidate(
          io,
          args['backup-dir-path'] as string | undefined
        );

      case 'backup':
        return await commandBackup(
          io,
          args['workspace'] as string,
          args['mount-point'] as string,
          logger
        );

      case 'restore':
        return await commandRestore(
          io,
          args['workspace'] as string,
          args['mount-point'] as string,
          logger
        );

      default:
        stderr.write(`Unknown command: ${String(command)}\n`);
        parser.showHelp((text) => {
          stderr.write(`${text}\n`);
        });
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`\nError: ${message}\n`);
    return 1;
  }
}
