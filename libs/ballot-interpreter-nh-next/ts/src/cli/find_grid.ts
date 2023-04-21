import {
  assert,
  err,
  find,
  iter,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import tmp from 'tmp';
import { writeImageData } from '@votingworks/image-utils';
import {
  ElectionDefinition,
  mapSheet,
  safeParseElectionDefinition,
  safeParseJson,
  SheetOf,
} from '@votingworks/types';
import { jsonStream } from '@votingworks/utils';
import Sqlite3 from 'better-sqlite3';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { once } from 'stream';
import { findGrid } from '../find_grid';

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `${chalk.bold(
      'Usage:'
    )} interpret [options] <election-definition-path> <image-path> <image-path>\n`
  );
  out.write(
    `       interpret [options] <scan-workspace-path> [<sheet-id> …]\n`
  );
  out.write(`\n`);
  out.write(chalk.bold(`Options:\n`));
  out.write('  -h, --help   Show this help text.\n');
  out.write(`  -j, --json   Output JSON instead of human-readable text.\n`);
  out.write(
    `  -d, --debug  Output debug information (images alongside inputs).\n`
  );
  out.write(`\n`);
  out.write(chalk.bold('Examples:\n'));
  out.write(chalk.dim(`  # Interpret a single ballot\n`));
  out.write(
    `  interpret election.json ballot-side-a.jpeg ballot-side-b.jpeg\n`
  );
  out.write(`\n`);
  out.write(chalk.dim(`  # Interpret all ballots in a scan workspace\n`));
  out.write(`  interpret path/to/workspace\n`);
  out.write(`\n`);
  out.write(chalk.dim(`  # Interpret specific sheets in a scan workspace\n`));
  out.write(`  interpret path/to/workspace d34d-b33f\n`);
  out.write(`\n`);
  out.write(chalk.dim(`  # Write debug images alongside input images\n`));
  out.write(
    chalk.dim(`  # (i.e. ballot-side-a_debug_scored_oval_marks.png)\n`)
  );
  out.write(
    `  interpret -d election.json ballot-side-a.jpeg ballot-side-b.jpeg\n`
  );
}

/**
 * CLI for running the interpreter standalone.
 */
export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const ballotPaths: string[] = [];
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

    ballotPaths.push(arg);
  }

  for (const ballotPath of ballotPaths) {
    const { grid, normalizedImage } = findGrid(ballotPath, { debug });

    if (normalizedImage) {
      const debugPath = join(
        dirname(ballotPath),
        `${basename(ballotPath, '.png')}_debug.png`
      );
      await writeImageData(debugPath, normalizedImage);
    }

    console.log(grid);
  }

  return 0;
}
