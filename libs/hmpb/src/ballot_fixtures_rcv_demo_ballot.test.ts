import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readElection } from '@votingworks/fs';
import { expectToMatchSavedPdf } from '../test/helpers';
import { rcvDemoBallotFixtures } from './ballot_fixtures';
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

// run `pnpm generate-fixtures --rcv-demo-ballot` if this test fails
test('RCV demo ballot fixtures', async () => {
  const fixtures = rcvDemoBallotFixtures;
  const generated = await rcvDemoBallotFixtures.generate(rendererPool);

  expect(generated.electionDefinition.election).toEqual(
    (await readElection(fixtures.electionPath)).ok()?.election
  );

  expect(
    generated.electionPackageZip.equals(
      await readFile(fixtures.electionPackagePath)
    )
  ).toEqual(true);

  await expectToMatchSavedPdf(
    generated.blankBallotPdf,
    fixtures.blankBallotPath
  );
  await expectToMatchSavedPdf(
    generated.markedBallotPdf,
    fixtures.markedBallotPath
  );
});
