import {
  assertDefined,
  err,
  iter,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import { DOMParser } from '@xmldom/xmldom';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { join, isAbsolute, parse as parsePath } from 'path';
import { getPrecinctById, safeParseJson } from '@votingworks/types';
import { tmpNameSync } from 'tmp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { RealIo, Stdio } from '..';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { NewHampshireBallotCardDefinition } from '../../convert/types';
import { PdfReader } from '../../pdf_reader';

interface ConvertOptions {
  readonly type: 'convert';
  readonly config: ConvertConfig;
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

interface ConvertConfig {
  /**
   * The type of election being converted.
   */
  electionType: 'general' | 'primary';

  /**
   * Configuration for the election jurisdictions. Each one will become its own
   * election.
   */
  readonly jurisdictions: ConvertConfigJurisdiction[];

  /**
   * Whether to enable debug logging.
   */
  readonly debug?: boolean;
}

interface ConvertConfigJurisdiction {
  /**
   * The name of the jurisdiction, e.g. "Hillsborough County".
   */
  readonly name: string;

  /**
   * Configuration for the ballot cards.
   */
  readonly cards: ConvertConfigCard[];

  /**
   * Path to the output directory.
   */
  readonly output: string;
}

interface ConvertConfigCard {
  /**
   * Path to the XML definition file.
   */
  readonly definition: string;

  /**
   * Path to the PDF ballot file.
   */
  readonly ballot: string;

  /**
   * The pages of the ballot PDF to use for this card. The first page is 1. If
   * this is not specified, the PDF must contain only one ballot card (i.e.
   * exactly two pages).
   */
  readonly pages?: [number, number];
}

const ConvertConfigCardSchema: z.ZodSchema<ConvertConfigCard> = z.object({
  definition: z.string(),
  ballot: z.string(),
  pages: z.tuple([z.number(), z.number()]).optional(),
});

const ConvertConfigJurisdictionSchema: z.ZodSchema<ConvertConfigJurisdiction> =
  z.object({
    name: z.string().nonempty(),
    cards: z.array(ConvertConfigCardSchema),
    output: z.string(),
  });

const ConvertConfigSchema: z.ZodSchema<ConvertConfig> = z.object({
  electionType: z.union([z.literal('general'), z.literal('primary')]),
  jurisdictions: z.array(ConvertConfigJurisdictionSchema),
  debug: z.boolean().optional(),
});

async function parseOptions(
  args: readonly string[]
): Promise<Result<Options, Error>> {
  let configPath: Optional<string>;
  let debug = false;

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

      case '--debug': {
        debug = true;
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
  const configResult = safeParseJson(configText, ConvertConfigSchema);
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
        })),
        output: locatePathRelativeToConfigPath(jurisdiction.output),
      })),
      debug: config.debug || debug,
    },
  });
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `Usage: convert -c <config-file> [--debug]

  -c, --config <file>  Path to the config file.
  --debug              Enable debug logging.
  -h, --help           Display this help message.
`
  );
}

async function writeGrayscalePdf(outputPath: string, pdfData: Uint8Array) {
  // const tmpSourcePath = tmpNameSync();
  await fs.writeFile(outputPath, pdfData);
  // await promisify(execFile)('gs', [
  //   `-sOutputFile=${outputPath}`,
  //   '-sDEVICE=pdfwrite',
  //   '-sColorConversionStrategy=Gray',
  //   '-dProcessColorModel=/DeviceGray',
  //   '-dAutoRotatePages=/None',
  //   '-dNOPAUSE',
  //   '-dBATCH',
  //   tmpSourcePath,
  // ]);
}

/**
 * Converts New Hampshire (NH) ballot data to the VotingWorks format.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const parseResult = await parseOptions(args);

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

  const {
    config: { jurisdictions, debug },
  } = options;

  if (debug) {
    enableDebug('converter-nh-accuvote:*');
  }

  let errors = false;

  for (const [
    jurisdictionIndex,
    { name, cards, output },
  ] of jurisdictions.entries()) {
    io.stderr.write(
      `📍 ${name} (${jurisdictionIndex + 1}/${jurisdictions.length})\n`
    );

    const convertibleCards: NewHampshireBallotCardDefinition[] =
      await Promise.all(
        cards.map(async ({ definition, ballot, pages }) => {
          const ballotData = await fs.readFile(ballot);
          const originalPdf = debug
            ? await PDFDocument.load(ballotData)
            : undefined;
          const debugPdf = originalPdf ? await PDFDocument.create() : undefined;

          if (debugPdf && originalPdf) {
            const [frontPage, backPage] = await debugPdf.copyPages(
              originalPdf,
              pages?.map((page) => page - 1) ?? [0, 1]
            );

            debugPdf.addPage(frontPage);
            debugPdf.addPage(backPage);
          }

          return {
            definition: parseXml(await fs.readFile(definition, 'utf8')),
            definitionPath: definition,
            ballotPdf: new PdfReader(ballotData, {
              scale: 200 / 72,
            }),
            pages,
            debugPdf,
          };
        })
      );

    const result = await convertElectionDefinition(convertibleCards, {
      jurisdictionOverride: name,
    });
    const { issues = [] } = result.isErr() ? result.err() : result.ok();

    if (issues.length > 0) {
      io.stderr.write(result.isOk() ? 'warning: ' : 'error: ');
      io.stderr.write(`conversion completed with issues:\n`);
      for (const issue of issues) {
        io.stderr.write(`- ${issue.message}\n`);
      }
    }

    if (result.isErr()) {
      errors = true;
    } else {
      const { electionDefinition, ballotPdfsWithMetadata } = result.ok().result;

      await fs.rm(output, { recursive: true, force: true });
      await fs.mkdir(output, { recursive: true });

      for (const [
        { ballot, pages: [frontPageNumber, backPageNumber] = [1, 2] },
        { debugPdf },
      ] of iter(cards).zip(convertibleCards)) {
        if (debugPdf) {
          const parsedPdfPath = parsePath(ballot);
          const debugPath = join(
            output,
            `${parsedPdfPath.name}-debug-p${frontPageNumber}-p${backPageNumber}${parsedPdfPath.ext}`
          );
          io.stderr.write(`📝 ${debugPath}\n`);
          const debugPdfData = await debugPdf.save();
          await fs.writeFile(debugPath, debugPdfData);
        }
      }

      const electionPath = join(output, 'election.json');
      io.stderr.write(`📝 ${electionPath}\n`);
      await fs.writeFile(electionPath, electionDefinition.electionData);

      for (const [metadata, pdf] of ballotPdfsWithMetadata) {
        const { precinctId, ballotStyleId, ballotType } = metadata;
        const precinct = assertDefined(
          getPrecinctById({ election: electionDefinition.election, precinctId })
        );
        const fileName = `${ballotType}-ballot-${precinct.name.replaceAll(
          ' ',
          '_'
        )}-${ballotStyleId}.pdf`;
        const filePath = join(output, fileName);
        io.stderr.write(`📝 ${filePath}\n`);
        await writeGrayscalePdf(filePath, pdf);
      }
    }
  }

  return errors ? 1 : 0;
}
