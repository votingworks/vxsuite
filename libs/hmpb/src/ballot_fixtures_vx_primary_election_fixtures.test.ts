import { afterAll, beforeAll, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { vxPrimaryElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

// run `pnpm generate-fixtures` if this test fails
test('VX primary election fixtures', async () => {
  const fixtures = vxPrimaryElectionFixtures;
  const generated = await vxPrimaryElectionFixtures.generate(renderer);

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
