import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { vxFamousNamesFixtures } from './ballot_fixtures';
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
test('famous names fixtures', async () => {
  const fixtures = vxFamousNamesFixtures;
  const generated = await vxFamousNamesFixtures.generate(rendererPool);

  expect(generated.electionDefinition.election).toEqual(
    fixtures.electionDefinition.election
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
    generated.blankOfficialBallotPdf,
    fixtures.blankOfficialBallotPath
  );
  await expectToMatchSavedPdf(
    generated.markedOfficialBallotPdf,
    fixtures.markedOfficialBallotPath
  );
});
