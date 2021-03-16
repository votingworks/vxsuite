import { BallotType, getPrecinctById } from '@votingworks/types'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { ScannerImageFormat } from '../scanner'
import Store from '../store'

export function printHelp(out: typeof process.stdout): void {
  out.write(
    `${chalk.bold('render-pages')} SOURCE ${chalk.italic('[SOURCE …]')}\n`
  )
  out.write('\n')
  out.write(chalk.bold('Description\n'))
  out.write(chalk.italic('Render ballot pages from PDF or DB files.\n'))
  out.write('\n')
  out.write(chalk.bold('Example - Render a 3-page ballot from PDF\n'))
  out.write('$ render-pages ballot.pdf\n')
  out.write('📝 ballot-p1.png\n')
  out.write('📝 ballot-p2.png\n')
  out.write('📝 ballot-p3.png\n')
  out.write('\n')
  out.write(chalk.bold('Example - Render all ballots from a DB\n'))
  out.write('$ render-pages ballots.db\n')
  out.write('📝 ballots-4-Bywy-TEST-p1.png\n')
  out.write('📝 ballots-4-Bywy-TEST-p2.png\n')
  out.write('📝 ballots-5-District-5-TEST-p1.png\n')
  out.write('📝 ballots-5-District-5-TEST-p2.png\n')
}

export default async function main(
  args: readonly string[],
  { stdout = process.stdout, stderr = process.stderr } = {}
): Promise<number> {
  if (args.length === 0) {
    printHelp(stderr)
    return -1
  }

  let format = ScannerImageFormat.JPEG
  const paths: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '-h':
      case '--help':
        printHelp(stdout)
        return 0

      case '-f':
      case '--format': {
        const value = args[++i]
        if (/^png$/i.test(value)) {
          format = ScannerImageFormat.PNG
        } else if (/^jpe?g/i.test(value)) {
          format = ScannerImageFormat.JPEG
        }
        break
      }

      default:
        paths.push(arg)
    }
  }

  // Defer loading the heavy dependencies until we're sure we need them.
  const { default: pdfToImages } = await import('../util/pdfToImages')
  const { writeImageData } = await import('../util/images')

  async function* renderPages(
    pdf: Buffer,
    dir: string,
    base: string,
    ext: string
  ): AsyncGenerator<string> {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const path = join(dir, `${base}-p${pageNumber}${ext}`)
      await writeImageData(path, page)
      yield path
    }
  }

  for (const path of paths) {
    const dir = dirname(path)
    const ext = extname(path)
    const base = basename(path, ext)
    const queue: { pdf: Buffer; base: string }[] = []

    if (ext === '.pdf') {
      queue.push({ pdf: await fs.readFile(path), base })
    } else if (ext === '.db') {
      const store = await Store.fileStore(path)
      const electionDefinition = await store.getElectionDefinition()

      if (!electionDefinition) {
        stderr.write(`✘ ${path} has no election definition\n`)
        return 1
      }

      const { election } = electionDefinition

      for (const [pdf, layouts] of await store.getHmpbTemplates()) {
        const {
          ballotStyleId,
          precinctId,
          isTestMode,
          ballotType,
        } = layouts[0].ballotImage.metadata
        const precinct =
          getPrecinctById({ election, precinctId })?.name ?? precinctId
        queue.push({
          pdf,
          base: [
            base,
            ballotStyleId,
            precinct,
            isTestMode ? 'TEST' : 'LIVE',
            ballotType === BallotType.Absentee
              ? 'absentee'
              : ballotType === BallotType.Provisional
              ? 'provisional'
              : ballotType === BallotType.Standard
              ? ''
              : ((): never => {
                  /* istanbul ignore next */
                  throw new Error(`unknown ballot type: ${ballotType}`)
                })(),
          ]
            .join('-')
            .replace(/[^-\w\d]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/(^-+|-+$)/g, ''),
        })
      }
    } else {
      stderr.write(`✘ ${path} is not a known template container type\n`)
      return 1
    }

    for (const { pdf, base } of queue) {
      for await (const imagePath of renderPages(
        pdf,
        dir,
        base,
        format === ScannerImageFormat.JPEG ? '.jpg' : '.png'
      )) {
        stdout.write(`📝 ${imagePath}\n`)
      }
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
