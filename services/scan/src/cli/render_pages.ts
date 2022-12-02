import { writeImageData } from '@votingworks/ballot-interpreter-vx';
import { pdfToImages } from '@votingworks/image-utils';
import {
  BallotType,
  getPrecinctById,
  safeParseNumber,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import { Buffer } from 'buffer';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { ScannerImageFormat } from '../fujitsu_scanner';
import { Store } from '../store';

const DEFAULT_SCALE = 2;
const DEFAULT_IMAGE_FORMAT = ScannerImageFormat.JPEG;

export function printHelp(out: NodeJS.WritableStream): void {
  out.write(
    `${chalk.bold('render-pages')} [options] SOURCE ${chalk.italic(
      '[SOURCE …]'
    )}\n`
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
  out.write('\n');
  out.write(chalk.bold('Options\n'));
  out.write('  --help, -h\n');
  out.write('    Show this help message and exit.\n');
  out.write('  --format, -f\n');
  out.write(
    `    Output format. One of "${ScannerImageFormat.PNG}" or "${ScannerImageFormat.JPEG}" (default: "${DEFAULT_IMAGE_FORMAT}").\n`
  );
  out.write('  --scale, -s\n');
  out.write(
    `    Scale factor for output images (default: ${DEFAULT_SCALE}, or ${
      72 * DEFAULT_SCALE
    }ppi).\n`
  );
}

export async function main(
  args: readonly string[],
  {
    stdout = process.stdout,
    stderr = process.stderr,
  }: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream } = {}
): Promise<number> {
  if (args.length === 0) {
    printHelp(stderr);
    return -1;
  }

  let scale = DEFAULT_SCALE;
  let format = DEFAULT_IMAGE_FORMAT;
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
        } else {
          stderr.write(`error: invalid value "${value}" for option "${arg}"`);
          return -1;
        }
        break;
      }

      case '-s':
      case '--scale': {
        i += 1;
        const value = args[i];
        const parseScaleResult = safeParseNumber(value, { min: 0 });
        if (parseScaleResult.isOk()) {
          scale = parseScaleResult.ok();
        } else {
          stderr.write(
            `${chalk.red('error:')} invalid scale: ${chalk.yellow(value)}\n`
          );
          return -1;
        }
        break;
      }

      default:
        paths.push(arg);
    }
  }

  async function* renderPages(
    pdf: Buffer,
    dir: string,
    base: string,
    ext: string
  ): AsyncGenerator<string> {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale })) {
      const path = join(dir, `${base}-p${pageNumber}${ext}`);
      await writeImageData(path, page);
      yield path;
    }
  }

  for (const path of paths) {
    const dir = dirname(path);
    const ext = extname(path);
    const base = basename(path, ext);
    const queue: Array<{ pdf: Buffer; base: string }> = [];

    if (ext === '.pdf') {
      queue.push({ pdf: await fs.readFile(path), base });
    } else if (ext === '.db') {
      const store = await Store.fileStore(path);
      const electionDefinition = store.getElectionDefinition();

      if (!electionDefinition) {
        stderr.write(`✘ ${path} has no election definition\n`);
        return 1;
      }

      const { election } = electionDefinition;

      for (const [pdf, layouts] of store.getHmpbTemplates()) {
        const { ballotStyleId, precinctId, isTestMode, ballotType } =
          layouts[0].metadata;
        const precinct =
          getPrecinctById({ election, precinctId })?.name ?? precinctId;
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
              : /* istanbul ignore next - compile time check for completeness */
                throwIllegalValue(ballotType),
          ]
            .join('-')
            .replace(/[^-\w\d]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/(^-+|-+$)/g, ''),
        });
      }
    } else {
      stderr.write(`✘ ${path} is not a known template container type\n`);
      return 1;
    }

    for (const entry of queue) {
      for await (const imagePath of renderPages(
        entry.pdf,
        dir,
        entry.base,
        format === ScannerImageFormat.JPEG ? '.jpg' : '.png'
      )) {
        stdout.write(`📝 ${imagePath}\n`);
      }
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
