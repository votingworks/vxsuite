import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { iter } from '@votingworks/basics';
import { asSheet, safeParseElectionDefinition } from '@votingworks/types';
import { promises as fs } from 'fs';
import { join, parse as parsePath } from 'path';
import { PDFDocument, cmyk } from 'pdf-lib';
import { RealIo, Stdio, logWritePath } from '..';
import { newBallotGridPoint } from '../../convert/coordinates';
import { generateHandMarkedTestDeckBallots } from '../../generate-test-deck/test_deck_ballots';
import { PdfReader } from '../../pdf_reader';
import {
  BubbleAnnotationStyle,
  PDF_PPI,
  addBubbleAnnotationsToPdfPage,
} from '../../proofing';
import { resolvePath } from '../../utils/resolve_path';
import { readConfigForCommandLineArgs, readConvertManifest } from './config';

/**
 * Creates a test deck for an election.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const readConfigResult = await readConfigForCommandLineArgs(args);

  if (readConfigResult.isErr()) {
    io.stderr.write(`Error: ${readConfigResult.err().message}\n`);
    return 1;
  }

  const { config, configPath } = readConfigResult.ok();

  for (const [
    jurisdictionIndex,
    jurisdictionConfig,
  ] of config.jurisdictions.entries()) {
    io.stderr.write(
      `📍 ${jurisdictionConfig.name} (${jurisdictionIndex + 1}/${
        config.jurisdictions.length
      })\n`
    );

    const manifestPath = resolvePath(configPath, jurisdictionConfig.input);
    const parseManifestResult = await readConvertManifest(manifestPath);

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
      await fs.readFile(resolvePath(manifestPath, electionPath), 'utf8')
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
    const outputPath = resolvePath(configPath, jurisdictionConfig.output);

    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.mkdir(outputPath, { recursive: true });

    for (const card of cards) {
      io.stderr.write(
        `📄 Ballot Style: ${card.ballotStyleId} (Precinct: ${card.precinctId})\n`
      );
      const ballotPath = resolvePath(manifestPath, card.printBallotPath);
      const pdfData = await fs.readFile(ballotPath);
      const pdfReader = new PdfReader(pdfData, { scale: 200 / PDF_PPI });
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

      const testDeckBallots = generateHandMarkedTestDeckBallots({
        election,
        ballotStyleId: card.ballotStyleId,
        includeOvervotedBallots: true,
        includeBlankBallots: true,
      });

      for (const [
        testDeckBallotIndex,
        testDeckBallot,
      ] of testDeckBallots.entries()) {
        io.stderr.write(
          `📄 Test Deck #${testDeckBallotIndex + 1}/${testDeckBallots.length}\n`
        );

        const [outputFrontPage, outputBackPage] = asSheet(
          await testDeckPdf.copyPages(originalPdf, [0, 1])
        );

        const [frontGridPositions, backGridPositions] = iter(
          testDeckBallot.gridPositions
        ).partition((gridPosition) => gridPosition.side === 'front');

        for (const [gridPositions, outputPage, gridAndBubbles] of iter([
          frontGridPositions,
          backGridPositions,
        ]).zip(
          [outputFrontPage, outputBackPage],
          [frontGridAndBubbles, backGridAndBubbles]
        )) {
          addBubbleAnnotationsToPdfPage({
            page: outputPage,
            bubbles: gridPositions.map((gridPosition) =>
              newBallotGridPoint(gridPosition.column, gridPosition.row)
            ),
            grid: gridAndBubbles.grid,
            color: cmyk(0, 0, 0, 1), // black
            style: BubbleAnnotationStyle.FilledBubble,
          });
        }

        testDeckPdf.addPage(outputFrontPage);
        testDeckPdf.addPage(outputBackPage);
      }

      const testDeckPdfData = await testDeckPdf.save();
      const ballotPathParts = parsePath(card.printBallotPath);
      const testDeckPdfPath = join(
        resolvePath(configPath, jurisdictionConfig.output),
        ballotPathParts.base
      );

      logWritePath(io, testDeckPdfPath);
      await fs.writeFile(testDeckPdfPath, testDeckPdfData);
    }
  }

  return 0;
}
