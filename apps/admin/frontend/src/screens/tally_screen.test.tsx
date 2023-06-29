import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

import userEvent from '@testing-library/user-event';
import { screen, within } from '../../test/react_testing_library';
import { TallyScreen } from './tally_screen';
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
const earlierDate = new Date('2022-07-01T12:00:00.000Z');
const laterDate = new Date('2022-07-01T12:05:00.000Z');

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
  await screen.findByRole('heading', { name: 'Manually Entered Results' });
  expect(screen.getButton('Edit Manually Entered Results')).toBeEnabled();
  expect(screen.getButton('Remove Manually Entered Results')).toBeEnabled();

  const fileTable = screen.getByTestId('loaded-file-table');
  const manualResultsRow = within(fileTable)
    .getByText('Manually Entered Results')
    .closest('tr')!;

  within(manualResultsRow).getByText('07/01/2022 12:00:00 PM');
  within(manualResultsRow).getByText('100');
  within(manualResultsRow).getByText('Manually Entered Results');
  within(manualResultsRow).getByText('Precinct 1, Precinct 2');

  within(screen.getByTestId('total-cvr-count')).getByText('100');

  userEvent.click(screen.getButton('Edit Manually Entered Results'));
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
  await screen.findByRole('heading', { name: 'Manually Entered Results' });
  userEvent.click(screen.getButton('Remove Manually Entered Results'));

  // allows canceling the action
  let modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // confirming action causes mutation and refetch
  userEvent.click(screen.getButton('Remove Manually Entered Results'));
  modal = await screen.findByRole('alertdialog');
  apiMock.expectDeleteAllManualResults();
  apiMock.expectGetManualResultsMetadata([]);
  userEvent.click(
    within(modal).getButton('Remove All Manually Entered Results')
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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
    name: 'Cast Vote Record (CVR) Management',
  });
  await screen.findByText('No CVR files loaded.');
  expect(screen.getButton('Load CVR Files')).toBeEnabled();
  expect(screen.getButton('Remove CVR Files')).toBeDisabled();
  expect(screen.getButton('Add Manually Entered Results')).toBeEnabled();
  expect(screen.getButton('Remove Manually Entered Results')).toBeDisabled();
});
