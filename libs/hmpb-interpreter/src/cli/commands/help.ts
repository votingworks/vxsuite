import chalk from 'chalk'
import { basename } from 'path'
import { GlobalOptions } from '..'
import * as helpCommand from './help'
import * as interpretCommand from './interpret'
import * as layoutCommand from './layout'

export const name = 'help'
export const description = 'Show help about a command'

const commands = [helpCommand, interpretCommand, layoutCommand] as const

export interface Options {
  readonly $0: string
  readonly command?:
    | typeof helpCommand['name']
    | typeof interpretCommand['name']
    | typeof layoutCommand['name']
}

export async function parseOptions({
  commandArgs,
  executablePath,
}: GlobalOptions): Promise<Options> {
  return {
    $0: basename(executablePath),
    command: commandArgs[0] as Options['command'],
  }
}

function printGlobalHelp(options: Options, out: NodeJS.WriteStream): void {
  out.write(`Usage: ${options.$0} COMMAND [ARGS]\n`)
  out.write(`\n`)
  out.write(chalk.bold(`Commands:\n`))
  out.write(`\n`)

  const commandNameSpace =
    Math.max(...commands.map(({ name }) => name.length)) + 3

  for (const { name, description } of commands) {
    out.write(
      `  ${chalk.bold(name)}${' '.repeat(
        commandNameSpace - name.length
      )}${description}\n`
    )
  }
  out.write(`\n`)
}

export function printCommandHelp(
  options: Options,
  out: NodeJS.WriteStream
): void {
  out.write(`Usage: ${options.$0} help COMMAND\n`)
  out.write(`\n`)
  out.write(`Print usage information for COMMAND.\n`)
}

export function printHelp(options: Options, out: NodeJS.WriteStream): void {
  switch (options.command) {
    case undefined:
      printGlobalHelp(options, out)
      break

    case 'help':
      printCommandHelp(options, out)
      break

    case 'interpret':
      interpretCommand.printHelp(options.$0, out)
      break

    case 'layout':
      layoutCommand.printHelp(options.$0, out)
      break

    default:
      throw new Error(`unknown command: ${options.command}`)
  }
}

export async function run(
  options: Options,
  _stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream
): Promise<number> {
  printHelp(options, stdout)
  return 0
}
