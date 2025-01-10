import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { pdfToImages } from '@votingworks/image-utils';
import { iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

async function expectToMatchSavedPdf(
  actualPdf: Buffer,
  expectedPdfPath: string
) {
  const expectedPdf = fs.readFileSync(expectedPdfPath);
  const actualPdfPages = pdfToImages(actualPdf);
  const expectedPdfPages = pdfToImages(expectedPdf);
  const pdfPagePairs = iter(actualPdfPages).zip(expectedPdfPages);
  for await (const [
    { page: actualPage, pageNumber },
    { page: expectedPage },
  ] of pdfPagePairs) {
    await expect(actualPage).toMatchImage(expectedPage, {
      diffPath: `${expectedPdfPath}-p${pageNumber}-diff.png`,
    });
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
      fixtures.electionDefinition.election
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
      ? [HmpbBallotPaperSize.Letter, HmpbBallotPaperSize.Legal]
      : Object.values(HmpbBallotPaperSize);
    const specs = allFixtures.fixtureSpecs.filter((spec) =>
      paperSizesToTest.includes(spec.paperSize)
    );
    const allGenerated = await generalElectionFixtures.generate(
      renderer,
      specs
    );
    for (const [spec, generated] of iter(specs).zip(allGenerated)) {
      expect(generated.electionDefinition.election).toEqual(
        (await readElection(spec.electionPath)).ok()?.election
      );

      // Speed up CI tests by only checking marked ballot
      if (!process.env.CI) {
        await expectToMatchSavedPdf(
          generated.blankBallotPdf,
          spec.blankBallotPath
        );
      }
      await expectToMatchSavedPdf(
        generated.markedBallotPdf,
        spec.markedBallotPath
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
