import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { runBlankPaperDiagnostic } from './diagnostic';

function usage(out: NodeJS.WritableStream): void {
  out.write(`${chalk.bold('Usage:')} diagnostic [options] <image-path>\n`);
  out.write(`\n`);
  out.write(chalk.bold(`Options:\n`));
  out.write('  -h, --help       Show this help text.\n');
  out.write(
    `  -d, --debug  Output debug information (images alongside inputs).\n`
  );
}

/**
 * CLI for running the blank paper diagnostic against an image.
 */
export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  let imagePath: string | undefined;
  let debug = false;

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      usage(stdout);
      return 0;
    }

    if (arg === '-d' || arg === '--debug') {
      debug = true;
      continue;
    }

    if (arg.startsWith('-')) {
      stderr.write(`Unknown option: ${arg}\n`);
      usage(stderr);
      return 1;
    }

    if (!imagePath) {
      const stat = await fs.stat(arg);
      if (stat.isFile()) {
        imagePath = arg;
      } else {
        stderr.write(`Expected a path to an image: ${arg}\n`);
        usage(stderr);
        return 1;
      }
    }
  }

  if (imagePath) {
    const didPass = runBlankPaperDiagnostic(
      imagePath,
      debug ? imagePath : undefined
    );
    if (didPass) {
      stdout.write(chalk.green('PASSED'));
      stdout.write(' - no significant shading detected in image\n');
    } else {
      stdout.write(chalk.red('FAILED'));
      stdout.write(' - significant shading detected in image\n');
    }
    return 0;
  }

  usage(stderr);
  return 1;
}
