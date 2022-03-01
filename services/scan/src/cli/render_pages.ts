import chalk from 'chalk';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { ScannerImageFormat } from '../scanners';

export function printHelp(out: typeof process.stdout): void {
  out.write(
    `${chalk.bold('render-pages')} SOURCE ${chalk.italic('[SOURCE …]')}\n`
  );
  out.write('\n');
  out.write(chalk.bold('Description\n'));
  out.write(chalk.italic('Render ballot pages from PDF or DB files.\n'));
  out.write('\n');
  out.write(chalk.bold('Example - Render a 3-page ballot from PDF\n'));
  out.write('$ render-pages ballot.pdf\n');
  out.write('📝 ballot-p1.png\n');
  out.write('📝 ballot-p2.png\n');
  out.write('📝 ballot-p3.png\n');
  out.write('\n');
  out.write(chalk.bold('Example - Render all ballots from a DB\n'));
  out.write('$ render-pages ballots.db\n');
  out.write('📝 ballots-4-Bywy-TEST-p1.png\n');
  out.write('📝 ballots-4-Bywy-TEST-p2.png\n');
  out.write('📝 ballots-5-District-5-TEST-p1.png\n');
  out.write('📝 ballots-5-District-5-TEST-p2.png\n');
}

export async function main(
  args: readonly string[],
  { stdout = process.stdout, stderr = process.stderr } = {}
): Promise<number> {
  if (args.length === 0) {
    printHelp(stderr);
    return -1;
  }

  let format = ScannerImageFormat.JPEG;
  const paths: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        printHelp(stdout);
        return 0;

      case '-f':
      case '--format': {
        i += 1;
        const value = args[i];
        if (/^png$/i.test(value)) {
          format = ScannerImageFormat.PNG;
        } else if (/^jpe?g/i.test(value)) {
          format = ScannerImageFormat.JPEG;
        }
        break;
      }

      default:
        paths.push(arg);
    }
  }

  // Defer loading the heavy dependencies until we're sure we need them.
  const { pdfToImages } = await import('../util/pdf_to_images');
  const { writeImageData } = await import('../util/images');

  async function* renderPages(
    pdf: Buffer,
    dir: string,
    base: string,
    ext: string
  ): AsyncGenerator<string> {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const path = join(dir, `${base}-p${pageNumber}${ext}`);
      await writeImageData(path, page);
      yield path;
    }
  }

  for (const path of paths) {
    const dir = dirname(path);
    const ext = extname(path);
    const base = basename(path, ext);
    const pdf = await fs.readFile(path);

    for await (const imagePath of renderPages(
      pdf,
      dir,
      base,
      format === ScannerImageFormat.JPEG ? '.jpg' : '.png'
    )) {
      stdout.write(`📝 ${imagePath}\n`);
    }
  }

  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2))
    .catch((error) => {
      process.stderr.write(`CRASH: ${error}\n`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
