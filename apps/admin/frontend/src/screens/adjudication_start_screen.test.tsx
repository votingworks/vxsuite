import { afterEach, beforeEach, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import { act, screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AdjudicationStartScreen } from './adjudication_start_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';

vi.setConfig({
  testTimeout: 20000,
});

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();

let apiMock: ApiMock;

afterEach(async () => {
  apiMock.assertComplete();

  await act(async () => {
    await sleep(1);
  });
});

beforeEach(() => {
  apiMock = createApiMock();
});

test('No CVRs loaded', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 0,
    totalTally: 0,
  });
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('Load CVRs to begin adjudication.');
});

test('No ballots flagged for adjudication', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 0,
    totalTally: 0,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('No ballots flagged for adjudication.');
});

test('When tally results already marked as official, shows disabled message', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 3,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText(/Adjudication is disabled/);
});

test('When ballots need adjudication, shows start button with counts', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 3,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Start Adjudication');
  screen.getByText('3 Ballots Awaiting Review');
  screen.getByText('2 Ballots Completed');
});
