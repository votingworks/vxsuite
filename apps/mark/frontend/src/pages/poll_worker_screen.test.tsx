import React from 'react';

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

import { Logger, LogSource } from '@votingworks/logging';
import { ok } from '@votingworks/basics';
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
  apiMock.expectGetElectionDefinition(electionDefinition);
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <PollWorkerScreen
          pollWorkerAuth={pollWorkerAuth}
          activateCardlessVoterSession={jest.fn()}
          resetCardlessVoterSession={jest.fn()}
          appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
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
          logger={new Logger(LogSource.VxMarkFrontend)}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('renders PollWorkerScreen', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  renderScreen();
  await screen.findByText('Poll Worker Actions');
  expect(
    (await screen.findByText('Ballots Printed:')).parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
});

test('switching out of test mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  const enableLiveMode = jest.fn();
  renderScreen(
    {
      pollWorkerAuth: fakePollWorkerAuth(electionDefinition),
      enableLiveMode,
    },
    undefined,
    electionDefinition
  );

  await screen.findByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(await screen.findByText('Switch to Official Ballot Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  const enableLiveMode = jest.fn();
  renderScreen({ enableLiveMode }, undefined, electionDefinition);

  await screen.findByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(await screen.findByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  renderScreen({ isLiveMode: true });
  await screen.findByText('Poll Worker Actions');
  expect(
    screen.queryByText(
      'Switch to Official Ballot Mode and reset the Ballots Printed count?'
    )
  ).toBeNull();
});

test('navigates to System Diagnostics screen', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  const { unmount } = renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'View More Actions' })
  );
  userEvent.click(
    await screen.findByRole('button', { name: 'System Diagnostics' })
  );
  screen.getByRole('heading', { name: 'System Diagnostics' });

  userEvent.click(
    screen.getByRole('button', { name: 'Back to Poll Worker Actions' })
  );
  screen.getByText(hasTextAcrossElements('Polls: Open'));

  // Explicitly unmount before the printer status has resolved to verify that
  // we properly cancel the request for printer status.
  unmount();
});

test('requires confirmation to open polls if no report on card', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  const updatePollsState = jest.fn();
  renderScreen({
    pollsState: 'polls_closed_initial',
    updatePollsState,
  });

  fireEvent.click(await screen.findByText('Open Polls'));

  // Should show the modal and not open/close polls
  expect(updatePollsState).not.toHaveBeenCalled();
  await screen.findByText('No Polls Opened Report on Card');

  // Clicking Cancel closes the modal
  fireEvent.click(await screen.findByText('Cancel'));
  await screen.findByText('Open Polls');

  // Clicking Open Polls on VxMark Now should open/close polls anyway
  fireEvent.click(await screen.findByText('Open Polls'));
  fireEvent.click(await screen.findByText('Open Polls on VxMark Now'));
  expect(updatePollsState).toHaveBeenCalled();
});

test('can toggle between vote activation and "other actions" during polls open', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith()
    .resolves(ok(undefined));
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: fakeMachineConfig(),
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Select Voter’s Ballot Style'));

  // switch to other actions pane
  userEvent.click(await screen.findByText('View More Actions'));
  await screen.findByText('System Diagnostics');

  // switch back
  userEvent.click(await screen.findByText('Back to Ballot Style Selection'));
  await screen.findByText('Select Voter’s Ballot Style');
});
