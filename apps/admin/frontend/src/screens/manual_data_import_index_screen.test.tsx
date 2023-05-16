import React from 'react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { Router, Route } from 'react-router-dom';

import {
  ContestOptionTally,
  ContestTally,
  ManualTally,
  FullElectionManualTally,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, within } from '../../test/react_testing_library';
import { ManualDataImportIndexScreen } from './manual_data_import_index_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  getEmptyManualTalliesByPrecinct,
  getEmptyManualTally,
} from '../utils/manual_tallies';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('precinct table renders properly when there is no data', () => {
  const history = createMemoryHistory();
  const { getByText, getByTestId } = renderInAppContext(
    <Router history={history}>
      <ManualDataImportIndexScreen />
    </Router>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
      apiMock,
    }
  );
  getByText('Manually Entered Results');
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
  fireEvent.click(getByText('Edit Results for Center Springfield'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-import/precinct/23'
  );
  fireEvent.click(getByText('Edit Results for North Springfield'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-import/precinct/21'
  );
});

test('loads preexisting manual data to edit', async () => {
  const talliesByPrecinct = getEmptyManualTalliesByPrecinct(
    electionSampleDefinition.election
  );
  talliesByPrecinct['23'] = {
    numberOfBallotsCounted: 100,
    contestTallies: {
      ...(talliesByPrecinct['23']?.contestTallies ?? {}),
      'county-commissioners': {
        ...(talliesByPrecinct['23']?.contestTallies['county-commissioners'] ??
          {}),
        tallies: {
          argent: { tally: 80 } as unknown as ContestOptionTally,
          'write-in': { tally: 60 } as unknown as ContestOptionTally,
          witherspoonsmithson: { tally: 40 } as unknown as ContestOptionTally,
        },
        metadata: { undervotes: 220, overvotes: 0, ballots: 100 },
      } as unknown as ContestTally,
      'judicial-robert-demergue': {
        ...(talliesByPrecinct['23']?.contestTallies[
          'judicial-robert-demergue'
        ] ?? {}),
        tallies: {
          yes: { option: ['yes'], tally: 40 },
          no: { option: ['no'], tally: 30 },
        },
        metadata: { ballots: 100, undervotes: 12, overvotes: 8 },
      } as unknown as ContestTally,
    },
  };
  talliesByPrecinct['20'] = {
    numberOfBallotsCounted: 50,
    contestTallies: {
      ...(talliesByPrecinct['20']?.contestTallies ?? {}),
      'primary-constitution-head-of-party': {
        ...(talliesByPrecinct['20']?.contestTallies[
          'primary-constitution-head-of-party'
        ] ?? {}),
        tallies: {
          alice: { tally: 25 } as unknown as ContestOptionTally,
          bob: { tally: 5 } as unknown as ContestOptionTally,
        },
        metadata: { undervotes: 4, overvotes: 6, ballots: 40 },
      } as unknown as ContestTally,
    },
  };
  talliesByPrecinct['21'] = {
    numberOfBallotsCounted: 7,
    contestTallies: {
      ...(talliesByPrecinct['21']?.contestTallies ?? {}),
      'judicial-robert-demergue': {
        ...(talliesByPrecinct['21']?.contestTallies[
          'judicial-robert-demergue'
        ] ?? {}),
        tallies: {
          yes: { option: ['yes'], tally: 4 },
          no: { option: ['no'], tally: 3 },
        },
        metadata: { ballots: 7, undervotes: 0, overvotes: 0 },
      } as unknown as ContestTally,
    },
  };
  const overallTally: ManualTally = {
    ...getEmptyManualTally(),
    numberOfBallotsCounted: 100,
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);
  const manualTally: FullElectionManualTally = {
    overallTally,
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    timestampCreated: new Date(),
  };
  apiMock.expectGetCastVoteRecordFiles([]);
  const { getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportIndexScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
      manualTallyVotingMethod: VotingMethod.Absentee,
      fullElectionManualTally: manualTally,
      apiMock,
    }
  );
  await screen.findByText('Manually Entered Results');

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

  apiMock.expectDeleteAllManualTallies();
  userEvent.click(await screen.findByText('Clear Manual Data'));
  userEvent.click(await screen.findByText('Remove Manual Data'));

  await advanceTimersAndPromises();
});
