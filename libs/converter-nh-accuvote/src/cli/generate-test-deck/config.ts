import { Result, err, ok } from '@votingworks/basics';
import { safeParse } from '@votingworks/types';
import { readFile } from 'fs/promises';
import { parseJsonc } from '..';
import {
  ConvertOutputManifest,
  ConvertOutputManifestSchema,
  GenerateTestDeckConfig,
  GenerateTestDeckConfigSchema,
} from '../../convert/types';

/**
 * Options for the `generate-test-deck` command.
 */
export interface GenerateTestDeckOptions {
  type: 'generate-test-deck';
  config: GenerateTestDeckConfig;
  configPath: string;
}

/**
 * Options for the `help` subcommand.
 */
export interface HelpOptions {
  type: 'help';
}

/**
 * Options for the `generate-test-deck` command.
 */
export type Options = GenerateTestDeckOptions | HelpOptions;

/**
 * Parse the command line options for the `generate-test-deck` command.
 */
export async function parseOptions(
  args: readonly string[]
): Promise<Result<Options, Error>> {
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    switch (args[i]) {
      case '-c':
      case '--config':
        configPath = args[i + 1];
        i += 1;
        break;

      case '-h':
      case '--help':
        return ok({ type: 'help' });

      default:
        return err(new Error(`Unexpected argument: ${args[i]}`));
    }
  }

  if (!configPath) {
    return err(new Error('Missing required argument: --config'));
  }

  const parseJsonResult = parseJsonc(await readFile(configPath, 'utf8'));

  if (parseJsonResult.isErr()) {
    return err(new Error(`Invalid JSON in config file: ${configPath}`));
  }

  const parseConfigResult = safeParse(
    GenerateTestDeckConfigSchema,
    parseJsonResult.ok()
  );

  if (parseConfigResult.isErr()) {
    return err(new Error(parseConfigResult.err().message));
  }

  return ok({
    type: 'generate-test-deck',
    config: parseConfigResult.ok(),
    configPath,
  });
}

/**
 * Parse a manifest file from the `convert` command.
 */
export async function readConvertManifest(
  manifestPath: string
): Promise<Result<ConvertOutputManifest, Error>> {
  let fileContents: string;

  try {
    fileContents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    return err(error as Error);
  }

  const parseJsonResult = parseJsonc(fileContents);

  if (parseJsonResult.isErr()) {
    return err(new Error(`Invalid JSON in manifest: ${manifestPath}`));
  }

  const parseManifestResult = safeParse(
    ConvertOutputManifestSchema,
    parseJsonResult.ok()
  );

  if (parseManifestResult.isErr()) {
    return err(new Error(parseManifestResult.err().message));
  }

  return parseManifestResult;
}
