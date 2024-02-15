import './polyfills';
import { range } from '@votingworks/basics';
import { MiniElection, ballotPageTemplate, pageDimensions } from './template';
import { renderBallotToPdf } from './render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';

export async function main(): Promise<void> {
  const election: MiniElection = {
    title: 'Mini Election',
    contests: range(0, 10).map((i) => ({
      title: `Contest ${i + 1}`,
      candidates: range(0, 5).map((j) => `Candidate ${i + 1}-${j + 1}`),
    })),
  };
  const renderer = createBrowserPreviewRenderer();
  await renderBallotToPdf(
    renderer,
    ballotPageTemplate,
    { election },
    { pageDimensions }
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
