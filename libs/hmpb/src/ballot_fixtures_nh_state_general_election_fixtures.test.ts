import { readElection } from '@votingworks/fs';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { nhStateGeneralElectionFixtures } from './ballot_fixtures.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import { expectToMatchSavedPdf } from '../test/helpers.js';
import { RendererPool } from './renderer.js';

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
test('NH state general election fixtures', async () => {
  const fixtures = nhStateGeneralElectionFixtures;
  const generated = await fixtures.generate(rendererPool);

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
  await expectToMatchSavedPdf(
    generated.handCountBlankBallotPdf,
    fixtures.handCountBlankBallotPath
  );
  await expectToMatchSavedPdf(
    generated.federalOfficeOnlyBlankBallotPdf,
    fixtures.federalOfficeOnlyBlankBallotPath
  );
});
