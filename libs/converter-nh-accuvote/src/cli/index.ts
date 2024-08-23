import { Result, err, ok } from '@votingworks/basics';
import chalk from 'chalk';
import * as jsoncParser from 'jsonc-parser';
import { relative } from 'path';

/**
 * Represents IO for a CLI. Facilitates mocking for testing.
 */
export interface Stdio {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/**
 * The default IO implementation.
 */
export const RealIo: Stdio = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
};

/**
 * Colorizes a string for display in the CLI.
 */
export function string(text: string): string {
  return chalk.green(`"${text}"`);
}

/**
 * Colorizes a number for display in the CLI.
 */
export function number(value: number): string {
  return chalk.yellow(`${value}`);
}

/**
 * Colorizes a comment for display in the CLI.
 */
export function comment(text: string): string {
  return chalk.dim(text);
}

/**
 * Strips ANSI escape codes from a string.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[\d+m/g, '');
}

/**
 * Wraps a line of text to a maximum number of columns, yielding each line.
 */
export function* softWrap(columns: number, line: string): Generator<string> {
  if (/^\s*$/.test(line)) {
    yield line;
    return;
  }

  const wordRegex = /\S+/g;
  const limit = 80;

  let lineNumber = 0;
  let offset = 0;
  let next = '';
  let nextLength = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = wordRegex.exec(line))) {
    const spaces = line.slice(offset, match.index);
    const spacesLength = stripAnsi(spaces).length;

    offset = match.index + match[0].length;
    const word = line.slice(match.index, offset);
    const wordLength = stripAnsi(word).length;

    if (nextLength + spacesLength + wordLength > limit) {
      yield next;
      next = '';
      nextLength = 0;
      lineNumber += 1;
    }

    if (next || lineNumber === 0) {
      next += spaces + word;
      nextLength += spacesLength + wordLength;
    } else {
      next = word;
      nextLength = wordLength;
    }
  }

  if (next) {
    yield next;
  }
}

/**
 * Returns a function that wraps a line of text to a maximum number of columns, yielding each line.
 */
export function softWrapper(
  columns: number
): (line: string) => Iterable<string> {
  return (line: string) => softWrap(columns, line);
}

/**
 * Parses a JSONC string into a JavaScript object, typically from a
 * configuration file.
 */
export function parseJsonc(
  text: string
): Result<unknown, { errors: jsoncParser.ParseError[]; parsed: unknown }> {
  const errors: jsoncParser.ParseError[] = [];
  const parsed = jsoncParser.parse(text, errors, {
    allowEmptyContent: false,
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    return err({ errors, parsed });
  }
  return ok(parsed);
}

function maybeRelativizePathForDisplay(
  path: string,
  base = process.cwd()
): string {
  const relativeVersion = relative(base, path);
  return relativeVersion.length < path.length ? relativeVersion : path;
}

/**
 * Logs a message that a file is being written.
 */
export function logWritePath(io: Stdio, path: string): void {
  io.stderr.write(`📝 ${maybeRelativizePathForDisplay(path)}\n`);
}
