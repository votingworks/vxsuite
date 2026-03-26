import { HmpbBallotPaperSize } from '@votingworks/types';
import { afterAll, beforeAll, bench, describe } from 'vitest';
import { vxGeneralElectionFixtures } from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});

afterAll(async () => {
  await rendererPool.close();
});

describe('ballot PDF generation', () => {
  const specs = vxGeneralElectionFixtures.fixtureSpecs.filter(
    (spec) => spec.paperSize === HmpbBallotPaperSize.Letter
  );

  bench(
    'generate VX general election letter ballots',
    async () => {
      await vxGeneralElectionFixtures.generate(rendererPool, specs);
    },
    { iterations: 3, warmupIterations: 1, time: 0 }
  );
});
