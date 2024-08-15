import { assertDefined, err, iter, ok, Result } from '@votingworks/basics';
import { DOMParser } from '@xmldom/xmldom';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getPrecinctById } from '@votingworks/types';
import { tmpNameSync } from 'tmp';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RealIo, Stdio } from '..';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { NewHampshireBallotCardDefinition } from '../../convert/types';

interface ConvertOptions {
  readonly type: 'convert';
  readonly cardDefinitionPaths: Array<{
    readonly definitionPath: string;
    readonly ballotPath: string;
  }>;
  readonly outputPath: string;
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
  const definitionPaths: string[] = [];
  const ballotPaths: string[] = [];
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
        outputPath = nextArg;
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
          definitionPaths.push(arg);
        } else if (arg?.endsWith('.pdf')) {
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

  if (ballotPaths.length === 0) {
    return err(new Error('missing ballot pdf paths'));
  }

  if (ballotPaths.length !== definitionPaths.length) {
    return err(
      new Error('there must be one ballot pdf for each XML definition')
    );
  }

  if (!outputPath) {
    return err(new Error('missing output directory path'));
  }

  return ok({
    type: 'convert',
    cardDefinitionPaths: iter(ballotPaths)
      .zip(definitionPaths)
      .map(([ballotPath, definitionPath]) => ({
        definitionPath,
        ballotPath,
      }))
      .toArray(),
    outputPath,
    debug,
  });
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]\n`
  );
}

async function writeGrayscalePdf(outputPath: string, pdfData: Uint8Array) {
  const tmpSourcePath = tmpNameSync();
  await fs.writeFile(tmpSourcePath, pdfData);
  await promisify(exec)(`
    gs \
      -sOutputFile=${outputPath} \
      -sDEVICE=pdfwrite \
      -sColorConversionStrategy=Gray \
      -dProcessColorModel=/DeviceGray \
      -dAutoRotatePages=/None \
      -dNOPAUSE \
      -dBATCH \
      ${tmpSourcePath}
  `);
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

  const { cardDefinitionPaths, outputPath } = options;

  const cardDefinitions = await Promise.all(
    cardDefinitionPaths.map(
      async (cardDefinitionPath): Promise<NewHampshireBallotCardDefinition> => {
        const definitionContent = await fs.readFile(
          cardDefinitionPath.definitionPath,
          'utf8'
        );
        const ballotPdf = await fs.readFile(cardDefinitionPath.ballotPath);
        return {
          definition: parseXml(definitionContent),
          ballotPdf,
        };
      }
    )
  );

  const convertResult = await convertElectionDefinition(cardDefinitions);

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
    const { electionDefinition, ballotPdfs } = convertResult.ok().result;
    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.mkdir(outputPath, { recursive: true });
    const electionPath = join(outputPath, 'election.json');
    io.stderr.write(`Writing: ${electionPath}\n`);
    await fs.writeFile(electionPath, electionDefinition.electionData);
    for (const [metadata, pdfs] of ballotPdfs) {
      const { precinctId, ballotStyleId, ballotType } = metadata;
      const precinct = assertDefined(
        getPrecinctById({ election: electionDefinition.election, precinctId })
      );
      const fileName = `${ballotType}-ballot-${precinct.name.replaceAll(
        ' ',
        '_'
      )}-${ballotStyleId}.pdf`;
      const printingFilePath = join(outputPath, `PRINT-${fileName}`);
      const proofingFilePath = join(outputPath, `PROOF-${fileName}`);
      io.stderr.write(`Writing: ${printingFilePath}\n`);
      io.stderr.write(`Writing: ${proofingFilePath}\n`);
      await Promise.all([
        writeGrayscalePdf(printingFilePath, pdfs.printing),
        fs.writeFile(proofingFilePath, pdfs.proofing),
      ]);
    }
  }

  return convertResult.isOk() ? 0 : 1;
}
