import React from 'react';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

import userEvent from '@testing-library/user-event';
import { screen, within } from '../../test/react_testing_library';
import { ManualDataSummaryScreen } from './manual_data_summary_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test('navigating back to tally page', async () => {
  const history = createMemoryHistory();
  apiMock.expectGetManualResultsMetadata([]);
  renderInAppContext(
    <Router history={history}>
      <ManualDataSummaryScreen />
    </Router>,
    {
      route: '/tally/manual-data-summary',
      electionDefinition,
      apiMock,
    }
  );
  await screen.findByText('Total Manual Ballot Count: 0');
  userEvent.click(screen.getButton('Back to Tally'));
  expect(history.location.pathname).toEqual('/tally');
});

test('initial table without manual tallies & adding a manual tally', async () => {
  const history = createMemoryHistory();
  apiMock.expectGetManualResultsMetadata([]);
  renderInAppContext(
    <Router history={history}>
      <ManualDataSummaryScreen />
    </Router>,
    {
      route: '/tally/manual-data-summary',
      electionDefinition,
      apiMock,
    }
  );
  await screen.findByText('Total Manual Ballot Count: 0');
  expect(
    screen.getButton('Remove All Manually Entered Results')
  ).toBeDisabled();

  // adding a manual tally
  expect(screen.getButton('Add Results')).toBeDisabled();
  expect(screen.getByTestId('selectBallotType')).toBeDisabled();
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();

  const ballotStylePicker = await screen.findByTestId('selectBallotStyle');
  userEvent.selectOptions(ballotStylePicker, '1M');
  screen.getByRole('option', { name: '1M', selected: true });

  expect(screen.getButton('Add Results')).toBeDisabled();
  expect(screen.getByTestId('selectBallotType')).toBeDisabled();

  const precinctPicker = await screen.findByTestId('selectPrecinct');
  userEvent.selectOptions(precinctPicker, 'Precinct 1');
  screen.getByRole('option', { name: 'Precinct 1', selected: true });

  expect(screen.getButton('Add Results')).toBeDisabled();

  const ballotTypePicker = await screen.findByTestId('selectBallotType');
  userEvent.selectOptions(ballotTypePicker, 'Precinct');
  screen.getByRole('option', { name: 'Precinct', selected: true });

  userEvent.click(screen.getButton('Add Results'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-entry/1M/precinct/precinct-1'
  );
});

test('link to edit an existing tally', async () => {
  const history = createMemoryHistory();
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
  ]);
  renderInAppContext(
    <Router history={history}>
      <ManualDataSummaryScreen />
    </Router>,
    {
      route: '/tally/manual-data-summary',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(
    screen.getButton('Remove All Manually Entered Results')
  ).not.toBeDisabled();

  userEvent.click(screen.getButton('Edit Results'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-entry/1M/precinct/precinct-1'
  );
});

test('delete an existing tally', async () => {
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
  ]);
  renderInAppContext(<ManualDataSummaryScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(
    screen.getButton('Remove All Manually Entered Results')
  ).not.toBeDisabled();

  userEvent.click(screen.getButton('Remove Results'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(hasTextAcrossElements(/Ballot Style: 1M/));
  within(modal).getByText(hasTextAcrossElements(/Precinct: Precinct 1/));
  within(modal).getByText(hasTextAcrossElements(/Voting Method: Precinct/));

  // expect delete request and refetch
  apiMock.expectDeleteManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    ballotType: 'precinct',
  });
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(screen.getButton('Remove Manually Entered Results'));
});

test('full table & clearing all data', async () => {
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '2F',
      precinctId: 'precinct-2',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
    {
      ballotStyleId: '2F',
      precinctId: 'precinct-1',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-2',
      ballotType: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
  ]);
  renderInAppContext(<ManualDataSummaryScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 40');
  expect(
    screen.getButton('Remove All Manually Entered Results')
  ).not.toBeDisabled();

  // adding row should be gone
  expect(screen.queryByTestId('selectBallotStyle')).not.toBeInTheDocument();
  expect(screen.queryByTestId('selectPrecinct')).not.toBeInTheDocument();
  expect(screen.queryByTestId('selectBallotType')).not.toBeInTheDocument();
  expect(screen.queryByText('Add Results')).not.toBeInTheDocument();

  // existing entries
  expect(screen.getAllButtons('Edit Results')).toHaveLength(4);
  expect(screen.getAllButtons('Remove Results')).toHaveLength(4);

  // clearing all results
  userEvent.click(screen.getButton('Remove All Manually Entered Results'));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(
    within(modal).getButton('Remove All Manually Entered Results')
  );

  await screen.findByText('Add Results');
  screen.getByTestId('selectBallotStyle');
  screen.getByTestId('selectPrecinct');
  screen.getByTestId('selectBallotType');
});
