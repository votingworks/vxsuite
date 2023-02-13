import { screen, RenderResult, render } from '@testing-library/react';
import { fakeKiosk, mockOf } from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  isFeatureFlagEnabled,
} from '@votingworks/shared';
import MockDate from 'mockdate';
import React from 'react';
import { mocked } from 'ts-jest/utils';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { PollWorkerScreen, PollWorkerScreenProps } from './poll_worker_screen';
import {
  ApiMock,
  createApiMock,
  machineConfig,
  provideApi,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

jest.mock('@votingworks/shared', (): typeof import('@votingworks/shared') => {
  return {
    ...jest.requireActual('@votingworks/shared'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
  window.location.href = '/';
  window.kiosk = fakeKiosk();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(
  props: Partial<PollWorkerScreenProps> = {}
): RenderResult {
  apiMock.expectGetCastVoteRecordsForTally([]);
  return render(
    provideApi(
      apiMock,
      <PollWorkerScreen
        machineConfig={machineConfig}
        electionDefinition={electionSampleDefinition}
        precinctSelection={ALL_PRECINCTS_SELECTION}
        scannedBallotCount={0}
        pollsState="polls_closed_initial"
        isLiveMode
        hasPrinterAttached={false}
        logger={fakeLogger()}
        {...props}
      />
    )
  );
}

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    mocked(isFeatureFlagEnabled).mockReturnValue(true);

    renderScreen({
      scannedBallotCount: 5,
      pollsState: 'polls_open',
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeTruthy();

    userEvent.click(screen.getByText('Live Check'));
    await screen.findByText('Done');
  });

  test('disable livecheck', async () => {
    mocked(isFeatureFlagEnabled).mockReturnValue(false);

    renderScreen({
      scannedBallotCount: 5,
      pollsState: 'polls_open',
    });

    userEvent.click(await screen.findByText('No'));
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});

describe('transitions from polls closed', () => {
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 0,
      pollsState: 'polls_closed_initial',
      logger,
    });
    await screen.findByText('Do you want to open the polls?');
  });

  test('open polls happy path', async () => {
    apiMock.expectSetPollsState('polls_open');
    apiMock.expectGetConfig({ pollsState: 'polls_open' });
    userEvent.click(screen.getByText('Yes, Open the Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
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
    apiMock.expectSetPollsState('polls_open');
    apiMock.expectGetConfig({ pollsState: 'polls_open' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Open Polls'));
    await screen.findByText('Opening Polls…');
    await screen.findByText('Polls are open.');
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
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 7,
      pollsState: 'polls_open',
      logger,
    });
    await screen.findByText('Do you want to close the polls?');
  });

  test('close polls happy path', async () => {
    apiMock.expectExportCastVoteRecordsToUsbDrive();
    apiMock.expectSetPollsState('polls_closed_final');
    apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
    userEvent.click(screen.getByText('Yes, Close the Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
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
    apiMock.expectExportCastVoteRecordsToUsbDrive();
    apiMock.expectSetPollsState('polls_closed_final');
    apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
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
    apiMock.expectSetPollsState('polls_paused');
    apiMock.expectGetConfig({ pollsState: 'polls_paused' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Pause Voting'));
    await screen.findByText('Pausing Voting…');
    await screen.findByText('Voting paused.');
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
  let logger = fakeLogger();
  beforeEach(async () => {
    logger = fakeLogger();
    renderScreen({
      scannedBallotCount: 7,
      pollsState: 'polls_paused',
      logger,
    });
    await screen.findByText('Do you want to resume voting?');
  });

  test('resume voting happy path', async () => {
    apiMock.expectSetPollsState('polls_open');
    apiMock.expectGetConfig({ pollsState: 'polls_open' });
    userEvent.click(screen.getByText('Yes, Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
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
    apiMock.expectSetPollsState('polls_open');
    apiMock.expectGetConfig({ pollsState: 'polls_open' });
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Resume Voting'));
    await screen.findByText('Resuming Voting…');
    await screen.findByText('Voting resumed.');
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
    apiMock.expectSetPollsState('polls_closed_final');
    apiMock.expectGetConfig({ pollsState: 'polls_closed_final' });
    apiMock.expectExportCastVoteRecordsToUsbDrive();
    userEvent.click(screen.getByText('No'));
    userEvent.click(await screen.findByText('Close Polls'));
    await screen.findByText('Closing Polls…');
    await screen.findByText('Polls are closed.');
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
    scannedBallotCount: 0,
    pollsState: 'polls_closed_final',
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
    scannedBallotCount: 1,
    pollsState: 'polls_closed_initial',
    logger,
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
