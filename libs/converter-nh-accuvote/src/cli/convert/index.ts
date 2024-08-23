import { assertDefined, iter } from '@votingworks/basics';
import { getPrecinctById } from '@votingworks/types';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import formatXml from 'xml-formatter';
import { RealIo, Stdio } from '..';
import * as accuvote from '../../convert/accuvote';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { parseXml } from '../../convert/dom_parser';
import {
  ConvertConfigCard,
  ConvertOutputCard,
  ConvertOutputManifest,
  RawCardDefinition,
} from '../../convert/types';
import { PdfReader } from '../../pdf_reader';
import { ConvertOptions, parseOptions } from './options';
import { usage } from './usage';

async function loadCard(card: ConvertConfigCard): Promise<RawCardDefinition> {
  return {
    definition: parseXml(await fs.readFile(card.definition, 'utf8')),
    ballotPdf: new PdfReader(await fs.readFile(card.ballot), {
      scale: 200 / 72,
    }),
    pages: card.pages,
  };
}

async function writeCardOutputs({
  io,
  correctedDefinition,
  pdfs,
  outputCard,
}: {
  io: Stdio;
  correctedDefinition: accuvote.AvsInterface;
  pdfs: { printing: Uint8Array; proofing: Uint8Array };
  outputCard: ConvertOutputCard;
}): Promise<void> {
  const { correctedDefinitionPath } = outputCard;
  io.stderr.write(`📝 ${correctedDefinitionPath}\n`);
  await fs.writeFile(
    correctedDefinitionPath,
    formatXml(accuvote.toXml(correctedDefinition), {
      indentation: '  ',
      collapseContent: true,
    })
  );

  const { printBallotPath, proofBallotPath } = outputCard;
  io.stderr.write(`📝 ${printBallotPath}\n`);
  await fs.writeFile(printBallotPath, pdfs.printing);

  io.stderr.write(`📝 ${proofBallotPath}\n`);
  await fs.writeFile(proofBallotPath, pdfs.proofing);
}

function runHelp(io: Stdio): number {
  usage(io.stdout);
  return 0;
}

async function runConvert(options: ConvertOptions, io: Stdio): Promise<number> {
  const {
    config: { jurisdictions },
  } = options;

  let errors = false;

  for (const [
    jurisdictionIndex,
    jurisdictionConfig,
  ] of jurisdictions.entries()) {
    const { name, cards, output } = jurisdictionConfig;

    io.stderr.write(
      `📍 ${name} (${jurisdictionIndex + 1}/${jurisdictions.length})\n`
    );

    const loadedCards = await iter(cards).async().map(loadCard).toArray();
    const convertResult = await convertElectionDefinition(loadedCards, {
      jurisdictionOverride: name,
    });
    const { issues = [] } = convertResult.isErr()
      ? convertResult.err()
      : convertResult.ok();

    if (issues.length > 0) {
      io.stderr.write(convertResult.isOk() ? 'warning: ' : 'error: ');
      io.stderr.write(`conversion completed with issues:\n`);
      for (const issue of issues) {
        io.stderr.write(`- ${issue.message}\n`);
      }
    }

    const electionPath = join(output, 'election.json');
    const manifest: ConvertOutputManifest = {
      config: {
        name,
        cards: cards.map((card) => ({
          ...card,
          definition: relative(output, card.definition),
          ballot: relative(output, card.ballot),
        })) as [ConvertConfigCard, ...ConvertConfigCard[]],
        output: '.',
      },
      cards: [],
      electionPath: relative(output, electionPath),
    };

    if (convertResult.isErr()) {
      errors = true;
    } else {
      const { electionDefinition, ballotPdfs, correctedDefinitions } =
        convertResult.ok().result;

      await fs.rm(output, { recursive: true, force: true });
      await fs.mkdir(output, { recursive: true });

      io.stderr.write(`📝 ${electionPath}\n`);
      await fs.writeFile(electionPath, electionDefinition.electionData);

      for (const [metadata, pdfs] of ballotPdfs) {
        const { precinctId, ballotStyleId, ballotType } = metadata;
        const precinct = assertDefined(
          getPrecinctById({ election: electionDefinition.election, precinctId })
        );
        const ballotStyleBaseName = `${ballotType}-ballot-${precinct.name.replaceAll(
          ' ',
          '_'
        )}-${ballotStyleId}`;

        const correctedDefinitionName = `${ballotStyleBaseName}-corrected-definition.xml`;
        const correctedDefinition = assertDefined(
          correctedDefinitions.get(metadata.ballotStyleId)
        );
        const ballotName = `${ballotStyleBaseName}.pdf`;

        const outputCard: ConvertOutputCard = {
          printBallotPath: relative(
            output,
            join(output, `PRINT-${ballotName}`)
          ),
          proofBallotPath: relative(
            output,
            join(output, `PROOF-${ballotName}`)
          ),
          correctedDefinitionPath: relative(
            output,
            join(output, correctedDefinitionName)
          ),
          precinctId,
          ballotStyleId,
          ballotType,
        };

        await writeCardOutputs({
          io,
          correctedDefinition,
          pdfs,
          outputCard,
        });
      }
    }

    const manifestPath = join(output, 'manifest.json');
    io.stderr.write(`📝 ${manifestPath}\n`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  return errors ? 1 : 0;
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
    return runHelp(io);
  }

  return runConvert(options, io);
}
