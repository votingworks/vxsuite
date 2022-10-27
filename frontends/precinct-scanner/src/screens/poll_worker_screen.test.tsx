import { screen, render } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk, Inserted, mockOf } from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { InsertedSmartcardAuth } from '@votingworks/types';
import { mocked } from 'ts-jest/utils';
import fetchMock from 'fetch-mock';
import userEvent from '@testing-library/user-event';
import { AppContext, AppContextInterface } from '../contexts/app_context';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
  window.location.href = '/';
  fetchMock.post('/precinct-scanner/export', {});
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  window.kiosk = undefined;
});

function renderScreen({
  appContextProps = {},
  pollWorkerScreenProps = {},
}: {
  appContextProps?: Partial<AppContextInterface>;
  pollWorkerScreenProps?: Partial<PollWorkerScreenProps>;
} = {}): void {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth: Inserted.fakePollWorkerAuth(),
        ...appContextProps,
      }}
    >
      <PollWorkerScreen
        scannedBallotCount={0}
        pollsState="polls_closed_initial"
        updatePollsState={jest.fn()}
        isLiveMode
        hasPrinterAttached={false}
        {...pollWorkerScreenProps}
      />
    </AppContext.Provider>
  );
}

function readableFakePollWorkerAuth(): InsertedSmartcardAuth.PollWorkerLoggedIn {
  const auth = Inserted.fakePollWorkerAuth();
  return {
    ...auth,
    card: {
      ...auth.card,
      readStoredObject: jest.fn().mockResolvedValue({
        ok: () => '',
      }),
    },
  };
}

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    mocked(isFeatureFlagEnabled).mockReturnValue(true);

    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 5,
        pollsState: 'polls_open',
      },
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeTruthy();

    userEvent.click(screen.getByText('Live Check'));
    await screen.findByText('Done');
  });

  test('disable livecheck', async () => {
    mocked(isFeatureFlagEnabled).mockReturnValue(false);

    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 5,
        pollsState: 'polls_open',
      },
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});

describe('transitions from polls closed', () => {
  let updatePollsState = jest.fn();
  beforeEach(async () => {
    updatePollsState = jest.fn();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 0,
        pollsState: 'polls_closed_initial',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
      },
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
  });

  test('open polls from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls for All Precincts'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
  });
});

describe('transitions from polls open', () => {
  let updatePollsState = jest.fn();
  beforeEach(async () => {
    updatePollsState = jest.fn();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 0,
        pollsState: 'polls_open',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
      },
    });
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
  });

  test('close polls from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls for All Precincts'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
  });

  test('pause polls', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Pause Polls for All Precincts'));
    await screen.findByText('Pausing Polls…');
    await screen.findByText('Polls are paused.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_paused');
  });
});

describe('transitions from polls paused', () => {
  let updatePollsState = jest.fn();
  beforeEach(async () => {
    updatePollsState = jest.fn();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 0,
        pollsState: 'polls_paused',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
      },
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
  });

  test('open polls from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls for All Precincts'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
  });

  test('close polls from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls for All Precincts'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
  });
});

test('no transitions from polls closed final', async () => {
  renderScreen({
    pollWorkerScreenProps: {
      scannedBallotCount: 0,
      pollsState: 'polls_closed_final',
    },
  });
  await screen.findByText(
    'Voting is complete and the polls cannot be re-opened.'
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
