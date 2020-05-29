import { basename } from 'path'
import { OptionParseError } from '..'
import chalk from 'chalk'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Options {
  // intentionally empty
}

export async function parseOptions(args: readonly string[]): Promise<Options> {
  if (args.length > 0) {
    throw new OptionParseError(`Unexpected argument to 'help': ${args[0]}`)
  }

  return {}
}

export function printHelp(out: typeof process.stdout): void {
  const $0 = basename(process.argv[1])
  out.write(`Usage: ${$0} interpret -e JSON IMG1 [IMG2 …]\n`)
  out.write(`\n`)
  out.write(chalk.bold(`Examples\n`))
  out.write(`\n`)
  out.write(chalk.gray(`# Interpret ballots based on a single template.\n`))
  out.write(`${$0} interpret -e election.json -t template.jpg ballot*.jpg\n`)
  out.write(`\n`)
  out.write(chalk.gray(`# Interpret ballots to JSON.\n`))
  out.write(
    `${$0} interpret -e election.json -f json template*.jpg ballot*.jpg\n`
  )
  out.write(`\n`)
  out.write(
    chalk.gray(
      `# Specify image metadata (file:ballotStyleId:precinctId:pageNumber:pageCount).\n`
    )
  )
  out.write(
    `${$0} interpret -e election.json template1.jpg:2D:77:1:2 template2.jpg:2D:77:2:2 ballot1.jpg:2D:77:1:2\n`
  )
  out.write(`\n`)
  out.write(chalk.gray(`# Set an explicit minimum mark score (0-1).\n`))
  out.write(
    `${$0} interpret -e election.json -m 0.5 template*.jpg ballot*.jpg\n`
  )
  out.write(`\n`)
  out.write(
    chalk.gray(
      `# Automatically process images as templates until all pages are found.\n`
    )
  )
  out.write(`${$0} interpret -e election.json image*.jpg\n`)
}

export default async function run(
  options: Options,
  stdin: typeof process.stdin,
  stdout: typeof process.stdout
): Promise<number> {
  printHelp(stdout)
  return 0
}
