import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import yargs from 'yargs';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { format } from '@votingworks/utils';
import { DEV_WORKSPACE } from '../globals.js';
import { getMachineConfig } from '../machine_config.js';
import { openExistingWorkspace } from '../util/workspace.js';
import { createBackup, formatBackupError } from './create_backup.js';
import {
  BACKUPS_DIRECTORY_NAME,
  isTransientBackupDirectoryName,
  readManifest,
} from './manifest.js';
import { checkMachineConfigEnv, checkNodeEnv } from './node_env.js';
import { formatStepLabel, ProgressDisplay } from './progress_display.js';
import { SyslogWriter } from './syslog.js';
import {
  formatBackupValidationError,
  validateBackup,
} from './validate_backup.js';

interface Streams {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

/**
 * Env vars are declared readonly so that nothing reassigns them mid-run. The
 * CLI has no service manager to set them for it, so it is the one place that
 * writes them; this view keeps the values type-checked while it does.
 */
type MutableProcessEnv = {
  -readonly [K in keyof NodeJS.ProcessEnv]: NodeJS.ProcessEnv[K];
};

interface BackupsArguments {
  _: Array<string | number>;
  workspace?: string;
  target?: string;
  backupDir?: string;
  targetDir?: string;
  [key: string]: unknown;
}

/**
 * Whether log lines should be shown in the terminal as well as sent to the
 * system log. On a real machine they would only be noise on top of the progress
 * bar, and the system log is where they belong; on a development machine
 * nobody wants to go reading the system log to see what a command did.
 */
export function shouldEchoLogsToTerminal(nodeEnv?: string): boolean {
  return nodeEnv !== 'production';
}

interface CliLogger {
  logger: BaseLogger;
  flushLogs: () => Promise<readonly unknown[]>;
}

/**
 * A logger whose lines go to the system log, so that a backup run by hand shows
 * up in an exported log bundle the way one run by the app does. Outside
 * production the lines are echoed above the progress bar too, since a developer
 * has no reason to go reading the system log.
 */
function makeCliLogger(
  display: ProgressDisplay,
  syslog: SyslogWriter
): CliLogger {
  const logger = new BaseLogger(LogSource.System, undefined, (logLine) => {
    syslog.write(logLine);
    if (shouldEchoLogsToTerminal(process.env['NODE_ENV'])) {
      display.writeAbove(logLine);
    }
  });
  const cliLogger: CliLogger = {
    logger,
    flushLogs: () => syslog.flush(),
  };
  return cliLogger;
}

async function create(
  args: BackupsArguments,
  { stdout, stderr }: Streams,
  syslog: SyslogWriter
): Promise<number> {
  const workspacePath = assertDefined(args.workspace);
  const targetPath = assertDefined(args.target);

  // Nothing below creates a workspace, so a path that doesn't hold one has to
  // be caught here rather than reported later as "no election is configured",
  // which reads as a problem with the machine rather than with what was typed.
  if (!existsSync(join(workspacePath, 'data.db'))) {
    stderr.write(
      `No VxAdmin workspace at ${workspacePath}: it has no data.db.\n`
    );
    return 1;
  }

  const display = new ProgressDisplay(
    stderr,
    Boolean((stderr as NodeJS.WriteStream).isTTY)
  );
  const { logger, flushLogs } = makeCliLogger(display, syslog);
  const workspace = openExistingWorkspace(workspacePath, logger);
  const result = await createBackup({
    workspace,
    targetDirectoryPath: targetPath,
    machineConfig: getMachineConfig(),
    logger,
    onProgress: (progress) => {
      display.update({ ...progress, label: formatStepLabel(progress.step) });
    },
  });
  display.finish();

  const logErrors = await flushLogs();
  if (logErrors.length > 0) {
    stderr.write(
      `Warning: ${logErrors.length} log line(s) could not be written to the ` +
        `system log: ${extractErrorMessage(logErrors[0])}\n`
    );
  }

  if (result.isErr()) {
    stderr.write(`Backup failed: ${formatBackupError(result.err())}\n`);
    return 1;
  }

  const { backupDirectoryPath, manifest } = result.ok();
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
  stdout.write(
    `Backed up ${manifest.files.length} files (${format.bytes(
      totalBytes
    )}) to ${backupDirectoryPath}\n`
  );
  return 0;
}

async function validate(
  args: BackupsArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  const backupDirectoryPath = assertDefined(args.backupDir);

  const display = new ProgressDisplay(
    stderr,
    Boolean((stderr as NodeJS.WriteStream).isTTY)
  );
  const result = await validateBackup({
    backupDirectoryPath,
    onProgress: (progress) => {
      display.update({ ...progress, label: 'Verifying' });
    },
  });
  display.finish();

  if (result.isErr()) {
    stderr.write(`Invalid: ${formatBackupValidationError(result.err())}\n`);
    return 1;
  }

  const manifest = result.ok();
  stdout.write(
    `Valid: ${manifest.files.length} files, backed up ${manifest.createdAt} ` +
      `by machine ${manifest.machineId} running ${manifest.softwareVersion}\n`
  );
  return 0;
}

async function list(
  args: BackupsArguments,
  { stdout, stderr }: Streams
): Promise<number> {
  const targetPath = assertDefined(args.targetDir);

  const backupsDirectoryPath = join(targetPath, BACKUPS_DIRECTORY_NAME);
  let entries;
  try {
    entries = await readdir(backupsDirectoryPath, { withFileTypes: true });
  } catch {
    stderr.write(`No backups found in ${backupsDirectoryPath}\n`);
    return 1;
  }

  const backupDirectoryNames = entries
    .filter(
      (entry) =>
        entry.isDirectory() && !isTransientBackupDirectoryName(entry.name)
    )
    .map((entry) => entry.name)
    .sort();

  for (const backupDirectoryName of backupDirectoryNames) {
    const manifestResult = await readManifest(
      join(backupsDirectoryPath, backupDirectoryName)
    );
    if (manifestResult.isErr()) {
      stdout.write(`${backupDirectoryName}\tunreadable manifest\n`);
    } else {
      const manifest = manifestResult.ok();
      stdout.write(
        `${backupDirectoryName}\t${manifest.election.title}\t${manifest.createdAt}\t${manifest.softwareVersion}\n`
      );
    }
  }
  return 0;
}

/**
 * Overridable pieces of the CLI's environment, so that tests can point it at a
 * different development workspace and read back what it logged.
 */
export interface MainOptions {
  /** Where log lines go. Built by `bin/backups` for a real run. */
  syslog: SyslogWriter;
  devWorkspacePath?: string;
}

/**
 * Entry point for the `backups` CLI.
 */
export async function main(
  argv: string[],
  streams: Streams,
  { syslog, devWorkspacePath = DEV_WORKSPACE }: MainOptions
): Promise<number> {
  // Required by libs/auth to pick the right signing cert. The app gets this
  // from its environment; the CLI is run by hand, so set it here.
  process.env['VX_MACHINE_TYPE'] = 'admin';

  const { stdout, stderr } = streams;
  const parser = yargs()
    .scriptName('backups')
    .usage('Usage: $0 <command> [options]')
    .command('create', 'Back up a workspace to a backup drive', (command) =>
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
      'validate <backupDir>',
      'Check a backup against its signed manifest',
      (command) =>
        command.positional('backupDir', {
          type: 'string',
          description: 'Backup directory to check',
        })
    )
    .command(
      'list <targetDir>',
      'List the backups on a backup drive',
      (command) =>
        command.positional('targetDir', {
          type: 'string',
          description: 'Backup drive mount point, e.g. /media/vx/backup',
        })
    )
    .demandCommand(1, 'A command is required')
    .epilogue(
      'Stop VxAdmin before running these commands: they use its workspace.'
    )
    .strict()
    .exitProcess(false)
    .version(false);

  // The callback hands us whatever yargs would have printed itself — help,
  // usage, or a validation message — so it lands on the caller's streams
  // instead of the console, and so yargs doesn't exit the process.
  let parseError: Error | undefined;
  let parserOutput = '';
  const args = (await parser.parseAsync(
    argv.slice(2),
    (error: Error | undefined, _parsed: unknown, output: string) => {
      parseError = error;
      parserOutput = output;
    }
  )) as BackupsArguments;

  if (parseError) {
    stderr.write(`${parserOutput}\n`);
    return 1;
  }
  if (parserOutput) {
    stdout.write(`${parserOutput}\n`);
    return 0;
  }

  // `libs/auth` reads NODE_ENV to choose between dev and production signing
  // certs, and `libs/db` reads it to decide whether a schema mismatch may reset
  // the database. Backing up this package's own dev workspace is the one case
  // we can identify without being told; anywhere else, let those libraries
  // insist on being told rather than guess on their behalf.
  if (
    !process.env['NODE_ENV'] &&
    args.workspace !== undefined &&
    resolve(args.workspace) === resolve(devWorkspacePath)
  ) {
    (process.env as MutableProcessEnv).NODE_ENV = 'development';
  }

  // `create` and `validate` both reach libs/auth, which reads NODE_ENV to pick
  // signing certs — but only once it needs to sign or verify, which for a
  // backup is after every byte has been copied. Checking here means a missing
  // or bogus value costs a moment instead of a full copy. `list` never gets
  // that far, so it is left alone.
  if (args._[0] === 'create' || args._[0] === 'validate') {
    const nodeEnvError = checkNodeEnv();
    if (nodeEnvError !== undefined) {
      stderr.write(`${nodeEnvError}\n`);
      return 1;
    }
  }

  // Checked here rather than when the manifest is written, for the same reason
  // as NODE_ENV: by then the copy is done.
  if (args._[0] === 'create') {
    const machineConfigError = checkMachineConfigEnv();
    if (machineConfigError !== undefined) {
      stderr.write(`${machineConfigError}\n`);
      return 1;
    }
  }

  switch (args._[0]) {
    case 'create':
      return await create(args, streams, syslog);
    case 'validate':
      return await validate(args, streams);
    case 'list':
      return await list(args, streams);
    /* istanbul ignore next: `strict` rejects unknown commands before this */
    default:
      throw new Error(`Unknown command: ${args._[0]}`);
  }
}
