import { readElection } from '@votingworks/fs';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 40_000,
});

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});

afterAll(async () => {
  await rendererPool.close();
});

// run `pnpm generate-fixtures` if this test fails
test.each([
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom22,
])('all bubble ballot fixtures: %s', async (paperSize) => {
  const fixtures = allBubbleBallotFixtures(paperSize);
  const generated = await fixtures.generate(rendererPool);

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
});
