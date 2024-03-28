import { Buffer } from 'buffer';
import * as fs from 'fs';
import { BallotPaperSize } from '@votingworks/types';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from './ballot_fixtures';
import { createPlaywrightRenderer } from './next/playwright_renderer';
import { Renderer } from './next';

jest.setTimeout(120_000);

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
    const fixtures = allBubbleBallotFixtures;
    const generated = await allBubbleBallotFixtures.generate(renderer, {
      blankOnly: Boolean(process.env.CI),
    });

    expect(generated.electionDefinition.election).toEqual(
      (await readElection(fixtures.electionPath)).ok()?.election
    );

    await expectToMatchSavedPdf(
      generated.blankBallotPdf,
      fixtures.blankBallotPath
    );
    // Speed up CI tests by only checking blank ballot
    if (!process.env.CI) {
      await expectToMatchSavedPdf(
        generated.filledBallotPdf,
        fixtures.filledBallotPath
      );
      await expectToMatchSavedPdf(
        generated.cyclingTestDeckPdf,
        fixtures.cyclingTestDeckPath
      );
    }
  });

  test('famous names fixtures', async () => {
    const fixtures = famousNamesFixtures;
    const generated = await famousNamesFixtures.generate(renderer, {
      markedOnly: Boolean(process.env.CI),
    });

    expect(generated.electionDefinition.election).toEqual(
      (await readElection(fixtures.electionPath)).ok()?.election
    );

    // Speed up CI tests by only checking marked ballot
    if (!process.env.CI) {
      await expectToMatchSavedPdf(
        generated.blankBallotPdf,
        fixtures.blankBallotPath
      );
    }
    await expectToMatchSavedPdf(
      generated.markedBallotPdf,
      fixtures.markedBallotPath
    );
  });

  test('general election fixtures', async () => {
    const allFixtures = generalElectionFixtures;
    // Speed up CI tests by only checking two paper sizes
    const paperSizesToTest = process.env.CI
      ? [BallotPaperSize.Letter, BallotPaperSize.Legal]
      : Object.values(BallotPaperSize);
    const allGenerated = await generalElectionFixtures.generate(renderer, {
      markedOnly: Boolean(process.env.CI),
      paperSizes: paperSizesToTest,
    });
    for (const paperSize of paperSizesToTest) {
      const fixtures = allFixtures[paperSize];
      const generated = allGenerated[paperSize];

      expect(generated.electionDefinition.election).toEqual(
        (await readElection(fixtures.electionPath)).ok()?.election
      );

      // Speed up CI tests by only checking marked ballot
      if (!process.env.CI) {
        await expectToMatchSavedPdf(
          generated.blankBallotPdf,
          fixtures.blankBallotPath
        );
      }
      await expectToMatchSavedPdf(
        generated.markedBallotPdf,
        fixtures.markedBallotPath
      );
    }
  });

  test(`primary election fixtures`, async () => {
    const fixtures = primaryElectionFixtures;
    const generated = await primaryElectionFixtures.generate(renderer, {
      markedOnly: Boolean(process.env.CI),
    });

    for (const party of ['mammalParty', 'fishParty'] as const) {
      const partyFixtures = fixtures[party];
      const partyGenerated = generated[party];

      // Speed up CI tests by only checking marked ballot
      if (!process.env.CI) {
        await expectToMatchSavedPdf(
          partyGenerated.blankBallotPdf,
          partyFixtures.blankBallotPath
        );
        await expectToMatchSavedPdf(
          partyGenerated.otherPrecinctBlankBallotPdf,
          partyFixtures.otherPrecinctBlankBallotPath
        );
      }
      await expectToMatchSavedPdf(
        partyGenerated.markedBallotPdf,
        partyFixtures.markedBallotPath
      );
    }
  });
});
