/**
 * CLI for managing VxAdmin election backups.
 *
 * Usage:
 *   bin/backup list <mount-point>
 *   bin/backup validate <backup-dir-path>
 *   bin/backup backup [options]
 *   bin/backup restore [options]
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  DEV_MACHINE_ID,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';

import { listBackups, performBackup, validateBackup } from './backup';
import { performRestore } from './restore';
import { BackupProgress, RestoreProgress } from './types';

/** Streams for CLI output. */
export interface Io {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const USAGE = `Usage: backup <command> [options]

Commands:
  list <mount-point>                  List backups on a drive
  validate <backup-dir-path>          Validate a backup's integrity
  backup [options]                    Run a backup to a USB drive
  restore [options]                   Restore from a backup

Backup options:
  --workspace <path>         Workspace directory (contains data.db, ballot-images/)
  --mount-point <path>       USB drive mount point

Restore options:
  --workspace <path>         Workspace directory to restore into
  --mount-point <path>       USB drive mount point

Environment:
  VX_MACHINE_ID              Machine ID (default: ${DEV_MACHINE_ID})
  VX_CODE_VERSION            Software version (default: dev)
  DEBUG=admin:backup         Enable debug logging
  DEBUG=admin:restore        Enable debug logging for restore
`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] ?? '';
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 1; i < args.length; ) {
    const arg = args[i] ?? '';
    if (arg.startsWith('--')) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        flags.set(arg, 'true');
        i += 1;
      } else {
        flags.set(arg, value);
        i += 2;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, positional, flags };
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(`--${name}`);
  if (!value) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value;
}

/** Format backup progress for display. */
export function formatProgress(progress: BackupProgress): string {
  switch (progress.phase) {
    case 'preflight':
      return 'Pre-flight checks...';
    case 'snapshot':
      return 'Creating database snapshot...';
    case 'images':
      if (progress.imagesTotal === 0) return 'Processing images...';
      return `Copying images: ${progress.imagesCopied}/${progress.imagesTotal}`;
    case 'signing':
      return 'Signing manifest...';
    case 'validating':
      return 'Validating backup...';
    default:
      return `${progress.phase}...`;
  }
}

/** Format restore progress for display. */
export function formatRestoreProgress(progress: RestoreProgress): string {
  switch (progress.phase) {
    case 'preflight':
      return 'Validating backup and checking disk space...';
    case 'copying':
      if (progress.filesTotal === 0) return 'Copying files...';
      return `Copying files: ${progress.filesCopied}/${progress.filesTotal}`;
    case 'activating':
      return 'Activating restored data...';
    default:
      return `${progress.phase}...`;
  }
}

/** Format a byte count for human-readable display. */
export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

/** Register a SIGINT handler for graceful cancellation with force-quit on double press. */
export function createSigintCanceller(io: Io): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  function handler() {
    if (controller.signal.aborted) {
      process.exit(130);
    }
    controller.abort();
    io.stderr.write('\nCancelling... (press Ctrl+C again to force quit)\n');
  }
  process.on('SIGINT', handler);
  return {
    controller,
    cleanup: () => {
      process.removeListener('SIGINT', handler);
    },
  };
}

function backupDatabaseFn(
  dbPath: string,
  logger: BaseLogger
): (destPath: string) => void {
  return (destPath: string) => {
    const client = DbClient.fileClient(dbPath, logger);
    client.backup(destPath);
  };
}

interface ElectionInfo {
  electionId: string;
  electionTitle: string;
  electionDate: string;
  electionDirName: string;
}

/**
 * Read the current election info from the workspace database. Uses the
 * same schema queries that the Store class uses, so the CLI exercises
 * the same data path as the server.
 */
function readElectionFromDatabase(
  dbPath: string,
  logger: BaseLogger
): ElectionInfo {
  const client = DbClient.fileClient(dbPath, logger);

  const settings = client.one(
    'select current_election_id as currentElectionId from settings'
  ) as { currentElectionId: string | null } | undefined;

  const electionId = settings?.currentElectionId;
  if (!electionId) {
    throw new Error(
      'No election is currently configured. Configure an election before backing up.'
    );
  }

  const row = client.one(
    'select election_data as electionData from elections where id = ?',
    electionId
  ) as { electionData: string } | undefined;

  if (!row) {
    throw new Error(`Election record not found for id: ${electionId}`);
  }

  const parseResult = safeParseElectionDefinition(row.electionData);
  if (parseResult.isErr()) {
    throw new Error(
      `Failed to parse election definition: ${parseResult.err().message}`
    );
  }

  const { election, ballotHash } = parseResult.ok();
  const electionDirName = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );

  return {
    electionId,
    electionTitle: election.title,
    electionDate: election.date.toISOString(),
    electionDirName,
  };
}

function getMachineId(): string {
  return process.env.VX_MACHINE_ID || DEV_MACHINE_ID;
}

function getCodeVersion(): string {
  return process.env.VX_CODE_VERSION || 'dev';
}

function validateWorkspace(workspacePath: string): void {
  if (!existsSync(workspacePath)) {
    throw new Error(`Workspace does not exist: ${workspacePath}`);
  }
  const dbPath = join(workspacePath, 'data.db');
  if (!existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. Is this a valid workspace?`
    );
  }
}

function validateMountPoint(mountPoint: string): void {
  if (!existsSync(mountPoint)) {
    throw new Error(`Mount point does not exist: ${mountPoint}`);
  }
  const stat = statSync(mountPoint);
  if (!stat.isDirectory()) {
    throw new Error(`Mount point is not a directory: ${mountPoint}`);
  }
}

function resolveBackupDir(mountPoint: string): string {
  const [first, second] = listBackups(mountPoint);
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

function commandList(io: Io, positional: string[]): number {
  const { stdout, stderr } = io;
  const mountPoint = positional[0];
  if (!mountPoint) {
    stderr.write('Error: mount point is required\n');
    stderr.write(USAGE);
    return 1;
  }

  const resolvedPath = resolve(mountPoint);
  if (!existsSync(resolvedPath)) {
    stderr.write(`Error: mount point does not exist: ${resolvedPath}\n`);
    return 1;
  }

  const backups = listBackups(resolvedPath);
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
    stdout.write(`    Size:     ${formatSize(backup.sizeBytes)}\n`);
    stdout.write(`    Machine:  ${backup.machineId}\n`);
    stdout.write(`    Version:  ${backup.softwareVersion}\n`);
    stdout.write('\n');
  }
  return 0;
}

async function commandValidate(io: Io, positional: string[]): Promise<number> {
  const { stdout, stderr } = io;
  const backupDirPath = positional[0];
  if (!backupDirPath) {
    stderr.write('Error: backup directory path is required\n');
    stderr.write(USAGE);
    return 1;
  }

  const resolvedPath = resolve(backupDirPath);
  if (!existsSync(resolvedPath)) {
    stderr.write(`Error: backup directory does not exist: ${resolvedPath}\n`);
    return 1;
  }

  stdout.write(`Validating ${resolvedPath}...\n`);
  const manifest = await validateBackup(resolvedPath);
  stdout.write('Validation passed.\n');
  stdout.write(`  Election: ${manifest.electionTitle}\n`);
  stdout.write(`  Date:     ${manifest.electionDate}\n`);
  stdout.write(`  Files:    ${manifest.files.length}\n`);
  stdout.write(`  Created:  ${manifest.createdAt}\n`);
  return 0;
}

async function commandBackup(
  io: Io,
  flags: Map<string, string>,
  logger: BaseLogger
): Promise<number> {
  const { stdout } = io;
  const workspace = resolve(requireFlag(flags, 'workspace'));
  const mountPoint = resolve(requireFlag(flags, 'mount-point'));

  validateWorkspace(workspace);
  validateMountPoint(mountPoint);

  const dbPath = join(workspace, 'data.db');
  const ballotImagesPath = join(workspace, 'ballot-images');

  const electionInfo = readElectionFromDatabase(dbPath, logger);
  const machineId = getMachineId();
  const softwareVersion = getCodeVersion();

  const sigint = createSigintCanceller(io);

  stdout.write(`Backing up to ${mountPoint}...\n`);
  stdout.write(
    `  Election: ${electionInfo.electionTitle} (${electionInfo.electionDate})\n`
  );
  stdout.write(`  Workspace: ${workspace}\n`);
  stdout.write(`  Machine:   ${machineId}\n\n`);

  try {
    await performBackup({
      workspacePath: workspace,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      electionId: electionInfo.electionId,
      electionTitle: electionInfo.electionTitle,
      electionDate: electionInfo.electionDate,
      electionDirName: electionInfo.electionDirName,
      machineId,
      softwareVersion,
      logger,
      backupDatabase: backupDatabaseFn(dbPath, logger),
      onProgress: (progress: BackupProgress) => {
        stdout.write(`\r  ${formatProgress(progress)}`.padEnd(60));
      },
      signal: sigint.controller.signal,
    });

    stdout.write('\n\nBackup completed successfully.\n');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Backup was cancelled') {
      stdout.write('\n\nBackup cancelled.\n');
      return 130;
    }
    throw error;
  } finally {
    sigint.cleanup();
  }
}

async function commandRestore(
  io: Io,
  flags: Map<string, string>,
  logger: BaseLogger
): Promise<number> {
  const { stdout } = io;
  const workspace = resolve(requireFlag(flags, 'workspace'));
  const mountPoint = resolve(requireFlag(flags, 'mount-point'));
  const softwareVersion = getCodeVersion();

  validateMountPoint(mountPoint);

  // For restore, the workspace may not have a data.db yet (fresh restore)
  if (!existsSync(workspace)) {
    throw new Error(`Workspace does not exist: ${workspace}`);
  }

  const backupDir = resolveBackupDir(mountPoint);

  const dbPath = join(workspace, 'data.db');
  const ballotImagesPath = join(workspace, 'ballot-images');

  const sigint = createSigintCanceller(io);

  stdout.write(`Restoring from ${backupDir}...\n`);
  stdout.write(`  Workspace: ${workspace}\n\n`);

  try {
    const manifest = await performRestore({
      workspacePath: workspace,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      backupDirectoryName: backupDir,
      softwareVersion,
      logger,
      onProgress: (progress: RestoreProgress) => {
        stdout.write(`\r  ${formatRestoreProgress(progress)}`.padEnd(60));
      },
      signal: sigint.controller.signal,
    });

    stdout.write('\n\nRestore completed successfully.\n');
    stdout.write(`  Election: ${manifest.electionTitle}\n`);
    stdout.write(`  Date:     ${manifest.electionDate}\n`);
    stdout.write(`  Files:    ${manifest.files.length}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Restore was cancelled') {
      stdout.write(
        '\n\nRestore cancelled. Previous data has been preserved.\n'
      );
      return 130;
    }
    throw error;
  } finally {
    sigint.cleanup();
  }
}

/** CLI entry point for backup management commands. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  const { stdout, stderr } = io;
  const logger = new BaseLogger(LogSource.System);

  try {
    switch (command) {
      case 'list':
        return commandList(io, positional);

      case 'validate':
        return await commandValidate(io, positional);

      case 'backup':
        return await commandBackup(io, flags, logger);

      case 'restore':
        return await commandRestore(io, flags, logger);

      case 'help':
      case '--help':
      case '-h':
        stdout.write(USAGE);
        return 0;

      default:
        if (command) {
          stderr.write(`Unknown command: ${command}\n`);
        }
        stderr.write(USAGE);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`\nError: ${message}\n`);
    return 1;
  }
}
