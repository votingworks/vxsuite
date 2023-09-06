import {
  asElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { ElectionDefinition, InsertedSmartCardAuth } from '@votingworks/types';

import { singlePrecinctSelectionFor, MemoryHardware } from '@votingworks/utils';
import {
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import { ApiClientContext, createQueryClient } from '../api';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const electionSampleWithSeal = electionSampleDefinition.election;

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function fakePollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: fakePollWorkerUser({ electionHash: electionDefinition.electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };
}

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn = fakePollWorkerAuth(
    electionSampleDefinition
  ),
  electionDefinition: ElectionDefinition = electionSampleDefinition
) {
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <PollWorkerScreen
          pollWorkerAuth={pollWorkerAuth}
          activateCardlessVoterSession={jest.fn()}
          resetCardlessVoterSession={jest.fn()}
          appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
          electionDefinition={electionDefinition}
          enableLiveMode={jest.fn()}
          hasVotes={false}
          isLiveMode={false}
          pollsState="polls_open"
          ballotsPrintedCount={0}
          machineConfig={fakeMachineConfig()}
          hardware={MemoryHardware.buildStandard()}
          devices={fakeDevices()}
          screenReader={new AriaScreenReader(fakeTts())}
          updatePollsState={jest.fn()}
          reload={jest.fn()}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('renders PollWorkerScreen', () => {
  renderScreen(undefined, undefined, undefined);
  screen.getByText('Poll Worker Actions');
  expect(
    screen.getByText('Ballots Printed:').parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
});

test('switching out of test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({
    pollWorkerAuth: fakePollWorkerAuth(electionDefinition),
    electionDefinition,
    enableLiveMode,
  });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Switch to Official Ballot Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', () => {
  renderScreen({ isLiveMode: true });
  expect(
    screen.queryByText(
      'Switch to Official Ballot Mode and reset the Ballots Printed count?'
    )
  ).toBeNull();
});

test('navigates to System Diagnostics screen', () => {
  const { unmount } = renderScreen();

  userEvent.click(screen.getByRole('button', { name: 'View More Actions' }));
  userEvent.click(screen.getByRole('button', { name: 'System Diagnostics' }));
  screen.getByRole('heading', { name: 'System Diagnostics' });

  userEvent.click(
    screen.getByRole('button', { name: 'Back to Poll Worker Actions' })
  );
  screen.getByText(hasTextAcrossElements('Polls: Open'));

  // Explicitly unmount before the printer status has resolved to verify that
  // we properly cancel the request for printer status.
  unmount();
});

test('can toggle between vote activation and "other actions" during polls open', async () => {
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: fakeMachineConfig(),
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Select Voter’s Ballot Style'));

  // switch to other actions pane
  userEvent.click(screen.getByText('View More Actions'));
  screen.getByText('System Diagnostics');

  // switch back
  userEvent.click(screen.getByText('Back to Ballot Style Selection'));
  screen.getByText('Select Voter’s Ballot Style');
});
