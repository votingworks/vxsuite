import React from 'react';
import { render, getByText as domGetByText } from '@testing-library/react';

import { Tally, VotingMethod } from '@votingworks/types';
import {
  electionSampleDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';

import { TallyReportSummary } from './tally_report_summary';

test('Renders with data source table and voting method table when all data provided', () => {
  const ballotCounts: Tally['ballotCountsByVotingMethod'] = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 12,
  };
  const { getByText, getByTestId } = render(
    <TallyReportSummary
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts}
      election={electionSampleDefinition.election}
    />
  );

  getByText('Ballots by Voting Method');
  const votingMethodTable = getByTestId('voting-method-table');
  const row1 = domGetByText(votingMethodTable, 'Absentee').closest('tr')!;
  domGetByText(row1, '1,200');
  const row2 = domGetByText(votingMethodTable, 'Precinct').closest('tr')!;
  domGetByText(row2, '1,045');
  const row3 = domGetByText(votingMethodTable, 'Other').closest('tr')!;
  domGetByText(row3, '12');
  const row5 = domGetByText(votingMethodTable, 'Total Ballots Cast').closest(
    'tr'
  )!;
  domGetByText(row5, '3,579');
});

test('Hides the other row in the voting method table when empty', () => {
  const ballotCounts: Tally['ballotCountsByVotingMethod'] = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 0,
  };
  const { queryAllByText, unmount } = render(
    <TallyReportSummary
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts}
      election={electionSampleDefinition.election}
    />
  );
  expect(queryAllByText('Other').length).toEqual(0);

  unmount();

  const ballotCounts2: Tally['ballotCountsByVotingMethod'] = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
  };
  const { queryAllByText: queryAllByText2 } = render(
    <TallyReportSummary
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts2}
      election={electionSampleDefinition.election}
    />
  );
  expect(queryAllByText2('Other').length).toEqual(0);
});

test('Is empty element if voting methods cannot be distinguished for election', () => {
  const ballotCounts: Tally['ballotCountsByVotingMethod'] = {
    [VotingMethod.Absentee]: 1200,
    [VotingMethod.Precinct]: 1045,
    [VotingMethod.Unknown]: 12,
  };
  const { queryByText } = render(
    <TallyReportSummary
      totalBallotCount={3579}
      ballotCountsByVotingMethod={ballotCounts}
      election={electionGridLayoutNewHampshireAmherstFixtures.election}
    />
  );

  expect(queryByText('Ballots by Voting Method')).toBeNull();
});
