import {
  BallotType,
  getBallotStyle,
  getContests,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, zip } from '@votingworks/utils';
import {
  AmherstFixtureName,
  readFixtureImage,
  readFixtureJson,
} from '../../test/fixtures';
import {
  getScannedBallotCardGeometry,
  ScannedBallotCardGeometry8pt5x14,
} from '../accuvote';
import { convertInterpretedLayoutToBallotLayout } from './convert_interpreted_layout_to_ballot_layout';
import { interpretBallotCardLayout } from './interpret_ballot_card_layout';

test('contains layout information for each contest option', async () => {
  const imageData = await readFixtureImage(
    AmherstFixtureName,
    'scan-unmarked-front',
    ScannedBallotCardGeometry8pt5x14
  );
  const electionData = await readFixtureJson(AmherstFixtureName, 'election');
  const electionDefinition =
    safeParseElectionDefinition(electionData).unsafeUnwrap();
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );

  const layout = interpretBallotCardLayout(imageData, {
    geometry,
  });
  assert(layout.metadata.side === 'front');

  const ballotStyleId = `card-number-${layout.metadata.cardNumber}`;
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });
  assert(ballotStyle);

  const convertedLayout = convertInterpretedLayoutToBallotLayout({
    gridLayout: electionDefinition.election.gridLayouts![0]!,
    contests: getContests({
      election: electionDefinition.election,
      ballotStyle,
    }),
    metadata: {
      ballotStyleId,
      precinctId: ballotStyle.precincts[0]!,
      ballotType: BallotType.Standard,
      isTestMode: false,
      electionHash: electionDefinition.electionHash,
      locales: { primary: 'unknown' },
      pageNumber: 1,
    },
    interpretedLayout: layout,
  }).unsafeUnwrap();

  const contests = getContests({
    election: electionDefinition.election,
    ballotStyle,
  }).slice(0, convertedLayout.contests.length);

  expect(convertedLayout.contests).toHaveLength(contests.length);
  for (const [contest, contestLayout] of zip(
    contests,
    convertedLayout.contests
  )) {
    expect(contestLayout.contestId).toStrictEqual(contest.id);

    if (contest.type === 'candidate') {
      expect(contestLayout.options).toHaveLength(
        contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
      );
    }
  }
});
