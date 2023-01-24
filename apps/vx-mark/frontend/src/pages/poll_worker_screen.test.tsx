import React from 'react';

import { asElectionDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  ok,
  InsertedSmartcardAuth,
  AppMode,
  MarkAndPrint,
  MarkOnly,
} from '@votingworks/types';

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

import { render } from '../../test/test_utils';

import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import { electionSampleWithSealDefinition } from '../data';

const electionSampleWithSeal = electionSampleWithSealDefinition.election;

beforeEach(() => {
  jest.useFakeTimers();
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
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn = fakePollworkerAuth(
    electionSampleWithSealDefinition
  ),
  electionDefinition: ElectionDefinition = electionSampleWithSealDefinition,
  appMode: AppMode = MarkOnly
) {
  return render(
    <PollWorkerScreen
      pollworkerAuth={pollworkerAuth}
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
      electionDefinition={electionDefinition}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      pollsState="polls_open"
      ballotsPrintedCount={0}
      machineConfig={fakeMachineConfig({ appMode })}
      hardware={MemoryHardware.buildStandard()}
      devices={fakeDevices()}
      screenReader={new AriaScreenReader(fakeTts())}
      updatePollsState={jest.fn()}
      reload={jest.fn()}
      logger={new Logger(LogSource.VxMarkFrontend)}
      {...props}
    />
  );
}

test('renders PollWorkerScreen in MarkAndPrint app mode', () => {
  renderScreen(undefined, undefined, undefined, MarkAndPrint);
  screen.getByText('Poll Worker Actions');
  expect(
    screen.getByText('Ballots Printed:').parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
});

test('renders PollWorkerScreen', () => {
  renderScreen();
  screen.getByText('Poll Worker Actions');
});

test('switching out of test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Switch to Live Election Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  });
  const enableLiveMode = jest.fn();
  renderScreen({ electionDefinition, enableLiveMode });

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', () => {
  renderScreen({ isLiveMode: true });
  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull();
});

test('navigates to System Diagnostics screen', () => {
  const { unmount } = renderScreen();

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
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: fakeMachineConfig({ appMode: MarkAndPrint }),
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
