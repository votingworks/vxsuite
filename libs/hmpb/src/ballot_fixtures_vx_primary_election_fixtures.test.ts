import { afterAll, beforeAll, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { vxPrimaryElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});

afterAll(async () => {
  await rendererPool.close();
});

// run `pnpm generate-fixtures` if this test fails
test('VX primary election fixtures', async () => {
  const fixtures = vxPrimaryElectionFixtures;
  const generated = await vxPrimaryElectionFixtures.generate(rendererPool);

  for (const party of ['mammalParty', 'fishParty'] as const) {
    const partyFixtures = fixtures[party];
    const partyGenerated = generated[party];

    await expectToMatchSavedPdf(
      partyGenerated.blankBallotPdf,
      partyFixtures.blankBallotPath
    );
    await expectToMatchSavedPdf(
      partyGenerated.otherPrecinctBlankBallotPdf,
      partyFixtures.otherPrecinctBlankBallotPath
    );
    await expectToMatchSavedPdf(
      partyGenerated.markedBallotPdf,
      partyFixtures.markedBallotPath
    );
  }
});
