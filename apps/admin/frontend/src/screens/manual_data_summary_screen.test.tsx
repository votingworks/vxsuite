import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

import userEvent from '@testing-library/user-event';
import { screen, within } from '../../test/react_testing_library';
import {
  ALL_MANUAL_TALLY_BALLOT_TYPES,
  ManualDataSummaryScreen,
} from './manual_data_summary_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionTwoPartyPrimaryDefinition;
const { election } = electionDefinition;

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
    screen.queryByRole('button', { name: 'Remove All Manual Tallies' })
  ).not.toBeInTheDocument();

  // adding a manual tally
  expect(screen.getButton('Add Tallies')).toBeDisabled();
  expect(screen.getByLabelText('Voting Method')).toBeDisabled();
  expect(screen.getByLabelText('Precinct')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Ballot Style'));
  userEvent.click(screen.getByText('1M'));

  expect(screen.getButton('Add Tallies')).toBeDisabled();
  expect(screen.getByLabelText('Voting Method')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Precinct'));
  userEvent.click(screen.getByText('Precinct 1'));

  expect(screen.getButton('Add Tallies')).toBeDisabled();

  userEvent.click(screen.getByLabelText('Voting Method'));
  const options = screen.getByText('Absentee').parentElement!;
  userEvent.click(within(options).getByText('Precinct'));

  userEvent.click(screen.getButton('Add Tallies'));
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
      votingMethod: 'precinct',
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
  expect(screen.getButton('Remove All Manual Tallies')).not.toBeDisabled();

  userEvent.click(screen.getButton('Edit'));
  expect(history.location.pathname).toEqual(
    '/tally/manual-data-entry/1M/precinct/precinct-1'
  );
});

test('delete an existing tally', async () => {
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      ballotCount: 10,
      createdAt: new Date().toISOString(),
    },
  ]);
  renderInAppContext(<ManualDataSummaryScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 10');
  expect(screen.getButton('Remove All Manual Tallies')).toBeEnabled();

  userEvent.click(screen.getButton('Remove'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText(hasTextAcrossElements(/Ballot Style: 1M/));
  within(modal).getByText(hasTextAcrossElements(/Precinct: Precinct 1/));
  within(modal).getByText(hasTextAcrossElements(/Voting Method: Precinct/));

  // expect delete request and refetch
  apiMock.expectDeleteManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
  });
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(screen.getButton('Remove Manual Tallies'));
});

test('full table & clearing all data', async () => {
  apiMock.expectGetManualResultsMetadata(
    election.ballotStyles.flatMap((bs) =>
      bs.precincts.flatMap((precinctId) =>
        ALL_MANUAL_TALLY_BALLOT_TYPES.flatMap((votingMethod) => [
          {
            ballotStyleId: bs.id,
            precinctId,
            votingMethod,
            ballotCount: 10,
            createdAt: new Date().toISOString(),
          },
        ])
      )
    )
  );
  renderInAppContext(<ManualDataSummaryScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Total Manual Ballot Count: 80');
  expect(screen.getButton('Remove All Manual Tallies')).toBeEnabled();

  // adding row should be gone
  expect(screen.queryByLabelText('Ballot Style')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Precinct')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Voting Method')).not.toBeInTheDocument();
  expect(screen.queryByText('Add Tallies')).not.toBeInTheDocument();

  // existing entries
  expect(screen.getAllButtons('Edit')).toHaveLength(8);
  expect(screen.getAllButtons('Remove')).toHaveLength(8);

  // clearing all results
  userEvent.click(screen.getButton('Remove All Manual Tallies'));
  const modal = await screen.findByRole('alertdialog');

  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(within(modal).getButton('Remove All Manual Tallies'));

  await screen.findByText('Add Tallies');
  screen.getByLabelText('Ballot Style');
  screen.getByLabelText('Precinct');
  screen.getByLabelText('Voting Method');
});
