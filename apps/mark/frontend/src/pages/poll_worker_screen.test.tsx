import React from 'react';

import {
  asElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { ElectionDefinition, InsertedSmartcardAuth } from '@votingworks/types';

import { fireEvent, screen } from '@testing-library/react';
import {
  ScannerReportData,
  singlePrecinctSelectionFor,
  MemoryHardware,
} from '@votingworks/utils';
import {
  Inserted,
  fakePollWorkerUser,
  fakeCardStorage,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { Logger, LogSource } from '@votingworks/logging';
import { ok } from '@votingworks/basics';

import { QueryClientProvider } from '@tanstack/react-query';
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

function fakePollworkerAuth(
  electionDefinition: ElectionDefinition,
  tally?: ScannerReportData
): InsertedSmartcardAuth.PollWorkerLoggedIn {
  return Inserted.fakePollWorkerAuth(
    fakePollWorkerUser({ electionHash: electionDefinition.electionHash }),
    fakeCardStorage({
      hasStoredData: tally !== undefined,
      readStoredObject: jest.fn().mockResolvedValue(ok(tally)),
    })
  );
}

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollWorkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn = fakePollworkerAuth(
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
          logger={new Logger(LogSource.VxMarkFrontend)}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('renders PollWorkerScreen in MarkAndPrint app mode', () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
  renderScreen(undefined, undefined, undefined);
  screen.getByText('Poll Worker Actions');
  expect(
    screen.getByText('Ballots Printed:').parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
});

test('renders PollWorkerScreen', () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
  renderScreen();
  screen.getByText('Poll Worker Actions');
});

test('switching out of test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionDefinition.electionHash })
    .resolves(ok(undefined));
  const enableLiveMode = jest.fn();
  renderScreen({
    pollWorkerAuth: fakePollworkerAuth(electionDefinition),
    electionDefinition,
    enableLiveMode,
  });

  screen.getByText(
    'Switch to Live Election Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Switch to Live Election Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionDefinition.electionHash })
    .resolves(ok(undefined));
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText(
    'Switch to Live Election Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
  renderScreen({ isLiveMode: true });
  expect(
    screen.queryByText(
      'Switch to Live Election Mode and reset the Ballots Printed count?'
    )
  ).toBeNull();
});

test('navigates to System Diagnostics screen', () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
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

test('requires confirmation to open polls if no report on card', () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
  const updatePollsState = jest.fn();
  renderScreen({
    pollsState: 'polls_closed_initial',
    updatePollsState,
  });

  fireEvent.click(screen.getByText('Open Polls'));

  // Should show the modal and not open/close polls
  expect(updatePollsState).not.toHaveBeenCalled();
  screen.getByText('No Polls Opened Report on Card');

  // Clicking Cancel closes the modal
  fireEvent.click(screen.getByText('Cancel'));
  screen.getByText('Open Polls');

  // Clicking Open Polls on VxMark Now should open/close polls anyway
  fireEvent.click(screen.getByText('Open Polls'));
  fireEvent.click(screen.getByText('Open Polls on VxMark Now'));
  expect(updatePollsState).toHaveBeenCalled();
});

test('can toggle between vote activation and "other actions" during polls open', async () => {
  apiMock.mockApiClient.readScannerReportDataFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(undefined));
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
