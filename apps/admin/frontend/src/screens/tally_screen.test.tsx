import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '../../test/react_testing_library';
import { TallyScreen } from './tally_screen';
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
const earlierDate = new Date('2022-07-01T12:00:00.000');
const laterDate = new Date('2022-07-01T12:05:00.000');

test('displays manual tally metadata & links to manual data summary page', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      ballotCount: 50,
      createdAt: earlierDate.toISOString(),
    },
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      ballotCount: 50,
      createdAt: laterDate.toISOString(),
    },
  ]);
  const history = createMemoryHistory();
  renderInAppContext(
    <Router history={history}>
      <TallyScreen />
    </Router>,
    {
      electionDefinition,
      apiMock,
    }
  );
  await screen.findByRole('heading', { name: 'Manual Tallies' });
  expect(screen.getButton('Edit Manual Tallies')).toBeEnabled();
  expect(screen.getButton('Remove Manual Tallies')).toBeEnabled();

  const fileTable = screen.getByTestId('loaded-file-table');
  const manualResultsRow = within(fileTable)
    .getByText('Manual Tallies')
    .closest('tr')!;

  within(manualResultsRow).getByText('07/01/2022 12:00:00 PM');
  within(manualResultsRow).getByText('100');
  within(manualResultsRow).getByText('Manual Tallies');
  within(manualResultsRow).getByText('Precinct 1, Precinct 2');

  within(screen.getByTestId('total-cvr-count')).getByText('100');

  userEvent.click(screen.getButton('Edit Manual Tallies'));
  expect(history.location.pathname).toEqual('/tally/manual-data-summary');
});

test('can delete manual data', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      ballotCount: 50,
      createdAt: earlierDate.toISOString(),
    },
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      ballotCount: 50,
      createdAt: laterDate.toISOString(),
    },
  ]);
  const history = createMemoryHistory();
  renderInAppContext(
    <Router history={history}>
      <TallyScreen />
    </Router>,
    {
      electionDefinition,
      apiMock,
    }
  );
  await screen.findByRole('heading', { name: 'Manual Tallies' });
  userEvent.click(screen.getButton('Remove Manual Tallies'));

  // allows canceling the action
  let modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // confirming action causes mutation and refetch
  userEvent.click(screen.getButton('Remove Manual Tallies'));
  modal = await screen.findByRole('alertdialog');
  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(within(modal).getButton('Remove All Manual Tallies'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('with no data loaded', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetManualResultsMetadata([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByRole('heading', {
    name: 'Cast Vote Records (CVRs)',
  });
  await screen.findByText('No CVRs loaded.');
  expect(screen.getButton('Load CVRs')).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Remove CVRs' })
  ).not.toBeInTheDocument();
  expect(screen.getButton('Add Manual Tallies')).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Remove Manual Tallies' })
  ).not.toBeInTheDocument();
});
