import { err, ok, Result } from '@votingworks/types';
import { promises as fs } from 'fs';
import {
  convertElectionDefinition,
  NewHampshireBallotCardDefinition,
} from '../../convert';
import { getBallotTemplateOvalImage } from '../../accuvote';
import { readGrayscaleImage } from '../../images';
import { parseXml } from '../../utils';
import { RealIo, Stdio } from '..';

interface ConvertOptions {
  readonly type: 'convert';
  readonly definitionPath: string;
  readonly frontBallotPath: string;
  readonly backBallotPath: string;
  readonly outputPath: string;
}

interface HelpOptions {
  readonly type: 'help';
}

type Options = ConvertOptions | HelpOptions;

function parseOptions(args: readonly string[]): Result<Options, Error> {
  let definitionPath: string | undefined;
  let frontBallotPath: string | undefined;
  let backBallotPath: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-o':
      case '--output': {
        const nextArg = args[i + 1];
        if (nextArg === undefined) {
          return err(new Error(`missing output path after ${arg}`));
        }
        outputPath = nextArg;
        i += 1;
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

  if (!outputPath) {
    return err(new Error('missing output path'));
  }

  return ok({
    type: 'convert',
    definitionPath,
    frontBallotPath,
    backBallotPath,
    outputPath,
  });
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `usage: convert <definition.xml> <front-ballot.jpg> <back-ballot.jpg> -o <output.json>\n`
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

  const { definitionPath, frontBallotPath, backBallotPath, outputPath } =
    options;

  const definitionContent = await fs.readFile(definitionPath, 'utf8');
  const frontBallotImage = await readGrayscaleImage(frontBallotPath);
  const backBallotImage = await readGrayscaleImage(backBallotPath);

  const cardDefinition: NewHampshireBallotCardDefinition = {
    definition: parseXml(definitionContent),
    front: frontBallotImage,
    back: backBallotImage,
  };

  const ovalTemplate = await getBallotTemplateOvalImage();
  const convertResult = convertElectionDefinition(cardDefinition, {
    ovalTemplate,
  });

  if (convertResult.isErr()) {
    io.stderr.write(`error: ${convertResult.err().message}\n`);
    return 1;
  }

  const output = JSON.stringify(convertResult.ok(), null, 2);
  if (outputPath === '-') {
    io.stdout.write(output);
  } else {
    await fs.writeFile(outputPath, output);
  }

  return 0;
}
