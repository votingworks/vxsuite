import { readElection } from '@votingworks/fs';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers.js';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';

vi.setConfig({
  testTimeout: 50_000,
});

// run `pnpm generate-fixtures` if this test fails
test.concurrent.each(Object.values(HmpbBallotPaperSize))(
  'all bubble ballot fixtures: %s',
  async (paperSize) => {
    const fixtures = allBubbleBallotFixtures(paperSize);
    const rendererPool = await createPlaywrightRendererPool(1);
    const generated = await fixtures
      .generate(rendererPool)
      .finally(() => rendererPool.close());

    expect(generated.electionDefinition.election).toEqual(
      (await readElection(fixtures.electionPath)).ok()?.election
    );

    await expectToMatchSavedPdf(
      generated.blankBallotPdf,
      fixtures.blankBallotPath
    );
    await expectToMatchSavedPdf(
      generated.filledBallotPdf,
      fixtures.filledBallotPath
    );
    await expectToMatchSavedPdf(
      generated.cyclingTestDeckPdf,
      fixtures.cyclingTestDeckPath
    );
  }
);
