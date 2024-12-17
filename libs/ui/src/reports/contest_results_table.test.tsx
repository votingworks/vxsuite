import { buildContestResultsFixture } from '@votingworks/utils';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { assert } from '@votingworks/basics';
import { render, screen, within } from '../../test/react_testing_library';

import { ContestResultsTable } from './contest_results_table';

const election = electionTwoPartyPrimaryFixtures.readElection();

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
  within(bestAnimalFish).getByText(/Vote for 1/);
  within(bestAnimalFish).getByText(/For three years/);
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
  within(bestAnimalFish).getByText(/Vote for 1/);
  within(bestAnimalFish).getByText(/For three years/);
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
  within(fishing).getByText(hasTextAcrossElements('YES4'));
  within(fishing).getByText(hasTextAcrossElements('NO8'));
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
  within(fishing).getByText(hasTextAcrossElements('YES41923'));
  within(fishing).getByText(hasTextAcrossElements('NO808'));
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
  within(zooCouncil).getByText('Vote for 3');
  within(zooCouncil).getByText(hasTextAcrossElements('Write-In0'));
});

test('numbers are formatted with commas when necessary', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={yesNoContest}
      scannedContestResults={buildContestResultsFixture({
        contest: yesNoContest,
        contestResultsSummary: {
          type: 'yesno',
          ballots: 6000,
          overvotes: 1000,
          undervotes: 1500,
          yesTally: 3000,
          noTally: 500,
        },
      })}
    />
  );
  const fishing = screen.getByTestId('results-table-fishing');
  within(fishing).getByText('Ballot Measure 3');
  within(fishing).getByText(hasTextAcrossElements(/6,000 ballots cast/));
  within(fishing).getByText(hasTextAcrossElements(/1,000 overvotes/));
  within(fishing).getByText(hasTextAcrossElements(/1,500 undervotes/));
  within(fishing).getByText(hasTextAcrossElements('YES3,000'));
  within(fishing).getByText(hasTextAcrossElements('NO500'));
});

test('uses write-in adjudication aggregation', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={candidateWriteInContest}
      scannedContestResults={buildContestResultsFixture({
        contest: candidateWriteInContest,
        contestResultsSummary: {
          type: 'candidate',
          ballots: 6000,
          overvotes: 1000,
          undervotes: 1500,
          officialOptionTallies: {
            zebra: 50,
            lion: 50,
            elephant: 50,
          },
          writeInOptionTallies: {
            'write-in-1': {
              name: 'Giraffe',
              tally: 40,
            },
            'write-in-2': {
              name: 'Gazelle',
              tally: 20,
            },
          },
        },
      })}
    />
  );
  const fishing = screen.getByTestId('results-table-zoo-council-mammal');
  within(fishing).getByText(hasTextAcrossElements('Zebra50'));
  within(fishing).getByText(hasTextAcrossElements('Lion50'));
  within(fishing).getByText(hasTextAcrossElements('Elephant50'));
  within(fishing).getByText(hasTextAcrossElements('Giraffe (Write-In)40'));
  within(fishing).getByText(hasTextAcrossElements('Other Write-In20'));
});

test('doesnt show term description if none given', () => {
  render(
    <ContestResultsTable
      election={election}
      contest={{ ...candidateContest, termDescription: undefined }}
      scannedContestResults={candidateContestScannedResults}
    />
  );
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText(/Vote for 1/);
  expect(
    within(bestAnimalFish).queryByText(/For three years/)
  ).not.toBeInTheDocument();
});
