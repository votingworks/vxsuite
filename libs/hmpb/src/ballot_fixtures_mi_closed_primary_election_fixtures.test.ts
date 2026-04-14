import { afterAll, beforeAll, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { miClosedPrimaryElectionFixtures } from './ballot_fixtures';
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

// run `pnpm generate-fixtures --mi-closed-primary-election` if this test fails
test('MI closed primary election fixtures', async () => {
  const fixtures = miClosedPrimaryElectionFixtures;
  const generated = await fixtures.generate(rendererPool);

  for (const party of [generated.mammalParty, generated.fishParty]) {
    await expectToMatchSavedPdf(party.blankBallotPdf, party.blankBallotPath);
    await expectToMatchSavedPdf(party.markedBallotPdf, party.markedBallotPath);
  }
});
