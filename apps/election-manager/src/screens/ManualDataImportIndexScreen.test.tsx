import React from 'react';
import {
  multiPartyPrimaryElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {advanceTimersAndPromises} from '@votingworks/test-utils';
import {createMemoryHistory} from 'history';
import {Router, Route} from 'react-router-dom';
import {fireEvent, within} from '@testing-library/react';

import ManualDataImportIndexScreen from './ManualDataImportIndexScreen';
import renderInAppContext from '../../test/renderInAppContext';
import {
  ContestOptionTally,
  ContestTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  ResultsFileType,
  TallyCategory,
  VotingMethod,
} from '../config/types';
import {
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
} from '../utils/externalTallies';

jest.useFakeTimers();

test('can toggle ballot types for data', async () => {
  const saveExternalTallies = jest.fn();
  const {getByText, getByTestId} = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportIndexScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: multiPartyPrimaryElectionDefinition,
      saveExternalTallies,
    }
  );
  getByText('Manually Entered Precinct Results');

  // Precinct ballots should be selected by default but should be able to toggle to absentee.
  expect(getByTestId('ballottype-precinct').closest('button')).toBeDisabled();
  expect(
    getByTestId('ballottype-absentee').closest('button')
  ).not.toBeDisabled();
  getByText('Edit Precinct Results for Precinct 5');

  fireEvent.click(getByTestId('ballottype-absentee'));
  expect(
    getByTestId('ballottype-precinct').closest('button')
  ).not.toBeDisabled();
  expect(getByTestId('ballottype-absentee').closest('button')).toBeDisabled();
  getByText('Edit Absentee Results for Precinct 5');

  expect(saveExternalTallies).toHaveBeenCalled();
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      source: ExternalTallySourceType.Manual,
      votingMethod: VotingMethod.Absentee,
    }),
  ]);

  fireEvent.click(getByTestId('ballottype-precinct'));
  expect(saveExternalTallies).toHaveBeenCalledTimes(2);
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      source: ExternalTallySourceType.Manual,
      votingMethod: VotingMethod.Precinct,
    }),
  ]);
  getByText('Edit Precinct Results for Precinct 5');
});

test('precinct table renders properly when there is no data', async () => {
  const saveExternalTallies = jest.fn();
  const history = createMemoryHistory();
  const {getByText, getByTestId} = renderInAppContext(
    <Router history={history}>
      <ManualDataImportIndexScreen />
    </Router>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
      saveExternalTallies,
    }
  );
  getByText('Manually Entered Precinct Results');
  // Everything should start as 0s
  const summaryTable = getByTestId('summary-data');
  const centerSpringfield = within(summaryTable)
    .getByText('Center Springfield')
    .closest('tr')!;
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  );
  const southSpringfield = within(summaryTable)
    .getByText('South Springfield')
    .closest('tr')!;
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  );
  const northSpringfield = within(summaryTable)
    .getByText('North Springfield')
    .closest('tr')!;
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  );
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('0');
  fireEvent.click(getByText('Edit Precinct Results for Center Springfield'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-import/precinct/23'
  );
  fireEvent.click(getByText('Edit Precinct Results for North Springfield'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-import/precinct/21'
  );
});

test('loads prexisting manual data to edit', async () => {
  const talliesByPrecinct = getEmptyExternalTalliesByPrecinct(
    electionSampleDefinition.election
  );
  talliesByPrecinct['23'] = {
    numberOfBallotsCounted: 100,
    contestTallies: {
      ...talliesByPrecinct['23']?.contestTallies,
      'county-commissioners': ({
        ...talliesByPrecinct['23']?.contestTallies['county-commissioners'],
        tallies: {
          argent: {tally: 80} as ContestOptionTally,
          '__write-in': {tally: 60} as ContestOptionTally,
          witherspoonsmithson: {tally: 40} as ContestOptionTally,
        },
        metadata: {undervotes: 220, overvotes: 0, ballots: 100},
      } as unknown) as ContestTally,
      'judicial-robert-demergue': ({
        ...talliesByPrecinct['23']?.contestTallies['judicial-robert-demergue'],
        tallies: {
          yes: {option: ['yes'], tally: 40},
          no: {option: ['no'], tally: 30},
        },
        metadata: {ballots: 100, undervotes: 12, overvotes: 8},
      } as unknown) as ContestTally,
    },
  };
  talliesByPrecinct['20'] = {
    numberOfBallotsCounted: 50,
    contestTallies: {
      ...talliesByPrecinct['20']?.contestTallies,
      'primary-constitution-head-of-party': ({
        ...talliesByPrecinct['20']?.contestTallies[
          'primary-constitution-head-of-party'
        ],
        tallies: {
          alice: {tally: 25} as ContestOptionTally,
          bob: {tally: 5} as ContestOptionTally,
        },
        metadata: {undervotes: 4, overvotes: 6, ballots: 40},
      } as unknown) as ContestTally,
    },
  };
  talliesByPrecinct['21'] = {
    numberOfBallotsCounted: 7,
    contestTallies: {
      ...talliesByPrecinct['21']?.contestTallies,
      'judicial-robert-demergue': ({
        ...talliesByPrecinct['21']?.contestTallies['judicial-robert-demergue'],
        tallies: {
          yes: {option: ['yes'], tally: 4},
          no: {option: ['no'], tally: 3},
        },
        metadata: {ballots: 7, undervotes: 0, overvotes: 0},
      } as unknown) as ContestTally,
    },
  };
  const overallTally = {
    ...getEmptyExternalTally(),
    numberOfBallotsCounted: 100,
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);
  const externalTally: FullElectionExternalTally = {
    overallTally,
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    inputSourceName: 'Doesnt matter',
    source: ExternalTallySourceType.Manual,
    timestampCreated: new Date(),
  };
  const resetFiles = jest.fn();
  const {getByText, getByTestId} = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportIndexScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
      resetFiles,
      fullElectionExternalTallies: [externalTally],
    }
  );
  getByText('Manually Entered Absentee Results');
  // Absentee ballot type should be selected
  expect(
    getByTestId('ballottype-precinct').closest('button')
  ).not.toBeDisabled();
  expect(getByTestId('ballottype-absentee').closest('button')).toBeDisabled();

  // Make sure all the summary loaded as expected
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('157');
  const summaryTable = getByTestId('summary-data');
  const centerSpringfield = within(summaryTable)
    .getByText('Center Springfield')
    .closest('tr')!;
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '100'
  );

  const southSpringfield = within(summaryTable)
    .getByText('South Springfield')
    .closest('tr')!;
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '50'
  );

  const northSpringfield = within(summaryTable)
    .getByText('North Springfield')
    .closest('tr')!;
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '7'
  );

  fireEvent.click(getByText('Clear Manual Data…'));
  fireEvent.click(getByText('Remove Manual Data'));

  expect(resetFiles).toHaveBeenCalledWith(ResultsFileType.Manual);

  await advanceTimersAndPromises();
});
