import { afterAll, beforeAll, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { miCombinedBallotPrimaryElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 20_000,
});

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});

afterAll(async () => {
  await rendererPool.close();
});

// run `pnpm generate-fixtures --mi-combined-ballot-primary-election` if this test fails
test('MI combined ballot primary election fixtures', async () => {
  const fixtures = miCombinedBallotPrimaryElectionFixtures;
  const generated = await fixtures.generate(rendererPool);

  await expectToMatchSavedPdf(
    generated.blankBallotPdf,
    fixtures.blankBallotPath
  );
  await expectToMatchSavedPdf(
    generated.markedBallotPdf,
    fixtures.markedBallotPath
  );
});
