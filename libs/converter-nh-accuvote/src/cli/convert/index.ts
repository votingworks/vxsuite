import {
  assertDefined,
  err,
  iter,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import { getPrecinctById, safeParseJson } from '@votingworks/types';
import chalk from 'chalk';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative } from 'path';
import formatXml from 'xml-formatter';
import { RealIo, Stdio } from '..';
import * as accuvote from '../../convert/accuvote';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { parseXml } from '../../convert/dom_parser';
import {
  ConvertConfig,
  ConvertConfigSchema,
  ConvertOutputManifest,
  RawCardDefinition,
} from '../../convert/types';
import { PdfReader } from '../../pdf_reader';

interface ConvertOptions {
  readonly type: 'convert';
  readonly config: ConvertConfig;
}

interface HelpOptions {
  readonly type: 'help';
}

type Options = ConvertOptions | HelpOptions;

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
  function s(text: string): string {
    return chalk.green(`"${text}"`);
  }
  function n(number: number): string {
    return chalk.yellow(`${number}`);
  }
  function c(comment: string): string {
    return chalk.dim(comment);
  }

  out.write(`Usage: convert --config <config.json>\n`);
  out.write(`\n`);
  out.write(chalk.bold(`Example Config\n`));
  out.write(`\n`);
  out.write(`  {\n`);
  out.write(`    ${c('// electionType: general or primary')}\n`);
  out.write(`    ${s('electionType')}: ${s('general')}\n`);
  out.write(`    ${s('jurisdictions')}: [\n`);
  out.write(`      ${c('// single-card jurisdiction')}\n`);
  out.write(`      {\n`);
  out.write(`        ${s('name')}: ${s('Alton')},\n`);
  out.write(`        ${s('cards')}: [\n`);
  out.write(`          {\n`);
  out.write(
    `            ${s('definition')}: ${s('input/alton/definition.xml')},\n`
  );
  out.write(`            ${s('ballot')}: ${s('input/alton/ballot.pdf')},\n`);
  out.write(`          }\n`);
  out.write(`        ],\n`);
  out.write(`        ${s('output')}: ${s('output/alton')}\n`);
  out.write(`      },\n`);
  out.write(`\n`);
  out.write(`      ${c('// multi-card jurisdiction')}\n`);
  out.write(`      {\n`);
  out.write(`        ${s('name')}: ${s('Rochester')},\n`);
  out.write(`        ${s('cards')}: [\n`);
  out.write(`          {\n`);
  out.write(
    `            ${s('definition')}: ${s('input/rochester/card1.xml')},\n`
  );
  out.write(
    `            ${s('ballot')}: ${s('input/rochester/ballot.pdf')},\n`
  );
  out.write(`\n`);
  out.write(
    `            ${c('// optional, useful for multi-ballot card PDFs')}\n`
  );
  out.write(`            ${s('pages')}: [${n(1)}, ${n(2)}]\n`);
  out.write(`          },\n`);
  out.write(`          {\n`);
  out.write(
    `            ${s('definition')}: ${s('input/rochester/card2.xml')},\n`
  );
  out.write(
    `            ${s('ballot')}: ${s('input/rochester/ballot.pdf')},\n`
  );
  out.write(`            ${s('pages')}: [${n(3)}, ${n(4)}]\n`);
  out.write(`          }\n`);
  out.write(`        ],\n`);
  out.write(`        ${s('output')}: ${s('output/manchester')}\n`);
  out.write(`      }\n`);
  out.write(`    ]\n`);
  out.write(`  }\n`);
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
    jurisdictionConfig,
  ] of jurisdictions.entries()) {
    const { name, cards, output } = jurisdictionConfig;

    io.stderr.write(
      `📍 ${name} (${jurisdictionIndex + 1}/${jurisdictions.length})\n`
    );

    const electionPath = join(output, 'election.json');
    const manifest: ConvertOutputManifest = {
      config: {
        name,
        cards: cards.map((card) => ({
          ...card,
          definition: relative(output, card.definition),
          ballot: relative(output, card.ballot),
        })),
        output: '.',
      },
      cards: [],
      electionPath: relative(output, electionPath),
    };

    const convertibleCards: RawCardDefinition[] = await iter(cards)
      .async()
      .map(async ({ definition, ballot, pages }) => ({
        definition: parseXml(await fs.readFile(definition, 'utf8')),
        definitionPath: definition,
        ballotPdf: new PdfReader(await fs.readFile(ballot), {
          scale: 200 / 72,
        }),
        pages,
      }))
      .toArray();

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
      const { electionDefinition, ballotPdfs, correctedDefinitions } =
        result.ok().result;

      await fs.rm(output, { recursive: true, force: true });
      await fs.mkdir(output, { recursive: true });

      io.stderr.write(`📝 ${electionPath}\n`);
      await fs.writeFile(electionPath, electionDefinition.electionData);

      for (const [metadata, pdf] of ballotPdfs) {
        const { precinctId, ballotStyleId, ballotType } = metadata;
        const precinct = assertDefined(
          getPrecinctById({ election: electionDefinition.election, precinctId })
        );
        const ballotStyleBaseName = `${ballotType}-ballot-${precinct.name.replaceAll(
          ' ',
          '_'
        )}-${ballotStyleId}`;

        const correctedDefinitionName = `${ballotStyleBaseName}-corrected-definition.xml`;
        const correctedDefinitionPath = join(output, correctedDefinitionName);
        const correctedDefinition = assertDefined(
          correctedDefinitions.get(metadata.ballotStyleId)
        );
        io.stderr.write(`📝 ${correctedDefinitionPath}\n`);
        await fs.writeFile(
          correctedDefinitionPath,
          formatXml(accuvote.toXml(correctedDefinition), {
            indentation: '  ',
            collapseContent: true,
          })
        );

        const ballotName = `${ballotStyleBaseName}.pdf`;

        const printingBallotPath = join(output, `PRINT-${ballotName}`);
        io.stderr.write(`📝 ${printingBallotPath}\n`);
        await fs.writeFile(printingBallotPath, pdf.printing);

        const proofingBallotPath = join(output, `PROOF-${ballotName}`);
        io.stderr.write(`📝 ${proofingBallotPath}\n`);
        await fs.writeFile(proofingBallotPath, pdf.proofing);

        manifest.cards.push({
          ballotPath: relative(output, printingBallotPath),
          correctedDefinitionPath: relative(output, correctedDefinitionPath),
          precinctId,
          ballotStyleId,
          ballotType,
        });
      }
    }

    const manifestPath = join(output, 'manifest.json');
    io.stderr.write(`📝 ${manifestPath}\n`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  return errors ? 1 : 0;
}
