import {
  BallotPageMetadata,
  BallotType,
  getBallotStyle,
  getContests,
  BallotPageLayout,
} from '@votingworks/types';
import { electionDefinition } from '../../test/fixtures/state-of-hamilton';
import { getBallotPageContests } from './get_ballot_page_contests';

function metadataForPage(pageNumber: number): BallotPageMetadata {
  return {
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    pageNumber,
    locales: { primary: 'en-US', secondary: 'es-US' },
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
  };
}
test('gets contests broken across pages according to the layout', () => {
  const ballotStyle = getBallotStyle({
    ballotStyleId: '12',
    election: electionDefinition.election,
  })!;
  const allContestsForBallot = getContests({
    ballotStyle,
    election: electionDefinition.election,
  });
  const layouts = Array.from({ length: 5 }).map<BallotPageLayout>((_, i) => ({
    pageSize: { width: 1, height: 1 },
    metadata: metadataForPage(i),
    contests: [
      {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        corners: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        options: [],
      },
    ],
  }));

  for (let pageNumber = 1; pageNumber <= layouts.length; pageNumber += 1) {
    expect(
      getBallotPageContests(
        electionDefinition.election,
        metadataForPage(pageNumber),
        layouts
      )
    ).toEqual(allContestsForBallot.slice(pageNumber - 1, pageNumber));
  }
});
