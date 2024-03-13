import './polyfills';
import { BallotType } from '@votingworks/types';
import { electionGeneral } from '@votingworks/fixtures';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';
import { BaseBallotProps, renderBallotPreviewToPdf } from './render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';

const election = electionGeneral;
const ballotStyle = election.ballotStyles[0];
const precinct = election.precincts[0];
const exampleBallotProps: BaseBallotProps = {
  election,
  ballotStyle,
  precinct,
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

export async function main(): Promise<void> {
  const renderer = createBrowserPreviewRenderer();
  await renderBallotPreviewToPdf(
    renderer,
    vxDefaultBallotTemplate,
    exampleBallotProps
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
