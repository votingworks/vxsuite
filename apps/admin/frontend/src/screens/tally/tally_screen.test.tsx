import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  readElectionCombinedBallotPrimaryDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';

import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen, waitFor } from '../../../test/react_testing_library';
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
const nLocations = electionDefinition.election.pollingPlaces.length;

test('has tabs for CVRs and Manual Tallies', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition,
    apiMock,
    route: '/tally',
  });

  await waitFor(() => apiMock.assertComplete());
  screen.getByRole('tab', { name: 'Cast Vote Records', selected: true });

  const locationsCardText = ['Locations', `0 / ${nLocations}`].join('');
  screen.getByText(hasTextAcrossElements(locationsCardText));

  expect(screen.getButton('Load')).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: /remove/i })
  ).not.toBeInTheDocument();

  for (const location of electionDefinition.election.pollingPlaces) {
    screen.getButton(new RegExp(location.name));
  }

  apiMock.expectGetSystemSettings();
  apiMock.expectGetManualResultsMetadata([]);

  userEvent.click(screen.getByRole('tab', { name: 'Manual Tallies' }));
  await screen.findByText('No manual tallies entered.');
});

test('hides Manual Tallies tab for combined ballot primary elections', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition: readElectionCombinedBallotPrimaryDefinition(),
    apiMock,
    route: '/tally',
  });

  await screen.findByRole('tab', { name: 'Cast Vote Records' });
  expect(
    screen.queryByRole('tab', { name: 'Manual Tallies' })
  ).not.toBeInTheDocument();
});

test('redirects /tally/manual to CVRs tab for combined ballot primary elections', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<TallyScreen />, {
    electionDefinition: readElectionCombinedBallotPrimaryDefinition(),
    apiMock,
    route: '/tally/manual',
  });
  await screen.findByRole('tab', { name: 'Cast Vote Records', selected: true });

  const locationsCardText = ['Locations', `0 / ${nLocations}`].join('');
  screen.getByText(hasTextAcrossElements(locationsCardText));
});
