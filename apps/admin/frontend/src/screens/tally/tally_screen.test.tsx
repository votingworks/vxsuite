import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  readElectionOpenPrimaryDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';

import userEvent from '@testing-library/user-event';
import { screen } from '../../../test/react_testing_library';
import { TallyScreen } from './tally_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });

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

test('hides Manual Tallies tab for open primary elections', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition: readElectionOpenPrimaryDefinition(),
    apiMock,
    route: '/tally',
  });
  await screen.findByRole('heading', { name: 'Tally' });

  screen.getByRole('tab', { name: 'Cast Vote Records (CVRs)' });
  expect(
    screen.queryByRole('tab', { name: 'Manual Tallies' })
  ).not.toBeInTheDocument();
});

test('redirects /tally/manual to CVRs tab for open primary elections', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition: readElectionOpenPrimaryDefinition(),
    apiMock,
    route: '/tally/manual',
  });
  await screen.findByRole('heading', { name: 'Tally' });
  await screen.findByText('No CVRs loaded.');
});
