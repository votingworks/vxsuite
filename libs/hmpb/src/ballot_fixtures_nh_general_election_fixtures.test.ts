import { iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { nhGeneralElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';
import { expectToMatchSavedPdf } from '../test/helpers';

vi.setConfig({
  testTimeout: 120_000,
});

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.close();
});

// run `pnpm generate-fixtures` if this test fails
test('NH general election fixtures', async () => {
  const fixtures = nhGeneralElectionFixtures;
  const allGenerated = await fixtures.generate(renderer, fixtures.fixtureSpecs);
  for (const [spec, generated] of iter(fixtures.fixtureSpecs).zip(
    allGenerated
  )) {
    expect(generated.electionDefinition.election).toEqual(
      (await readElection(spec.electionPath)).ok()?.election
    );

    await expectToMatchSavedPdf(generated.blankBallotPdf, spec.blankBallotPath);
    await expectToMatchSavedPdf(
      generated.markedBallotPdf,
      spec.markedBallotPath
    );
  }
});
