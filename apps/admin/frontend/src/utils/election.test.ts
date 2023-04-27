import { Admin } from '@votingworks/api';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { getDisplayElectionHash } from '@votingworks/types';
import { getBallotPath } from './election';

test('getBallotPath allows digits in file names', () => {
  expect(
    getBallotPath({
      electionDefinition: electionSampleDefinition,
      ballotStyleId: '77',
      precinctId: '21',
      locales: { primary: 'en-US' },
      ballotMode: Admin.BallotMode.Official,
      isAbsentee: true,
    })
  ).toEqual(
    `election-${getDisplayElectionHash(
      electionSampleDefinition
    )}-precinct-north-springfield-id-21-style-77-English-live-absentee.pdf`
  );
});
