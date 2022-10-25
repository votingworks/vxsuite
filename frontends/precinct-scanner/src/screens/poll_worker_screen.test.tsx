import { act, screen, render, fireEvent } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  Inserted,
  mockOf,
} from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  isFeatureFlagEnabled,
  usbstick,
} from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { InsertedSmartcardAuth } from '@votingworks/types';
import { mocked } from 'ts-jest/utils';
import fetchMock from 'fetch-mock';
import { AppContext } from '../contexts/app_context';
import { PollWorkerScreen } from './poll_worker_screen';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
  jest.useFakeTimers();
  window.location.href = '/';
  fetchMock.post('/precinct-scanner/export', {});
});

afterEach(() => {
  window.kiosk = undefined;
  jest.useRealTimers();
});

function renderScreen({
  scannedBallotCount = 0,
  isPollsOpen = false,
  auth = Inserted.fakePollWorkerAuth(),
}: {
  scannedBallotCount?: number;
  isPollsOpen?: boolean;
  auth?: InsertedSmartcardAuth.PollWorkerLoggedIn;
}): void {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        isSoundMuted: false,
        auth,
      }}
    >
      <PollWorkerScreen
        scannedBallotCount={scannedBallotCount}
        isPollsOpen={isPollsOpen}
        togglePollsOpen={jest.fn()}
        isLiveMode
        hasPrinterAttached={false}
        usbDrive={{
          status: usbstick.UsbDriveStatus.absent,
          eject: jest.fn(),
        }}
      />
    </AppContext.Provider>
  );
}

describe('shows Export Results button only when polls are closed and more than 0 ballots have been cast', () => {
  const exportButtonText = 'Save Results to USB Drive';

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
    await screen.findByText('Save Results to USB Drive');

    expect(screen.queryByText(exportButtonText)).toBeTruthy();
  });
});

describe('shows Livecheck button only when enabled', () => {
  test('enable livecheck', async () => {
    mocked(isFeatureFlagEnabled).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: true,
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
    mocked(isFeatureFlagEnabled).mockReturnValue(false);

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      renderScreen({
        scannedBallotCount: 5,
        isPollsOpen: true,
      });
      jest.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.queryAllByText('No')[0]);
    expect(screen.queryByText('Live Check')).toBeFalsy();
  });
});
