import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { readElection } from '@votingworks/fs';
import { expectToMatchSavedPdf } from '../test/helpers';
import { msGeneralElectionFixtures } from './ballot_fixtures';
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

// run `pnpm generate-fixtures` if this test fails
test('MS general election fixtures', async () => {
  const fixtures = msGeneralElectionFixtures;
  const generated = await msGeneralElectionFixtures.generate(rendererPool);

  expect(generated.electionDefinition.election).toEqual(
    (await readElection(fixtures.electionPath)).ok()?.election
  );

  await expectToMatchSavedPdf(
    generated.blankBallotPdf,
    fixtures.blankBallotPath
  );
  await expectToMatchSavedPdf(
    generated.markedBallotPdf,
    fixtures.markedBallotPath
  );
});
