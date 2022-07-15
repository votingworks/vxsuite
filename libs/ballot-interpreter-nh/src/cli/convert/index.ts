import { loadImage, toImageData } from '@votingworks/image-utils';
import { err, ok, Result } from '@votingworks/types';
import { DOMParser } from '@xmldom/xmldom';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { basename } from 'path';
import { RealIo, Stdio } from '..';
import {
  convertElectionDefinition,
  NewHampshireBallotCardDefinition,
} from '../../convert';
import * as templates from '../../data/templates';
import { imageDebugger } from '../../debug';

interface ConvertOptions {
  readonly type: 'convert';
  readonly definitionPath: string;
  readonly frontBallotPath: string;
  readonly backBallotPath: string;
  readonly outputPath?: string;
  readonly debug: boolean;
}

interface HelpOptions {
  readonly type: 'help';
}

type Options = ConvertOptions | HelpOptions;

/**
 * Parses {@link xml} and returns the root element.
 */
function parseXml(xml: string): Element {
  return new DOMParser().parseFromString(xml, 'application/xml')
    .documentElement;
}

function parseOptions(args: readonly string[]): Result<Options, Error> {
  let definitionPath: string | undefined;
  let frontBallotPath: string | undefined;
  let backBallotPath: string | undefined;
  let outputPath: string | undefined;
  let debug = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-o':
      case '--output': {
        const nextArg = args[i + 1];
        if (nextArg === undefined) {
          return err(new Error(`missing output path after ${arg}`));
        }
        // '-' is a special case for stdout, which is the default
        if (nextArg !== '-') {
          outputPath = nextArg;
        }
        i += 1;
        break;
      }

      case '--debug': {
        debug = true;
        break;
      }

      case '-h':
      case '--help':
        return ok({ type: 'help' });

      default: {
        if (arg?.startsWith('-')) {
          return err(new Error(`unknown option: ${arg}`));
        }

        if (arg?.endsWith('.xml')) {
          definitionPath = arg;
        } else if (arg?.endsWith('.jpeg') || arg?.endsWith('.jpg')) {
          if (frontBallotPath) {
            backBallotPath = arg;
          } else {
            frontBallotPath = arg;
          }
        } else {
          return err(new Error(`unexpected argument: ${arg}`));
        }
      }
    }
  }

  if (!definitionPath) {
    return err(new Error('missing definition path'));
  }

  if (!frontBallotPath) {
    return err(new Error('missing front ballot path'));
  }

  if (!backBallotPath) {
    return err(new Error('missing back ballot path'));
  }

  return ok({
    type: 'convert',
    definitionPath,
    frontBallotPath,
    backBallotPath,
    outputPath,
    debug,
  });
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `usage: convert <definition.xml> <front-ballot.jpg> <back-ballot.jpg> [-o <output.json>] [--debug]\n`
  );
}

/**
 * Converts New Hampshire (NH) ballot data to the VotingWorks format.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const parseResult = parseOptions(args);

  if (parseResult.isErr()) {
    io.stderr.write(`error: ${parseResult.err().message}\n`);
    return 1;
  }

  const options = parseResult.ok();

  if (options.type === 'help') {
    usage(io.stdout);
    return 0;
  }

  if (options.debug) {
    enableDebug('ballot-interpreter-nh:*');
  }

  const { definitionPath, frontBallotPath, backBallotPath, outputPath } =
    options;

  const definitionContent = await fs.readFile(definitionPath, 'utf8');
  const frontBallotImage = toImageData(await loadImage(frontBallotPath));
  const backBallotImage = toImageData(await loadImage(backBallotPath));

  const cardDefinition: NewHampshireBallotCardDefinition = {
    definition: parseXml(definitionContent),
    front: frontBallotImage,
    back: backBallotImage,
  };

  const convertResult = convertElectionDefinition(cardDefinition, {
    ovalTemplate: await templates.getOvalTemplate(),
    debug: imageDebugger(
      outputPath ??
        `convert-front=${basename(frontBallotPath)}-back=${basename(
          backBallotPath
        )}`,
      { width: frontBallotImage.width, height: frontBallotImage.height }
    ),
  });

  if (convertResult.issues.length > 0) {
    io.stderr.write(convertResult.success ? 'warning: ' : 'error: ');
    io.stderr.write(`conversion completed with issues:\n`);
    for (const issue of convertResult.issues) {
      io.stderr.write(`- ${issue.message}\n`);
    }
  }

  if (convertResult.election) {
    const output = JSON.stringify(convertResult.election, null, 2);
    if (!outputPath) {
      io.stdout.write(output);
    } else {
      await fs.writeFile(outputPath, output);
    }
  }

  return convertResult.success ? 0 : 1;
}
