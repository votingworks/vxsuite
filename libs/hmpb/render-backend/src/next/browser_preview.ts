import './polyfills';
import { BallotType } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { BallotProps, ballotPageTemplate, pageDimensions } from './template';
import { renderBallotToPdf } from './render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';

const { election } = electionFamousNames2021Fixtures;
const ballotStyle = election.ballotStyles[0];
const precinct = election.precincts[0];
export const exampleBallotProps: BallotProps = {
  election,
  ballotStyle,
  precinct,
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

export async function main(): Promise<void> {
  const renderer = createBrowserPreviewRenderer();
  await renderBallotToPdf(renderer, ballotPageTemplate, exampleBallotProps, {
    pageDimensions,
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
