import React from 'react';
import {
  assert,
  computeTallyWithPrecomputedCategories,
  filterTalliesByParty,
} from '@votingworks/utils';
import { Election, ExternalTally, Tally } from '@votingworks/types';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import {
  hasTextAcrossElements,
  parseCvrsFileContents,
} from '@votingworks/test-utils';
import { render, screen, within } from '@testing-library/react';

import { ContestTally } from './contest_tally';

function constructTally(cvrsFileContents: string, election: Election): Tally {
  const castVoteRecords = parseCvrsFileContents(cvrsFileContents);
  const { overallTally } = computeTallyWithPrecomputedCategories(
    election,
    new Set(castVoteRecords),
    []
  );
  return overallTally;
}

const { election } = electionMinimalExhaustiveSampleFixtures.electionDefinition;
const allPartiesScannedTally = constructTally(
  electionMinimalExhaustiveSampleFixtures.cvrData,
  election
);
const scannedTally = filterTalliesByParty({
  election,
  electionTally: allPartiesScannedTally,
  party: election.parties[1], // Fish Party
});

const candidateContestWithExternalDataId = 'best-animal-fish';
const candidateContestWithExternalData = election.contests.find(
  (c) => c.id === candidateContestWithExternalDataId
);
assert(candidateContestWithExternalData);
assert(candidateContestWithExternalData.type === 'candidate');

const yesNoContestWithExternalDataId = 'fishing';
const yesNoContestWithExternalData = election.contests.find(
  (c) => c.id === yesNoContestWithExternalDataId
);
assert(yesNoContestWithExternalData);
assert(yesNoContestWithExternalData.type === 'yesno');

const externalTally: ExternalTally = {
  contestTallies: {
    [candidateContestWithExternalDataId]: {
      contest: candidateContestWithExternalData,
      tallies: {
        salmon: {
          option: candidateContestWithExternalData.candidates[0],
          tally: 1,
        },
        seahorse: {
          option: candidateContestWithExternalData.candidates[1],
          tally: 1,
        },
      },
      metadata: {
        overvotes: 1,
        undervotes: 1,
        ballots: 4,
      },
    },
    [yesNoContestWithExternalDataId]: {
      contest: yesNoContestWithExternalData,
      tallies: {
        yes: {
          option: ['yes'],
          tally: 1,
        },
        no: {
          option: ['no'],
          tally: 1,
        },
      },
      metadata: {
        overvotes: 1,
        undervotes: 1,
        ballots: 4,
      },
    },
  },
  numberOfBallotsCounted: 4,
};

test('shows correct results for candidate contest with only scanned results', () => {
  render(<ContestTally election={election} scannedTally={scannedTally} />);
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText('Best Animal');
  within(bestAnimalFish).getByText(/1510 ballots cast/);
  within(bestAnimalFish).getByText(/119 overvotes/);
  within(bestAnimalFish).getByText(/120 undervotes/);
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse73'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Salmon1198'));
});

test('adds external results', () => {
  render(
    <ContestTally
      election={election}
      scannedTally={scannedTally}
      otherExternalTallies={[externalTally]}
    />
  );
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText('Best Animal');
  within(bestAnimalFish).getByText(/1514 ballots cast/);
  within(bestAnimalFish).getByText(/120 overvotes/);
  within(bestAnimalFish).getByText(/121 undervotes/);
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse74'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Salmon1199'));
});

test('adds manual results', () => {
  render(
    <ContestTally
      election={election}
      scannedTally={scannedTally}
      manualTally={externalTally}
    />
  );
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText('Best Animal');
  within(bestAnimalFish).getByText(
    hasTextAcrossElements('Ballots Cast151041514')
  );
  within(bestAnimalFish).getByText(hasTextAcrossElements('Overvotes1191120'));
  within(bestAnimalFish).getByText(
    hasTextAcrossElements('Ballots Cast151041514')
  );
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse73174'));
  within(bestAnimalFish).getByText(hasTextAcrossElements('Salmon119811199'));
});

test('displays yes/no contests correctly', () => {
  render(
    <ContestTally
      election={election}
      scannedTally={scannedTally}
      manualTally={externalTally}
      otherExternalTallies={[externalTally]}
    />
  );
  const fishing = screen.getByTestId('results-table-fishing');
  within(fishing).getByText('Ballot Measure 3');
  within(fishing).getByText(hasTextAcrossElements('Ballots Cast151441518'));
  within(fishing).getByText(hasTextAcrossElements('Overvotes74175'));
  within(fishing).getByText(hasTextAcrossElements('Undervotes119911200'));
  within(fishing).getByText(hasTextAcrossElements('Yes1211122'));
  within(fishing).getByText(hasTextAcrossElements('No1201121'));
});

test('specifies number of seats if relevant', () => {
  render(<ContestTally election={election} scannedTally={scannedTally} />);
  const zooCouncil = screen.getByTestId('results-table-aquarium-council-fish');
  within(zooCouncil).getByText('(2 seats)');
  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  expect(within(bestAnimalFish).queryAllByText(/seat/)).toHaveLength(0);
});
