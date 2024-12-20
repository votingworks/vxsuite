/* eslint-disable no-console */
import chalk from 'chalk';
import { MaybePromise, Optional, assert, iter } from '@votingworks/basics';

const capturedCallCountsByTest = new Map<
  string,
  Map<'log' | 'warn' | 'error', { count: number }>
>();

/**
 * Strips ANSI escape codes from a string. When printing a box around a string
 * with ANSI escape codes, the box will be the wrong size. This function removes
 * the ANSI escape codes so that the box is the correct size.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function printLinesInBox(lines: string[], out: NodeJS.WritableStream) {
  const boxTopLeft = '┌';
  const boxTopRight = '┐';
  const boxTopAndBottom = '─';
  const boxLeft = '│';
  const boxRight = '│';
  const boxBottomLeft = '└';
  const boxBottomRight = '┘';

  const longestLine =
    iter(lines)
      .map((line) => stripAnsi(line).length)
      .max() ?? 0;

  const boxTop = `${boxTopLeft}${boxTopAndBottom.repeat(
    longestLine + 2
  )}${boxTopRight}`;
  const boxBottom = `${boxBottomLeft}${boxTopAndBottom.repeat(
    longestLine + 2
  )}${boxBottomRight}`;

  out.write(chalk.dim(`${boxTop}\n`));
  for (const line of lines) {
    out.write(
      chalk.dim(
        `${boxLeft} ${line}${' '.repeat(
          longestLine - stripAnsi(line).length
        )} ${boxRight}\n`
      )
    );
  }
  out.write(chalk.dim(`${boxBottom}\n`));
}

if (typeof beforeAll === 'function' && typeof afterAll === 'function') {
  beforeAll(() => {
    capturedCallCountsByTest.clear();
  });

  afterAll(() => {
    const shouldPrintSummary = process.env['CI'] !== 'true';

    if (!shouldPrintSummary) {
      return;
    }

    const allSummaries = Array.from(capturedCallCountsByTest).flatMap(
      ([testName, capturedCallCounts]) => {
        const summaries = Array.from(capturedCallCounts.entries())
          .filter(([, { count }]) => count > 0)
          .map(
            ([name, { count }]) => `${count} ${name}${count > 1 ? 's' : ''}`
          );

        return summaries.length > 0
          ? [`${testName} (${summaries.join(', ')})`]
          : [];
      }
    );

    if (allSummaries.length > 0) {
      printLinesInBox(
        [
          '🤫 Some tests suppressed console output:',
          '',
          ...allSummaries,
          '',
          `Run with ${chalk.italic(
            'SUPPRESS_CONSOLE_OUTPUT=false'
          )} to see the output.`,
        ],
        process.stderr
      );
      process.stderr.write('\n');
    }
  });
}

/**
 * Suppresses console output during the execution of a function. Resolves to the
 * return value of the function.
 */
export function suppressingConsoleOutput<T>(fn: () => Promise<T>): Promise<T>;

/**
 * Suppresses console output during the execution of a function. Returns the
 * return value of the function.
 */
export function suppressingConsoleOutput<T>(fn: () => T): T;

export function suppressingConsoleOutput<T>(
  fn: () => MaybePromise<T>
): MaybePromise<T> {
  if (process.env['SUPPRESS_CONSOLE_OUTPUT'] === 'false') {
    return fn();
  }

  const currentTestName =
    typeof expect === 'undefined' ? 'test' : expect.getState().currentTestName;
  assert(currentTestName !== undefined);
  const capturedCallCounts =
    capturedCallCountsByTest.get(currentTestName) ??
    new Map([
      ['log', { count: 0 }],
      ['warn', { count: 0 }],
      ['error', { count: 0 }],
    ]);
  capturedCallCountsByTest.set(currentTestName, capturedCallCounts);
  const logStats = capturedCallCounts.get('log') as { count: number };
  const warnStats = capturedCallCounts.get('warn') as { count: number };
  const errorStats = capturedCallCounts.get('error') as { count: number };

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  Object.assign(console, {
    log: () => {
      logStats.count += 1;
    },
    warn: () => {
      warnStats.count += 1;
    },
    error: () => {
      errorStats.count += 1;
    },
  });

  function cleanup() {
    Object.assign(console, {
      log: originalLog,
      warn: originalWarn,
      error: originalError,
    });
  }

  let value: Optional<MaybePromise<T>>;
  let error: unknown;
  let success = false;

  try {
    value = fn();
    success = true;
  } catch (e) {
    error = e;
  }

  if (!success) {
    cleanup();
    throw error;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<T>).then === 'function'
  ) {
    return (value as Promise<T>).then(
      (v) => {
        cleanup();
        return v;
      },
      (e) => {
        cleanup();
        throw e;
      }
    );
  }

  cleanup();
  return value as T;
}
