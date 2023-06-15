import React from 'react';
import { buildContestResultsFixture } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { assert } from '@votingworks/basics';
import { render, screen, within } from '../../test/react_testing_library';

import { ContestResultsTable } from './contest_results_table';

const { election } = electionMinimalExhaustiveSampleFixtures.electionDefinition;

// candidate contest without write-in
const candidateContestId = 'best-animal-fish';
const candidateContest = election.contests.find(
  (c) => c.id === candidateContestId
);
assert(candidateContest);
assert(candidateContest.type === 'candidate');

// candidate contest with write-in
const candidateWriteInContestId = 'zoo-council-mammal';
const candidateWriteInContest = election.contests.find(
  (c) => c.id === candidateWriteInContestId
);
assert(candidateWriteInContest);
assert(candidateWriteInContest.type === 'candidate');

const yesNoContestId = 'fishing';
const yesNoContest = election.contests.find((c) => c.id === yesNoContestId);
assert(yesNoContest);
assert(yesNoContest.type === 'yesno');

const candidateContestScannedResults = buildContestResultsFixture({
  contest: candidateContest,
  contestResultsSummary: {
    type: 'candidate',
    ballots: 20,
    overvotes: 1,
    undervotes: 2,
    officialOptionTallies: {
      seahorse: 7,
      salmon: 10,
    },
  },
});

const candidateContestManualResults = buildContestResultsFixture({
  contest: candidateContest,
  contestResultsSummary: {
    type: 'candidate',
    ballots: 15,
    overvotes: 3,
    undervotes: 4,
    officialOptionTallies: {
      seahorse: 6,
      salmon: 2,
    },
  },
});

test('candidate contest with only scanned results', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={candidateContest}
      scannedContestResults={candidateContestScannedResults}
    />
  );
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText('Best Animal');
  within(bestAnimalFish).getByText(/20 ballots cast/);
  within(bestAnimalFish).getByText(/1 overvote/);
  within(bestAnimalFish).getByText(/2 undervotes/);
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse7'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Salmon10'));

  // as single seat contest, should not show seat count
  expect(within(bestAnimalFish).queryAllByText(/seat/)).toHaveLength(0);
});

test('candidate contest with manual results', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={candidateContest}
      scannedContestResults={candidateContestScannedResults}
      manualContestResults={candidateContestManualResults}
    />
  );
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText('Best Animal');
  within(bestAnimalFish).getByText(hasTextAcrossElements('Ballots Cast201535'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Overvotes134'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Undervotes246'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse7613'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Salmon10212'));
});

const yesNoContestScannedResults = buildContestResultsFixture({
  contest: yesNoContest,
  contestResultsSummary: {
    type: 'yesno',
    ballots: 30,
    overvotes: 17,
    undervotes: 1,
    yesTally: 4,
    noTally: 8,
  },
});

const yesNoContestManualResults = buildContestResultsFixture({
  contest: yesNoContest,
  contestResultsSummary: {
    type: 'yesno',
    ballots: 20,
    overvotes: 1,
    undervotes: 0,
    yesTally: 19,
    noTally: 0,
  },
});

test('yes/no contests with scanned results only', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={yesNoContest}
      scannedContestResults={yesNoContestScannedResults}
    />
  );
  const fishing = screen.getByTestId('results-table-fishing');
  within(fishing).getByText('Ballot Measure 3');
  within(fishing).getByText(/30 ballots cast/);
  within(fishing).getByText(/17 overvotes/);
  within(fishing).getByText(/1 undervote/);
  within(fishing).getByText(hasTextAcrossElements('Yes4'));
  within(fishing).getByText(hasTextAcrossElements('No8'));
});

test('yes/no contests with manual results', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={yesNoContest}
      scannedContestResults={yesNoContestScannedResults}
      manualContestResults={yesNoContestManualResults}
    />
  );
  const fishing = screen.getByTestId('results-table-fishing');
  within(fishing).getByText('Ballot Measure 3');
  within(fishing).getByText(hasTextAcrossElements('Ballots Cast302050'));
  within(fishing).getByText(hasTextAcrossElements('Overvotes17118'));
  within(fishing).getByText(hasTextAcrossElements('Undervotes101'));
  within(fishing).getByText(hasTextAcrossElements('Yes41923'));
  within(fishing).getByText(hasTextAcrossElements('No808'));
});

test('candidates contests show number of seats and/or write-in candidate if relevant', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={candidateWriteInContest}
      scannedContestResults={buildContestResultsFixture({
        contest: candidateWriteInContest,
        contestResultsSummary: {
          type: 'candidate',
          ballots: 20,
          overvotes: 10,
          undervotes: 10,
        },
      })}
    />
  );
  const zooCouncil = screen.getByTestId('results-table-zoo-council-mammal');
  within(zooCouncil).getByText('(3 seats)');
  within(zooCouncil).getByText(hasTextAcrossElements('Write-In0'));
});
