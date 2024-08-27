import { err, ok, Optional, Result } from '@votingworks/basics';
import { safeParse } from '@votingworks/types';
import { promises as fs } from 'fs';
import { isAbsolute, join } from 'path';
import { parseJsonc } from '..';
import {
  ConvertConfig,
  ConvertConfigCard,
  ConvertConfigSchema,
} from '../../convert/types';

/**
 * Options for the `convert` command's default behavior.
 */
export interface ConvertOptions {
  readonly type: 'convert';
  readonly config: ConvertConfig;
}

/**
 * Options for the `help` subcommand.
 */
export interface HelpOptions {
  readonly type: 'help';
}

/**
 * Options for the `convert` command.
 */
export type Options = ConvertOptions | HelpOptions;

/**
 * Parses command-line options for the `convert` command.
 */
export async function parseOptions(
  args: readonly string[]
): Promise<Result<Options, Error>> {
  let configPath: Optional<string>;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-c':
      case '--config': {
        const nextArg = args[i + 1];
        if (nextArg === undefined) {
          return err(new Error('missing path to config file'));
        }
        configPath = nextArg;
        i += 1;
        break;
      }

      case '-h':
      case '--help':
        return ok({ type: 'help' });

      default: {
        return err(new Error(`unknown option: ${arg}`));
      }
    }
  }

  if (!configPath) {
    return err(new Error('missing required config file (--config <file>)'));
  }

  const configText = await fs.readFile(configPath, 'utf8');
  const parseJsonResult = parseJsonc(configText);
  if (parseJsonResult.isErr()) {
    return err(new Error(`error parsing config file: invalid JSON`));
  }

  const configResult = safeParse(ConvertConfigSchema, parseJsonResult.ok());
  if (configResult.isErr()) {
    return err(
      new Error(`error parsing config file: ${configResult.err().message}`)
    );
  }
  const config = configResult.ok();
  const configDir = join(configPath, '..');

  function locatePathRelativeToConfigPath(path: string): string {
    if (isAbsolute(path)) {
      return path;
    }

    return join(configDir, path);
  }

  return ok({
    type: 'convert',
    config: {
      ...config,
      jurisdictions: config.jurisdictions.map((jurisdiction) => ({
        ...jurisdiction,
        cards: jurisdiction.cards.map((card) => ({
          ...card,
          definition: locatePathRelativeToConfigPath(card.definition),
          ballot: locatePathRelativeToConfigPath(card.ballot),
        })) as [ConvertConfigCard, ...ConvertConfigCard[]],
        output: locatePathRelativeToConfigPath(jurisdiction.output),
      })),
    },
  });
}
