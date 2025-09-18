import { iter } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { vxGeneralElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 60_000,
});

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});

afterAll(async () => {
  await rendererPool.close();
});

// run `pnpm generate-fixtures` if this test fails
test.each(Object.values(HmpbBallotPaperSize))(
  'VX general election fixtures: %s',
  async (paperSize) => {
    const allFixtures = vxGeneralElectionFixtures;
    const specs = allFixtures.fixtureSpecs.filter(
      (spec) => spec.paperSize === paperSize
    );
    const allGenerated = await vxGeneralElectionFixtures.generate(
      rendererPool,
      specs
    );
    for (const [spec, generated] of iter(specs).zip(allGenerated)) {
      expect(generated.electionDefinition.election).toEqual(
        (await readElection(spec.electionPath)).ok()?.election
      );

      await expectToMatchSavedPdf(
        generated.blankBallotPdf,
        spec.blankBallotPath
      );
      await expectToMatchSavedPdf(
        generated.markedBallotPdf,
        spec.markedBallotPath
      );
    }
  }
);
