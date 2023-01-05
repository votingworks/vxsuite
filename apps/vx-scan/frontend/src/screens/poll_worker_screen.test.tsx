import { screen, RenderResult } from '@testing-library/react';
import { fakeKiosk, Inserted, mockOf } from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { InsertedSmartcardAuth } from '@votingworks/types';
import { mocked } from 'ts-jest/utils';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { AppContextInterface } from '../contexts/app_context';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';
import {
  machineConfig,
  renderInAppContext,
} from '../../test/helpers/render_in_app_context';
import { ApiClientContext } from '../api/api';
import { createApiMock } from '../../test/helpers/mock_api_client';

const apiMock = createApiMock();

const { machineId } = machineConfig;

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
  window.kiosk = fakeKiosk();
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen({
  appContextProps = {},
  pollWorkerScreenProps = {},
}: {
  appContextProps?: Partial<AppContextInterface>;
  pollWorkerScreenProps?: Partial<PollWorkerScreenProps>;
} = {}): RenderResult {
  const pollWorkerScreenAppContextProps: Partial<AppContextInterface> = {
    auth: Inserted.fakePollWorkerAuth(),
    precinctSelection: ALL_PRECINCTS_SELECTION,
    ...appContextProps,
  };
  apiMock.expectGetCastVoteRecordsForTally([]);
  return renderInAppContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <PollWorkerScreen
        scannedBallotCount={0}
        pollsState="polls_closed_initial"
        updatePollsState={jest.fn()}
        isLiveMode
        hasPrinterAttached={false}
        {...pollWorkerScreenProps}
      />
    </ApiClientContext.Provider>,
    pollWorkerScreenAppContextProps
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
  let logger = fakeLogger();
  beforeEach(async () => {
    updatePollsState = jest.fn();
    logger = fakeLogger();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 0,
        pollsState: 'polls_closed_initial',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
        logger,
      },
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsOpened,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 0,
      })
    );
  });

  test('open polls from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsOpened,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 0,
      })
    );
  });
});

describe('transitions from polls open', () => {
  let updatePollsState = jest.fn();
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    updatePollsState = jest.fn();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 7,
        pollsState: 'polls_open',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
        logger,
      },
    });
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('close polls from landing screen', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('pause voting', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting paused.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_paused');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingPaused,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });
});

describe('transitions from polls paused', () => {
  let updatePollsState = jest.fn();
  let logger = fakeLogger();
  beforeEach(async () => {
    updatePollsState = jest.fn();
    logger = fakeLogger();
    renderScreen({
      pollWorkerScreenProps: {
        scannedBallotCount: 7,
        pollsState: 'polls_paused',
        updatePollsState,
      },
      appContextProps: {
        auth: readableFakePollWorkerAuth(),
        logger,
      },
    });
    await screen.findByText('Do you want to resume voting?');
  });

  test('resume voting happy path', async () => {
    userEvent.click(screen.getByText('Yes, Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingResumed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('resume voting from landing screen', async () => {
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_open');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.VotingResumed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
  });

  test('close polls from landing screen', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive(machineId);
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
    expect(updatePollsState).toHaveBeenLastCalledWith('polls_closed_final');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PollsClosed,
      'poll_worker',
      expect.objectContaining({
        disposition: 'success',
        scannedBallotCount: 7,
      })
    );
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
    'Voting is complete and the polls cannot be reopened.'
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

// confirm that we have an alert and logging that meet VVSG 2.0 1.1.3-B
test('there is a warning if we attempt to polls with ballots scanned', async () => {
  const logger = fakeLogger();
  renderScreen({
    pollWorkerScreenProps: {
      scannedBallotCount: 1,
      pollsState: 'polls_closed_initial',
    },
    appContextProps: {
      logger,
    },
  });
  await screen.findByText('Do you want to open the polls?');
  userEvent.click(screen.getByText('Yes, Open the Polls'));
  await screen.findByText('Ballots Already Scanned');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    expect.objectContaining({
      disposition: 'failure',
      scannedBallotCount: 1,
    })
  );
});
