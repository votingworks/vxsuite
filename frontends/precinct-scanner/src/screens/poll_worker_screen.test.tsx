import { act, screen, render, fireEvent } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { NullPrinter, usbstick } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { UserSession } from '@votingworks/types';
import { mocked } from 'ts-jest/utils';
import { AppContext } from '../contexts/app_context';
import { PollWorkerScreen } from './poll_worker_screen';

import { isLiveCheckEnabled } from '../config/features';

jest.mock('../config/features');

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

afterEach(() => {
  window.kiosk = undefined;
  jest.useRealTimers();
});

const pollworkerSession: UserSession = {
  type: 'pollworker',
  authenticated: true,
  isElectionHashValid: true,
};

function renderScreen({
  scannedBallotCount = 0,
  isPollsOpen = false,
  currentUserSession,
}: {
  scannedBallotCount?: number;
  isPollsOpen?: boolean;
  currentUserSession?: UserSession;
}): void {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        currentUserSession,
      }}
    >
      <PollWorkerScreen
        scannedBallotCount={scannedBallotCount}
        isPollsOpen={isPollsOpen}
        togglePollsOpen={jest.fn()}
        getCvrsFromExport={jest.fn().mockResolvedValue([])}
        saveTallyToCard={jest.fn()}
        isLiveMode
        hasPrinterAttached={false}
        printer={new NullPrinter()}
        usbDrive={{
          status: usbstick.UsbDriveStatus.absent,
          eject: jest.fn(),
        }}
      />
    </AppContext.Provider>
  );
}

describe('shows Export Results button only when polls are closed and more than 0 ballots have been cast', () => {
  const exportButtonText = 'Export Results to USB Drive';

  test('no ballots and polls closed should not show button', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 0,
        isPollsOpen: false,
      });
      jest.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getAllByText('No')[0]);

    expect(screen.queryByText(exportButtonText)).toBeNull();
  });

  test('no ballots and polls open should not show button', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 0,
        isPollsOpen: true,
      });
    });
    fireEvent.click(screen.getAllByText('No')[0]);
    expect(screen.queryByText(exportButtonText)).toBeNull();
  });

  test('five ballots and polls open should not show button', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: true,
      });
      jest.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getAllByText('No')[0]);

    expect(screen.queryByText(exportButtonText)).toBeNull();
  });

  test('five ballots and polls closed should show button', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: false,
      });
      jest.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getAllByText('No')[0]);
    await advanceTimersAndPromises(1);
    await advanceTimersAndPromises(1);
    await screen.findByText('Export Results to USB Drive');

    expect(screen.queryByText(exportButtonText)).toBeTruthy();
  });
});

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    mocked(isLiveCheckEnabled).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: true,
        currentUserSession: pollworkerSession,
      });
      jest.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.queryAllByText('No')[0]);
    expect(screen.queryByText('Live Check')).toBeTruthy();

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      fireEvent.click(screen.getByText('Live Check'));
    });
    screen.getByText('Done');
  });

  test('disable livecheck', async () => {
    mocked(isLiveCheckEnabled).mockReturnValue(false);

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: true,
        currentUserSession: pollworkerSession,
      });
      jest.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.queryAllByText('No')[0]);
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});
