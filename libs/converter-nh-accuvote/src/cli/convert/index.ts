import { loadImageData } from '@votingworks/image-utils';
import { assertDefined, err, iter, ok, Result } from '@votingworks/basics';
import { DOMParser } from '@xmldom/xmldom';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { Election } from '@votingworks/types';
import { RealIo, Stdio } from '..';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { NewHampshireBallotCardDefinition } from '../../convert/types';

interface ConvertOptions {
  readonly type: 'convert';
  readonly cardDefinitionPaths: Array<{
    readonly definitionPath: string;
    readonly frontBallotPath: string;
    readonly backBallotPath: string;
  }>;
  readonly outputPath?: string;
  readonly metadataEncoding: Election['ballotLayout']['metadataEncoding'];
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
  const definitionPaths = [];
  const ballotPaths = [];
  let outputPath: string | undefined;
  let metadataEncoding:
    | Election['ballotLayout']['metadataEncoding']
    | undefined;
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

      case '-e':
      case '--encoding': {
        const nextArg = args[i + 1];
        if (nextArg === undefined) {
          return err(new Error(`missing encoding after ${arg}`));
        }
        i += 1;
        if (!(nextArg === 'qr-code' || nextArg === 'timing-marks')) {
          return err(new Error(`unknown encoding: ${nextArg}`));
        }
        metadataEncoding = nextArg;
        break;
      }

      default: {
        if (arg?.startsWith('-')) {
          return err(new Error(`unknown option: ${arg}`));
        }

        if (arg?.endsWith('.xml')) {
          definitionPaths.push(arg);
        } else if (arg?.endsWith('.jpeg') || arg?.endsWith('.jpg')) {
          ballotPaths.push(arg);
        } else {
          return err(new Error(`unexpected argument: ${arg}`));
        }
      }
    }
  }

  if (definitionPaths.length === 0) {
    return err(new Error('missing definition path'));
  }

  if (ballotPaths.length < 2) {
    return err(new Error('missing ballot image paths'));
  }

  if (ballotPaths.length / definitionPaths.length !== 2) {
    return err(
      new Error('there must be two ballot images for each XML definition')
    );
  }

  if (!metadataEncoding) {
    return err(new Error('missing metadata encoding (-e)'));
  }

  return ok({
    type: 'convert',
    cardDefinitionPaths: iter(ballotPaths)
      .chunks(2)
      .zip(definitionPaths)
      .map(([[frontBallotPath, backBallotPath], definitionPath]) => ({
        definitionPath,
        frontBallotPath,
        backBallotPath: assertDefined(backBallotPath),
      }))
      .toArray(),
    outputPath,
    metadataEncoding,
    debug,
  });
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `Usage:
  General Election:
    convert <definition.xml> <front-ballot.jpg> <back-ballot.jpg>
      -e qr-code|timing-marks
      [-o <output.json>] [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-front-ballot.jpg> <party1-back-ballot.jpg>
      <party2-definition.xml> <party2-front-ballot.jpg> <party2-back-ballot.jpg> [... more parties ...]
      -e qr-code|timing-marks
      [-o <output.json>] [--debug]\n`
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
    io.stderr.write(`Error: ${parseResult.err().message}\n`);
    usage(io.stderr);
    return 1;
  }

  const options = parseResult.ok();

  if (options.type === 'help') {
    usage(io.stdout);
    return 0;
  }

  if (options.debug) {
    enableDebug('converter-nh-accuvote:*');
  }

  const { cardDefinitionPaths, outputPath, metadataEncoding } = options;

  const cardDefinitions = await Promise.all(
    cardDefinitionPaths.map(
      async (cardDefinitionPath): Promise<NewHampshireBallotCardDefinition> => {
        const definitionContent = await fs.readFile(
          cardDefinitionPath.definitionPath,
          'utf8'
        );
        const frontBallotImage = await loadImageData(
          cardDefinitionPath.frontBallotPath
        );
        const backBallotImage = await loadImageData(
          cardDefinitionPath.backBallotPath
        );
        return {
          definition: parseXml(definitionContent),
          front: frontBallotImage,
          back: backBallotImage,
        };
      }
    )
  );

  const convertResult = convertElectionDefinition(
    cardDefinitions,
    metadataEncoding
  );

  const { issues = [] } = convertResult.isOk()
    ? convertResult.ok()
    : convertResult.err();

  if (issues.length > 0) {
    io.stderr.write(convertResult.isOk() ? 'warning: ' : 'error: ');
    io.stderr.write(`conversion completed with issues:\n`);
    for (const issue of issues) {
      io.stderr.write(`- ${issue.message}\n`);
    }
  }

  if (convertResult.isOk()) {
    const { election } = convertResult.ok();
    if (election) {
      const output = JSON.stringify(election, null, 2);
      if (!outputPath) {
        io.stdout.write(output);
      } else {
        await fs.writeFile(outputPath, output);
      }
    }
  }

  return convertResult.isOk() ? 0 : 1;
}
