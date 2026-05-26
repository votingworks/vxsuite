import { readElection } from '@votingworks/fs';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { nhStatePrimaryElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { expectToMatchSavedPdf } from '../test/helpers';
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
test('NH state primary election fixtures', async () => {
  const fixtures = nhStatePrimaryElectionFixtures;
  const generated = await fixtures.generate(rendererPool);

  expect(generated.electionDefinition.election).toEqual(
    (await readElection(fixtures.electionPath)).ok()?.election
  );

  for (const party of ['demParty', 'repParty'] as const) {
    const partyFixtures = fixtures[party];
    const partyGenerated = generated[party];
    await expectToMatchSavedPdf(
      partyGenerated.blankBallotPdf,
      partyFixtures.blankBallotPath
    );
    await expectToMatchSavedPdf(
      partyGenerated.markedBallotPdf,
      partyFixtures.markedBallotPath
    );
  }

  await expectToMatchSavedPdf(
    generated.demHandCountBlankBallotPdf,
    fixtures.demHandCountBlankBallotPath
  );
  await expectToMatchSavedPdf(
    generated.demFederalOfficeOnlyBlankBallotPdf,
    fixtures.demFederalOfficeOnlyBlankBallotPath
  );
});
