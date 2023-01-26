import { err, ok, Result, find } from '@votingworks/basics';
import { get as getCommands } from './commands';
import { GlobalOptions } from './types';

export function parseGlobalOptions(
  args: readonly string[]
): Result<GlobalOptions, Error> {
  let help = false;
  let i = 2;
  let done = false;

  for (; i < args.length && !done; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        help = true;
        break;

      default:
        if (!arg.startsWith('-')) {
          done = true;
          i -= 1;
        } else {
          return err(new Error(`Unknown global option: ${arg}`));
        }
        break;
    }
  }

  return ok({
    nodePath: args[0],
    executablePath: args[1],
    help,
    command: args[i],
    commandArgs: args.slice(i + 1),
  });
}

export async function main(
  args: typeof process.argv,
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): Promise<number> {
  const commands = getCommands();
  const globalOptionsResult = parseGlobalOptions(args);

  if (globalOptionsResult.isErr()) {
    stderr.write(`error: ${globalOptionsResult.err().message}\n`);
    return -1;
  }

  const globalOptions = globalOptionsResult.ok();

  if (globalOptions.help || !globalOptions.command) {
    const helpCommand = find(commands, (cmd) => cmd.name === 'help');
    const code = await helpCommand.run(
      commands,
      globalOptions,
      stdin,
      stdout,
      stderr
    );
    return globalOptions.help ? code : -1;
  }

  const command = commands.find((cmd) => cmd.name === globalOptions.command);

  if (!command) {
    stderr.write(`error: Unknown command: ${globalOptions.command}\n`);
    return -1;
  }

  return command.run(commands, globalOptions, stdin, stdout, stderr);
}
