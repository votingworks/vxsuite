import { afterAll, beforeAll, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers.js';
import { miCombinedBallotPrimaryElectionFixtures } from './ballot_fixtures.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import { RendererPool } from './renderer.js';

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
