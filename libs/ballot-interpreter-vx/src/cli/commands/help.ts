import chalk from 'chalk';
import { basename } from 'path';
import { Command, GlobalOptions } from '../types';

export const name = 'help';
export const description = 'Show help about a command';

export interface Options {
  readonly $0: string;
  readonly command?: string;
}

export function parseOptions({
  commandArgs,
  executablePath,
}: GlobalOptions): Options {
  const $0 = basename(executablePath);

  if (commandArgs.length === 0) {
    return { $0 };
  }

  const command = commandArgs[0];
  switch (command) {
    case '-h':
    case '--help':
      return {
        $0,
        command: 'help',
      };

    default:
      return { $0, command };
  }
}

function printGlobalHelp(
  commands: Command[],
  options: Options,
  out: NodeJS.WritableStream
): number {
  out.write(`Usage: ${options.$0} COMMAND [ARGS]\n`);
  out.write(`\n`);
  out.write(chalk.bold(`Commands:\n`));
  out.write(`\n`);

  const commandNameSpace =
    Math.max(...commands.map((command) => command.name.length)) + 3;

  for (const command of commands) {
    out.write(
      `  ${chalk.bold(command.name)}${' '.repeat(
        commandNameSpace - command.name.length
      )}${command.description}\n`
    );
  }
  out.write(`\n`);
  return 0;
}

function printCommandHelp(
  commands: readonly Command[],
  globalOptions: GlobalOptions,
  options: Options,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): number {
  const command = commands.find((cmd) => cmd.name === options.command);

  if (!command) {
    stderr.write(`error: Unknown command: ${options.command}\n`);
    return 1;
  }

  command.printHelp(globalOptions, stdout);
  return 0;
}

export function printHelp(
  globalOptions: GlobalOptions,
  out: NodeJS.WritableStream
): void {
  out.write(`Usage: ${basename(globalOptions.executablePath)} help COMMAND\n`);
  out.write(`\n`);
  out.write(`Print usage information for COMMAND.\n`);
}

export function run(
  commands: Command[],
  globalOptions: GlobalOptions,
  _stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): number {
  const options = parseOptions(globalOptions);

  if (options.command) {
    return printCommandHelp(commands, globalOptions, options, stdout, stderr);
  }

  return printGlobalHelp(commands, options, stdout);
}
