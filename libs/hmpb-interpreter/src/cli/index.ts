import {
  default as runInterpret,
  Options as InterpretOptions,
  parseOptions as parseInterpretOptions,
} from './commands/interpret'
import {
  default as runHelp,
  Options as HelpOptions,
  parseOptions as parseHelpOptions,
  printHelp,
} from './commands/help'

export class OptionParseError extends Error {}

export interface GlobalOptions {
  help: boolean
  commandArgs: readonly string[]
}

export type Options =
  | {
      command: 'interpret'
      options: InterpretOptions
    }
  | {
      command: 'help'
      options: HelpOptions
    }

export function parseGlobalOptions(args: readonly string[]): GlobalOptions {
  let help = false
  let i = 0
  let done = false

  for (; i < args.length && !done; i += 1) {
    const arg = args[i]

    switch (arg) {
      case '-h':
      case '--help':
        help = true
        break

      default:
        if (!arg.startsWith('-')) {
          done = true
          i -= 1
        } else {
          throw new OptionParseError(`Unknown global option: ${arg}`)
        }
        break
    }
  }

  return {
    help,
    commandArgs: args.slice(i),
  }
}

export async function parseOptions(args: readonly string[]): Promise<Options> {
  const { help, commandArgs } = parseGlobalOptions(args)

  if (help) {
    return {
      command: 'help',
      options: await parseHelpOptions(commandArgs),
    }
  }

  switch (commandArgs[0]) {
    case 'interpret':
      return {
        command: commandArgs[0],
        options: await parseInterpretOptions(args.slice(1)),
      }

    case 'help':
      return {
        command: commandArgs[0],
        options: await parseHelpOptions(args.slice(1)),
      }

    default:
      throw new OptionParseError(`Unknown command: ${args[0]}`)
  }
}

export default async function main(
  args: typeof process.argv,
  stdin: typeof process.stdin,
  stdout: typeof process.stdout,
  stderr: typeof process.stderr
): Promise<number> {
  try {
    const commandOptions = await parseOptions(args.slice(2))

    switch (commandOptions.command) {
      case 'interpret':
        return runInterpret(commandOptions.options, stdin, stdout)

      case 'help':
        return runHelp(commandOptions.options, stdin, stdout)

      default:
        return 127
    }
  } catch (error) {
    if (error instanceof OptionParseError) {
      stderr.write(`error: ${error.message}\n`)
      printHelp(stderr)
      return -1
    } else {
      throw error
    }
  }
}
