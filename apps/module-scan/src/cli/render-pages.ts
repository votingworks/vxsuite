import { promises as fs } from 'fs'
import type { Channels } from 'sharp'
import { join, dirname, extname, basename } from 'path'
import chalk from 'chalk'

function printHelp(out = process.stdout): void {
  out.write(`${chalk.bold('render-pages')} PDF ${chalk.italic('[PDF …]')}\n`)
  out.write('\n')
  out.write(chalk.bold('Description\n'))
  out.write(chalk.italic('Render pages of PDFs alongside them.\n'))
  out.write('\n')
  out.write(chalk.bold('Example - Render a 3-page ballot\n'))
  out.write('$ render-pages ballot.pdf\n')
  out.write('📝 ballot-p1.png\n')
  out.write('📝 ballot-p2.png\n')
  out.write('📝 ballot-p3.png\n')
}

async function main(args: readonly string[]): Promise<number> {
  if (args.length === 0) {
    printHelp(process.stderr)
    return -1
  }

  const pdfPaths: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '-h':
      case '--help':
        printHelp()
        return 0

      default:
        pdfPaths.push(arg)
    }
  }

  // Defer loading the heavy dependencies until we're sure we need them.
  const { default: pdfToImages } = await import('../util/pdfToImages')
  const { default: sharp } = await import('sharp')

  for (const pdfPath of pdfPaths) {
    const pdfDir = dirname(pdfPath)
    const pdfExt = extname(pdfPath)
    const pdfBase = basename(pdfPath, pdfExt)
    const pdf = await fs.readFile(pdfPath)

    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const pngPath = join(pdfDir, `${pdfBase}-p${pageNumber}.png`)
      process.stdout.write(`📝 ${pngPath}\n`)
      await sharp(Buffer.from(page.data), {
        raw: {
          channels: (page.data.length / page.width / page.height) as Channels,
          width: page.width,
          height: page.height,
        },
      })
        .png()
        .toFile(pngPath)
    }
  }

  return 0
}

main(process.argv.slice(2))
  .catch((error) => {
    console.error(error)
    return 1
  })
  .then((code) => {
    process.exitCode = code
  })
