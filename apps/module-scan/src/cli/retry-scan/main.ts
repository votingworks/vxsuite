import chalk from 'chalk'
import deepEqual from 'deep-eql'
import diff from 'jest-diff'
import ora, { Ora } from 'ora'
import { PageScan, retryScan } from '.'
import MultiMap from '../../util/MultiMap'
import Spinner, {
  countProvider,
  CountProvider,
  durationProvider,
} from '../util/spinner'
import { DiffWhen, Options, parseOptions } from './options'

export function printHelp(out: NodeJS.WritableStream): void {
  out.write(
    `${chalk.bold('retry-scan:')} Retry scanning already-scanned sheets.\n\n`
  )
  out.write(`${chalk.bold('retry-scan')} --all\n`)
  out.write(
    `${chalk.bold('retry-scan')} ${chalk.italic(
      '[--unreadable] [--uninterpreted]'
    )}\n`
  )
  out.write(
    `${chalk.bold('retry-scan')} SHEETID ${chalk.italic('[SHEETID …]')}\n`
  )
  out.write(`\n`)
  out.write(
    `Combining filters is an OR, not an AND, so '--unreadable --uninterpreted'\n`
  )
  out.write(
    `retries sheets with pages that are either unreadable or uninterpreted.\n`
  )
  out.write(`\n`)
  out.write(`${chalk.bold('Options')}\n`)
  out.write(
    `  -i, --input-workspace   A directory containing a database and scanned images, such as from\n`
  )
  out.write(
    `                          an unzipped backup. Defaults to the dev-workspace directory.\n`
  )
  out.write(
    `  -o, --output-workspace  A directory to put the output database and scanned images.\n`
  )
  out.write(`                          Defaults to a temporary directory.\n`)
  out.write(
    `  -d, --diff-when RULE    When to print a diff of interpretations: always, never, or same-type (default).\n`
  )
}

/**
 * Run the retry-scan CLI.
 */
export default async function main(
  args: readonly string[],
  {
    stdout = process.stdout,
    stderr = process.stderr,
  }: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream } = {}
): Promise<number> {
  let options: Options

  try {
    options = parseOptions(args)
  } catch (error) {
    stderr.write(`error: ${error.message}\n`)
    printHelp(stderr)
    return -1
  }

  if (options.help) {
    printHelp(stdout)
    return 0
  }

  // data
  const reinterpretResults = new MultiMap<
    [string, 'front' | 'back'],
    { original: PageScan; rescan: PageScan }
  >()
  let pageCount = 0

  // ui
  let fetchSpinner: Ora | undefined
  let configureSpinner: Spinner | undefined
  let interpretCounter: CountProvider | undefined
  let interpretSpinner: Spinner | undefined

  await retryScan(options, {
    configured: (options) => {
      stdout.write(
        `${chalk.bold('Input:')} ${options.inputWorkspace}\n${chalk.bold(
          'Output:'
        )} ${options.outputWorkspace}\n`
      )
    },

    sheetsLoading: () => {
      fetchSpinner = ora({
        text: 'Finding sheets matching filters',
        stream: stderr,
      }).start()
    },

    sheetsLoaded: (count, election) => {
      fetchSpinner!.text = `Found ${count} sheet(s) / ${count * 2} pages from ${
        election?.title
      } in ${election?.county.name} (${election?.date})`
      fetchSpinner!.succeed()
      fetchSpinner = undefined

      pageCount = count * 2
      interpretCounter = countProvider()
    },

    interpreterLoading: () => {
      configureSpinner = new Spinner(
        ora({ stream: stderr }).start(),
        'Creating interpreter',
        durationProvider({ prefix: ' (', suffix: ')' })
      )
    },

    interpreterLoaded: () => {
      configureSpinner?.succeed()
      configureSpinner = undefined

      interpretSpinner = new Spinner(
        ora({ stream: stderr }).start(),
        'Interpreted ',
        interpretCounter!,
        `/${pageCount}`,
        durationProvider({ prefix: ' (', suffix: ')' })
      )
    },

    pageInterpreted: (sheetId, side, original, rescan) => {
      interpretCounter?.increment()
      reinterpretResults.set([sheetId, side], { original, rescan })
    },

    interpreterUnloaded: () => {
      interpretSpinner?.succeed()
    },
  })

  const changedResults = [...reinterpretResults].filter(
    ([, [{ original, rescan }]]) =>
      !deepEqual(original.interpretation, rescan.interpretation)
  )

  if (changedResults.length === 0) {
    stdout.write('🏁 No pages differed from their original interpretation.\n')
  } else {
    stdout.write(
      `🏁 ${changedResults.length} page(s) differed from the original interpretation.\n\n`
    )
    for (const [[sheetId, side], [{ original, rescan }]] of changedResults) {
      stdout.write(
        `📑 ${chalk.bold(
          `${chalk.underline(original.interpretation.type)} → ${chalk.underline(
            rescan.interpretation.type
          )}`
        )}\n`
      )
      stdout.write(`    ${chalk.dim('Sheet ID:')} ${sheetId}\n`)
      stdout.write(`        ${chalk.dim('Side:')} ${side}\n`)
      stdout.write(`       ${chalk.dim('Image:')} ${rescan.originalFilename}\n`)
      stdout.write(
        `  ${chalk.dim('Normalized:')} ${rescan.normalizedFilename}\n`
      )

      const shouldDiff =
        options.diffWhen === DiffWhen.Always ||
        (options.diffWhen === DiffWhen.SameType &&
          original.interpretation.type === rescan.interpretation.type)
      if (shouldDiff) {
        stdout.write(
          `${diff(original.interpretation, rescan.interpretation, {
            aAnnotation: 'Original',
            aColor: chalk.red,
            bAnnotation: 'Re-scanned',
            bColor: chalk.green,
          })}\n`
        )
      }

      stdout.write('\n')
    }
  }

  return 0
}

/* istanbul ignore next */
if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error) => {
      console.error(error)
      return 1
    })
    .then((code) => {
      process.exitCode = code
    })
}
