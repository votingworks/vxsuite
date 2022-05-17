import { readFile } from 'fs/promises';
import { basename } from 'path';
import { buildSchema } from '.';

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
 * All possible options for the CLI.
 */
export type Options = HelpOptions | BuildOptions;

/**
 * Options for the CLI when run with `--help`.
 */
export interface HelpOptions {
  readonly type: 'help';
}

/**
 * Options for the CLI's default mode.
 */
export interface BuildOptions {
  readonly type: 'build';
  readonly xsdSchemaFilePath: string;
  readonly jsonSchemaFilePath: string;
}

/**
 * Result of parsing command-line arguments.
 */
type OptionParseResult = Options | OptionParseError;

/**
 * Errors returned by {@link parseOptions}.
 */
interface OptionParseError {
  type: 'error';
  error: Error;
}

/**
 * Prints command usage to {@link out}.
 */
function usage(programName: string, out: NodeJS.WritableStream) {
  out.write(`Usage: ${programName} <schema.xml> <schema.json>\n`);
}

/**
 * Parse command-line arguments into {@link Options}.
 */
export function parseOptions(args: readonly string[]): OptionParseResult {
  let xsdSchemaFilePath: string | undefined;
  let jsonSchemaFilePath: string | undefined;

  for (let i = 2; i < args.length; i += 1) {
    const arg = args[i] as string;
    switch (arg) {
      case '-h':
      case '--help':
        return { type: 'help' };

      default: {
        if (arg.startsWith('-')) {
          return {
            type: 'error',
            error: new Error(`unknown option: ${arg}\n`),
          };
        }
        if (arg.endsWith('.xsd') || arg.endsWith('.xml')) {
          xsdSchemaFilePath = arg;
        } else if (arg.endsWith('.json')) {
          jsonSchemaFilePath = arg;
        } else {
          return {
            type: 'error',
            error: new Error(`unknown file extension: ${arg}\n`),
          };
        }
      }
    }
  }

  if (!xsdSchemaFilePath || !jsonSchemaFilePath) {
    return {
      type: 'error',
      error: new Error('missing XSD or JSON schema file path\n'),
    };
  }

  return {
    type: 'build',
    xsdSchemaFilePath,
    jsonSchemaFilePath,
  };
}

/**
 * Main entry point for `cdf-schema-builder` command.
 */
export async function main(
  args: readonly string[],
  io: Stdio
): Promise<number> {
  const programName = basename(args[1] as string);
  const parseOptionsResult = parseOptions(args);

  if (parseOptionsResult.type === 'error') {
    io.stderr.write(`error: ${parseOptionsResult.error.message}\n`);
    usage(programName, io.stderr);
    return 1;
  }

  const options = parseOptionsResult;

  if (options.type === 'help') {
    usage(programName, io.stdout);
    return 0;
  }

  const { xsdSchemaFilePath, jsonSchemaFilePath } = options;
  const xsdSchemaFileContents = await readFile(xsdSchemaFilePath, 'utf-8');
  const jsonSchemaFileContents = await readFile(jsonSchemaFilePath, 'utf-8');
  buildSchema(xsdSchemaFileContents, jsonSchemaFileContents, io.stdout);
  return 0;
}
