import { iter } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { encodeImageData, pdfToImages } from '@votingworks/image-utils';
import { BallotType } from '@votingworks/types';
import { expect, test, vi } from 'vitest';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import {
  createPlaywrightRenderer,
  PlaywrightRenderer,
} from './playwright_renderer';
import { renderBallotPreviewToPdf } from './render_ballot';

// eslint-disable-next-line vitest/valid-title
const rendererTest = test.extend<{ renderer: PlaywrightRenderer }>({
  // eslint-disable-next-line no-empty-pattern
  renderer: async ({}, use) => {
    const renderer = await createPlaywrightRenderer();
    await use(renderer);
    await renderer.cleanup();
  },
});

vi.setConfig({
  testTimeout: 120_000,
});

rendererTest('watermark', async ({ renderer }) => {
  const election = electionFamousNames2021Fixtures.readElection();
  const ballotStyle = election.ballotStyles[0];
  const pdf = (
    await renderBallotPreviewToPdf(renderer, vxDefaultBallotTemplate, {
      election,
      ballotStyleId: ballotStyle.id,
      precinctId: ballotStyle.precincts[0],
      ballotType: BallotType.Precinct,
      ballotMode: 'sample',
      watermark: 'PROOF',
    })
  ).unsafeUnwrap();
  const firstPage = await iter(pdfToImages(pdf, { scale: 200 / 72 })).first();
  expect(
    await encodeImageData(firstPage!.page, 'image/png')
  ).toMatchImageSnapshot();
});
