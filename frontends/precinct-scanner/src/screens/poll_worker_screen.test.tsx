import { act, screen, render, fireEvent } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  mockOf,
} from '@votingworks/test-utils';
import { NullPrinter, usbstick } from '@votingworks/utils';
import MockDate from 'mockdate';
import React from 'react';
import { AppContext } from '../contexts/app_context';
import { PollWorkerScreen } from './poll_worker_screen';

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

afterEach(() => {
  window.kiosk = undefined;
  jest.useRealTimers();
});

function renderScreen({
  scannedBallotCount = 0,
  isPollsOpen = false,
}: {
  scannedBallotCount?: number;
  isPollsOpen?: boolean;
}): void {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'TEST' },
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

test('shows system authentication code', async () => {
  const mockKiosk = fakeKiosk();
  mockOf(mockKiosk.totp.get).mockResolvedValue({
    isoDatetime: '2020-10-31T01:01:01.001Z',
    code: '123456',
  });
  window.kiosk = mockKiosk;

  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    renderScreen({});
    jest.advanceTimersByTime(2000);
  });
  fireEvent.click(screen.getAllByText('No')[0]);

  screen.getByText('System Authentication Code: 123·456');
});

test('shows dashes when no totp', async () => {
  const mockKiosk = fakeKiosk();
  mockOf(mockKiosk.totp.get).mockResolvedValue(undefined);
  window.kiosk = mockKiosk;

  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    renderScreen({});
  });
  fireEvent.click(screen.getAllByText('No')[0]);

  screen.getByText('System Authentication Code: ---·---');
});

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
