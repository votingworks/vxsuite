import { Buffer } from 'buffer';
import * as fs from 'fs';
import { safeParseElection } from '@votingworks/types';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { iter } from '@votingworks/basics';
import { generateAllBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  generateFamousNamesFixtures,
  generateGeneralElectionFixtures,
  generatePrimaryElectionFixtures,
} from './ballot_fixtures';
import { createPlaywrightRenderer } from './next/playwright_renderer';
import { Renderer } from './next';

async function expectToMatchSavedPdf(
  actualPdf: Buffer,
  expectedPdfPath: string
) {
  const expectedPdf = fs.readFileSync(expectedPdfPath);
  const actualPdfPages = pdfToImages(actualPdf);
  const expectedPdfPages = pdfToImages(expectedPdf);
  const pdfPagePairs = iter(actualPdfPages).zip(expectedPdfPages);
  for await (const [
    { page: actualPage },
    { page: expectedPage },
  ] of pdfPagePairs) {
    expect(toImageBuffer(actualPage)).toMatchImage(toImageBuffer(expectedPage));
  }
}

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

describe('fixtures are up to date - run `pnpm generate-fixtures` if this test fails', () => {
  test('all bubble ballot fixtures', async () => {
    const {
      electionPath,
      electionDefinition,
      blankBallotPath,
      blankBallotPdf,
      filledBallotPath,
      filledBallotPdf,
      cyclingTestDeckPath,
      cyclingTestDeckPdf,
    } = await generateAllBubbleBallotFixtures(renderer);

    const savedElection = fs.readFileSync(electionPath, 'utf8');
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    await expectToMatchSavedPdf(blankBallotPdf, blankBallotPath);
    await expectToMatchSavedPdf(filledBallotPdf, filledBallotPath);
    await expectToMatchSavedPdf(cyclingTestDeckPdf, cyclingTestDeckPath);
  });

  test('famous names fixtures', async () => {
    const {
      electionPath,
      electionDefinition,
      blankBallotPath,
      blankBallotPdf,
      markedBallotPath,
      markedBallotPdf,
    } = await generateFamousNamesFixtures(renderer);

    const savedElection = fs.readFileSync(electionPath, 'utf8');
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    await expectToMatchSavedPdf(blankBallotPdf, blankBallotPath);
    await expectToMatchSavedPdf(markedBallotPdf, markedBallotPath);
  });

  test('general election fixtures', async () => {
    for (const {
      electionPath,
      electionDefinition,
      blankBallotPath,
      blankBallotPdf,
      markedBallotPath,
      markedBallotPdf,
    } of await generateGeneralElectionFixtures(renderer)) {
      const savedElection = fs.readFileSync(electionPath, 'utf8');
      expect(safeParseElection(savedElection).ok()).toEqual(
        electionDefinition.election
      );

      await expectToMatchSavedPdf(blankBallotPdf, blankBallotPath);
      await expectToMatchSavedPdf(markedBallotPdf, markedBallotPath);
    }
  });

  test(`primary election fixtures`, async () => {
    const { electionPath, electionDefinition, fishParty, mammalParty } =
      await generatePrimaryElectionFixtures(renderer);
    const savedElection = fs.readFileSync(electionPath, 'utf8');
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    await expectToMatchSavedPdf(
      fishParty.blankBallotPdf,
      fishParty.blankBallotPath
    );
    await expectToMatchSavedPdf(
      fishParty.markedBallotPdf,
      fishParty.markedBallotPath
    );
    await expectToMatchSavedPdf(
      mammalParty.blankBallotPdf,
      mammalParty.blankBallotPath
    );
    await expectToMatchSavedPdf(
      mammalParty.markedBallotPdf,
      mammalParty.markedBallotPath
    );
  });
});
