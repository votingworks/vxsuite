import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';

import userEvent from '@testing-library/user-event';
import { screen } from '../../../test/react_testing_library';
import { TallyScreen } from './tally_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();

  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionTwoPartyPrimaryDefinition;

test('has tabs for CVRs and Manual Tallies', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetManualResultsMetadata([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition,
    apiMock,
    route: '/tally',
  });
  await screen.findByRole('heading', { name: 'Tally' });

  screen.getByRole('tab', { name: 'Cast Vote Records (CVRs)' });
  await screen.findByText('No CVRs loaded.');
  expect(screen.getButton('Load CVRs')).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Remove CVRs' })
  ).not.toBeInTheDocument();

  userEvent.click(screen.getByRole('tab', { name: 'Manual Tallies' }));
  await screen.findByText('No manual tallies entered.');
});
