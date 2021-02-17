import * as helpCommand from './commands/help'
import * as interpretCommand from './commands/interpret'
import * as layoutCommand from './commands/layout'

export interface Command<O> {
  name: string
  parseOptions(args: readonly string[]): Promise<O>
  run(
    options: O,
    stdin: typeof process.stdin,
    stdout: typeof process.stdout
  ): Promise<number>
}

export class OptionParseError extends Error {}

export interface GlobalOptions {
  nodePath: string
  executablePath: string
  help: boolean
  command: string
  commandArgs: readonly string[]
}

export const commands = [helpCommand, interpretCommand, layoutCommand] as const
export type Options =
  | {
      command: typeof helpCommand.name
      options: helpCommand.Options
    }
  | {
      command: typeof interpretCommand.name
      options: interpretCommand.Options
    }
  | {
      command: typeof layoutCommand.name
      options: layoutCommand.Options
    }

export function parseGlobalOptions(args: readonly string[]): GlobalOptions {
  let help = false
  let i = 2
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
    nodePath: args[0],
    executablePath: args[1],
    help,
    command: args[i],
    commandArgs: args.slice(i + 1),
  }
}

export async function parseOptions(args: readonly string[]): Promise<Options> {
  const globalOptions = parseGlobalOptions(args)

  if (globalOptions.help) {
    return {
      command: helpCommand.name,
      options: await helpCommand.parseOptions(globalOptions),
    }
  }

  const { command } = globalOptions
  switch (command) {
    case 'help':
      return {
        command,
        options: await helpCommand.parseOptions(globalOptions),
      }

    case 'interpret':
      return {
        command,
        options: await interpretCommand.parseOptions(globalOptions),
      }

    case 'layout':
      return {
        command,
        options: await layoutCommand.parseOptions(globalOptions),
      }

    default:
      throw new OptionParseError(`Unknown command: ${command}`)
  }
}

export default async function main(
  args: typeof process.argv,
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): Promise<number> {
  try {
    const commandOptions = await parseOptions(args)

    switch (commandOptions.command) {
      case 'help':
        return await helpCommand.run(
          commandOptions.options,
          stdin,
          stdout,
          stderr
        )

      case 'interpret':
        return await interpretCommand.run(
          commandOptions.options,
          stdin,
          stdout,
          stderr
        )

      case 'layout':
        return await layoutCommand.run(
          commandOptions.options,
          stdin,
          stdout,
          stderr
        )
    }
  } catch (error) {
    if (error instanceof OptionParseError) {
      stderr.write(`error: ${error.message}\n`)
      const options = await helpCommand.parseOptions({
        nodePath: args[0],
        executablePath: args[1],
        help: true,
        command: 'help',
        commandArgs: [],
      })
      helpCommand.printHelp(options, stderr)
      return -1
    } else {
      throw error
    }
  }
}
