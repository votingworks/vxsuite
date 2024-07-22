import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { assert, iter } from '@votingworks/basics';
import {
  asSheet,
  Candidate,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { generateTestDeckBallots } from '@votingworks/utils';
import { promises as fs } from 'fs';
import { join, parse as parsePath } from 'path';
import { cmyk, PDFDocument } from 'pdf-lib';
import { RealIo, Stdio } from '..';
import { getPdfPagePointForGridPoint } from '../../convert/debug';
import {
  ConvertOutputManifestSchema,
  GenerateTestDeckConfigSchema,
} from '../../convert/types';
import { PdfReader } from '../../pdf_reader';

/**
 * Creates a test deck for an election.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    switch (args[i]) {
      case '-c':
      case '--config':
        configPath = args[i + 1];
        i += 1;
        break;

      default:
        io.stderr.write(`Error: Unexpected argument: ${args[i]}\n`);
        return 1;
    }
  }

  if (!configPath) {
    io.stderr.write('Error: Missing required argument: --config\n');
    return 1;
  }

  const parseConfigResult = safeParseJson(
    await fs.readFile(configPath, 'utf8'),
    GenerateTestDeckConfigSchema
  );

  if (parseConfigResult.isErr()) {
    io.stderr.write(`Error: ${parseConfigResult.err().message}\n`);
    return 1;
  }

  const config = parseConfigResult.ok();

  for (const [
    jurisdictionIndex,
    jurisdictionConfig,
  ] of config.jurisdictions.entries()) {
    io.stderr.write(
      `📍 ${jurisdictionConfig.name} (${jurisdictionIndex + 1}/${
        config.jurisdictions.length
      })\n`
    );

    const manifestPath = join(configPath, '..', jurisdictionConfig.input);
    const parseManifestResult = safeParseJson(
      await fs.readFile(manifestPath, 'utf8'),
      ConvertOutputManifestSchema
    );

    if (parseManifestResult.isErr()) {
      io.stderr.write(
        `Error: Invalid manifest (${manifestPath}): ${
          parseManifestResult.err().message
        }\n`
      );
      return 1;
    }

    const { cards, electionPath } = parseManifestResult.ok();

    const parseElectionResult = safeParseElectionDefinition(
      await fs.readFile(join(manifestPath, '..', electionPath), 'utf8')
    );

    if (parseElectionResult.isErr()) {
      io.stderr.write(
        `Error: Invalid election (${electionPath}): ${
          parseElectionResult.err().message
        }\n`
      );
      return 1;
    }

    const { election } = parseElectionResult.ok();
    const outputPath = join(configPath, '..', jurisdictionConfig.output);

    const testDeckBallots = generateTestDeckBallots({
      election,
      markingMethod: 'hand',
    });

    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.mkdir(outputPath, { recursive: true });

    for (const card of cards) {
      io.stderr.write(
        `📄 Ballot Style: ${card.ballotStyleId} (Precinct: ${card.precinctId})\n`
      );
      const ballotPath = join(manifestPath, '..', card.ballotPath);
      const pdfData = await fs.readFile(ballotPath);
      const pdfReader = new PdfReader(pdfData, { scale: 200 / 72 });
      if ((await pdfReader.getPageCount()) !== 2) {
        io.stderr.write(
          `Error: Expected 2 pages, but found ${await pdfReader.getPageCount()} in ${ballotPath}\n`
        );
        return 1;
      }

      const [frontRendered, backRendered] = asSheet(
        await iter(pdfReader.pages()).take(2).toArray()
      );

      const findGridAndBubblesResult = findTemplateGridAndBubbles([
        frontRendered.page,
        backRendered.page,
      ]);

      if (findGridAndBubblesResult.isErr()) {
        io.stderr.write(
          `Error: Cannot find template grid & bubbles: ${JSON.stringify(
            findGridAndBubblesResult.err(),
            null,
            2
          )}\n`
        );
        return 1;
      }

      const [frontGridAndBubbles, backGridAndBubbles] =
        findGridAndBubblesResult.ok();

      const originalPdf = await PDFDocument.load(pdfData);
      const testDeckPdf = await PDFDocument.create();

      const filteredTestDeckBallots = testDeckBallots.filter(
        (b) =>
          b.precinctId === card.precinctId &&
          b.ballotStyleId === card.ballotStyleId
      );

      for (const [
        testDeckBallotIndex,
        testDeckBallot,
      ] of filteredTestDeckBallots.entries()) {
        io.stderr.write(
          `📄 Test Deck #${testDeckBallotIndex + 1}/${
            filteredTestDeckBallots.length
          }\n`
        );

        if (
          testDeckBallot.ballotStyleId !== card.ballotStyleId ||
          testDeckBallot.precinctId !== card.precinctId
        ) {
          continue;
        }

        const [outputFrontPage, outputBackPage] = asSheet(
          await testDeckPdf.copyPages(originalPdf, [0, 1])
        );

        for (const [contestId, vote] of Object.entries(testDeckBallot.votes)) {
          const contest = election.contests.find((c) => c.id === contestId);

          if (!contest) {
            io.stderr.write(
              `Error: Contest not found: ${contestId} (from ${electionPath} in precinct '${card.precinctId}')\n`
            );
            return 1;
          }

          if (contest.type !== 'candidate') {
            io.stderr.write(
              `Error: Contest type not supported: ${contest.type} (from ${electionPath} in precinct '${card.precinctId}')\n`
            );
            return 1;
          }

          const gridLayout = election.gridLayouts?.find(
            (layout) => layout.ballotStyleId === card.ballotStyleId
          );

          if (!gridLayout) {
            io.stderr.write(
              `Error: Grid layout not found for ballot style '${card.ballotStyleId}' in precinct '${card.precinctId}'\n`
            );
            return 1;
          }
          // console.log('gridLayout', gridLayout);

          const candidates = vote as unknown as Candidate[];
          assert(Array.isArray(candidates));

          for (const candidate of candidates) {
            // console.log('candidate', candidate);
            const gridPosition = gridLayout.gridPositions.find(
              (gp) =>
                gp.contestId === contestId &&
                ((gp.type === 'option' && gp.optionId === candidate.id) ||
                  (gp.type === 'write-in' &&
                    gp.writeInIndex === candidate.writeInIndex))
            );

            if (!gridPosition) {
              io.stderr.write(
                `Error: Grid position not found for candidate '${candidate.id}' in contest '${contestId}' in precinct '${card.precinctId}' with ballot style '${card.ballotStyleId}'\n`
              );
              return 1;
            }

            // Mark the ballot
            const page =
              gridPosition.side === 'front' ? outputFrontPage : outputBackPage;
            const gridAndBubbles =
              gridPosition.side === 'front'
                ? frontGridAndBubbles
                : backGridAndBubbles;
            const bubbleCenterInPdfPage = getPdfPagePointForGridPoint(
              page,
              gridAndBubbles.grid,
              { x: gridPosition.column, y: gridPosition.row }
            );

            const width = 7;
            const height = 4.5;

            // TODO: make this be a filled bubble (i.e. rounded rectangle)
            page.drawEllipse({
              x: bubbleCenterInPdfPage.x,
              y: bubbleCenterInPdfPage.y,
              xScale: width,
              yScale: height,
              color: cmyk(0, 0, 0, 1), // black
            });
          }
        }

        testDeckPdf.addPage(outputFrontPage);
        testDeckPdf.addPage(outputBackPage);
      }

      const testDeckPdfData = await testDeckPdf.save();
      const ballotPathParts = parsePath(card.ballotPath);
      const testDeckPdfPath = join(
        configPath,
        '..',
        jurisdictionConfig.output,
        ballotPathParts.base
      );

      await fs.writeFile(testDeckPdfPath, testDeckPdfData);
      // io.stdout.write(`${JSON.stringify(testDeckBallots, null, 2)}\n`);
    }
  }

  return 0;
}
