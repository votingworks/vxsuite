import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

import userEvent from '@testing-library/user-event';
import { BallotStyleGroupId } from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import {
  ALL_MANUAL_TALLY_BALLOT_TYPES,
  ManualTalliesTab,
} from './manual_tallies_tab';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { mockManualResultsMetadata } from '../../../test/api_mock_data';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
const { election } = electionDefinition;

test('initial table without manual tallies & adding a manual tally', async () => {
  const history = createMemoryHistory();
  apiMock.expectGetManualResultsMetadata([]);
  renderInAppContext(
    <Router history={history}>
      <ManualTalliesTab />
    </Router>,
    {
      route: '/tally/manual',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('No manual tallies entered.');

  expect(
    screen.queryByRole('button', { name: 'Remove All Manual Tallies' })
  ).not.toBeInTheDocument();

  // adding a manual tally
  expect(screen.getButton('Enter Tallies')).toBeDisabled();
  expect(screen.getByLabelText('Voting Method')).toBeDisabled();
  expect(screen.getByLabelText('Precinct')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Ballot Style'));
  userEvent.click(screen.getByText('1-Ma'));

  expect(screen.getButton('Enter Tallies')).toBeDisabled();
  expect(screen.getByLabelText('Voting Method')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Precinct'));
  userEvent.click(screen.getByText('Precinct 1'));

  expect(screen.getButton('Enter Tallies')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Voting Method'));
  const options = screen.getByText('Absentee').parentElement!;
  userEvent.click(within(options).getByText('Precinct'));

  // Modal for uploading an ERR file. Functionality tested at component level.
  userEvent.click(screen.getButton('Import Results File'));
  screen.getByText('Insert a USB drive in order to import a results file.');
  userEvent.click(screen.getByText('Cancel'));

  // Entering data manually
  userEvent.click(screen.getButton('Enter Tallies'));
  expect(history.location.pathname).toEqual(
    '/tally/manual/1-Ma/precinct/precinct-c1-w1-1'
  );
});

test('link to edit an existing tally', async () => {
  const history = createMemoryHistory();
  apiMock.expectGetManualResultsMetadata(mockManualResultsMetadata);
  renderInAppContext(
    <Router history={history}>
      <ManualTalliesTab />
    </Router>,
    {
      route: '/tally/manual',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(screen.getButton('Remove All Manual Tallies')).not.toBeDisabled();

  userEvent.click(screen.getButton('Edit'));
  expect(history.location.pathname).toEqual(
    '/tally/manual/1-Ma/precinct/precinct-c1-w1-1'
  );
});

test('table shows tally info and validation errors', async () => {
  apiMock.expectGetManualResultsMetadata([
    { ...mockManualResultsMetadata[0], validationError: 'incomplete' },
    {
      ...mockManualResultsMetadata[0],
      votingMethod: 'absentee',
      validationError: 'invalid',
    },
  ]);
  renderInAppContext(<ManualTalliesTab />, {
    electionDefinition,
    apiMock,
  });

  const table = await screen.findByRole('table');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
  ).toEqual([
    'Ballot Style',
    'Precinct',
    'Voting Method',
    'Ballot Count',
    '',
    '',
  ]);
  expect(
    within(table)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([
    '1-Ma',
    'Precinct 1',
    'Absentee',
    '10',
    ' Invalid',
    'EditRemove',
    '1-Ma',
    'Precinct 1',
    'Precinct',
    '10',
    ' Incomplete',
    'EditRemove',
  ]);
});

test('delete an existing tally', async () => {
  apiMock.expectGetManualResultsMetadata(mockManualResultsMetadata);
  renderInAppContext(<ManualTalliesTab />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(screen.getButton('Remove All Manual Tallies')).toBeEnabled();

  userEvent.click(screen.getButton('Remove'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(hasTextAcrossElements(/Ballot Style: 1-Ma/));
  within(modal).getByText(hasTextAcrossElements(/Precinct: Precinct 1/));
  within(modal).getByText(hasTextAcrossElements(/Voting Method: Precinct/));

  // expect delete request and refetch
  apiMock.expectDeleteManualResults({
    precinctId: 'precinct-c1-w1-1',
    ballotStyleGroupId: '1-Ma' as BallotStyleGroupId,
    votingMethod: 'precinct',
  });
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(screen.getButton('Remove Manual Tallies'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('full table & clearing all data', async () => {
  apiMock.expectGetManualResultsMetadata(
    getGroupedBallotStyles(election.ballotStyles).flatMap((bs) =>
      bs.precincts.flatMap((precinctId) =>
        ALL_MANUAL_TALLY_BALLOT_TYPES.map((votingMethod) => ({
          ballotStyleGroupId: bs.id,
          precinctId,
          votingMethod,
          ballotCount: 10,
          createdAt: new Date().toISOString(),
        }))
      )
    )
  );
  renderInAppContext(<ManualTalliesTab />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 200');
  expect(screen.getButton('Remove All Manual Tallies')).toBeEnabled();

  // adding row should be gone
  expect(screen.queryByLabelText('Ballot Style')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Precinct')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Voting Method')).not.toBeInTheDocument();
  expect(screen.queryByText('Enter Tallies')).not.toBeInTheDocument();

  // existing entries
  expect(screen.getAllButtons('Edit')).toHaveLength(20);
  expect(screen.getAllButtons('Remove')).toHaveLength(20);

  // clearing all results
  userEvent.click(screen.getButton('Remove All Manual Tallies'));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(within(modal).getButton('Remove All Manual Tallies'));

  await screen.findByText('Enter Tallies');
  screen.getByLabelText('Ballot Style');
  screen.getByLabelText('Precinct');
  screen.getByLabelText('Voting Method');
});

test('disable buttons when results are official', async () => {
  apiMock.expectGetManualResultsMetadata(mockManualResultsMetadata);
  renderInAppContext(<ManualTalliesTab />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(screen.getButton('Remove All Manual Tallies')).toBeDisabled();
  expect(screen.getButton('Remove')).toBeDisabled();
  expect(screen.getButton('Edit')).toBeDisabled();
  expect(screen.getByLabelText('Ballot Style')).toBeDisabled();
  expect(screen.getByLabelText('Precinct')).toBeDisabled();
  expect(screen.getByLabelText('Voting Method')).toBeDisabled();
});
