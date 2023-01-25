import React from 'react';
import {
  assert,
  computeTallyWithPrecomputedCategories,
} from '@votingworks/utils';
import { ExternalTally, TallyCategory } from '@votingworks/types';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import {
  hasTextAcrossElements,
  parseCvrsFileContents,
} from '@votingworks/test-utils';
import cloneDeep from 'lodash.clonedeep';
import { render, screen, within } from '@testing-library/react';

import { ContestTally } from './contest_tally';

const { election } = electionMinimalExhaustiveSampleFixtures.electionDefinition;
const fullElectionTally = computeTallyWithPrecomputedCategories(
  election,
  new Set(
    parseCvrsFileContents(electionMinimalExhaustiveSampleFixtures.cvrData)
  ),
  [TallyCategory.Party]
);
const scannedTally = fullElectionTally.resultsByCategory.get(
  TallyCategory.Party
)?.['1'];
assert(scannedTally);

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

// We're not sure if we actually have places in the codebase where there could
// be undefined tallies for specific options, but our typing allows for it and
// we handle it.
const scannedTallyMissingTallies = cloneDeep(scannedTally);
scannedTallyMissingTallies.contestTallies['best-animal-fish']!.tallies[
  'seahorse'
] = undefined;
scannedTallyMissingTallies.contestTallies['fishing']!.tallies['yes'] =
  undefined;

test('shows X when missing tally for option', () => {
  render(
    <ContestTally
      election={election}
      scannedTally={scannedTallyMissingTallies}
    />
  );

  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText(hasTextAcrossElements('SeahorseX'));

  const fishing = screen.getByTestId('results-table-fishing');
  within(fishing).getByText(hasTextAcrossElements('YesX'));
});

// This case is probably impossible, including a test here for coverage. It
// requires a specific tally option having no defined results in the scanned
// results and that entire contest having no manual tally, yet manualTally
// being defined.
test('assumes scanned tally is 0 if it is missing and there is manual data', () => {
  const externalTallyMissingTallies = cloneDeep(externalTally);
  externalTallyMissingTallies.contestTallies['best-animal-fish'] = undefined;
  externalTallyMissingTallies.contestTallies['fishing'] = undefined;

  render(
    <ContestTally
      election={election}
      scannedTally={scannedTallyMissingTallies}
      manualTally={externalTallyMissingTallies}
    />
  );

  const bestAnimalFish = screen.getByTestId('results-table-best-animal-fish');
  within(bestAnimalFish).getByText(hasTextAcrossElements('Seahorse000'));
});
