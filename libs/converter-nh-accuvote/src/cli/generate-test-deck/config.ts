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
 * Parse the command line options for the `generate-test-deck` command.
 */
export async function readConfigForCommandLineArgs(
  args: readonly string[]
): Promise<
  Result<{ config: GenerateTestDeckConfig; configPath: string }, Error>
> {
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    switch (args[i]) {
      case '-c':
      case '--config':
        configPath = args[i + 1];
        i += 1;
        break;

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
  const parseJsonResult = parseJsonc(await readFile(manifestPath, 'utf8'));

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
