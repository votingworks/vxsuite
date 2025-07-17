import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { vxFamousNamesFixtures } from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';

vi.setConfig({
  testTimeout: 20_000,
});

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

// run `pnpm generate-fixtures` if this test fails
test('famous names fixtures', async () => {
  const fixtures = vxFamousNamesFixtures;
  const generated = await vxFamousNamesFixtures.generate(renderer);

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
});
