import { beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  LogEventId,
  mockBaseLogger,
  MockBaseLogger,
} from '@votingworks/logging';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import {
  CONNECTION_RETRY_INTERVAL_MS,
  CONNECTION_TIMEOUT_MS,
  PatConnectionStatusReader,
} from './connection_status_reader';
import { FAI_100_STATUS_FILENAME } from './constants';

const ASCII_ZERO = 48;
const ASCII_ONE = 49;

let logger: MockBaseLogger;
let mockWorkspaceDir: string;
// Replaces /sys/class/gpio
let mockGpioDir: string;

function expectedStatusToAsciiChar(expectedStatus: boolean) {
  // Value file contains '0' when device is connected and '1' when not connected
  return expectedStatus ? ASCII_ZERO : ASCII_ONE;
}

beforeEach(() => {
  mockWorkspaceDir = makeTemporaryDirectory();
  mockGpioDir = makeTemporaryDirectory();
  logger = mockBaseLogger({ fn: vi.fn });
});

test('logs when it cannot access the gpio pin sysfs file', async () => {
  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-155',
    mockWorkspaceDir,
    mockGpioDir
  );

  const result = await reader.open();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ConnectToPatInputComplete,
    'system',
    {
      disposition: 'failure',
      message: expect.stringMatching(
        /PatConnectionStatusReader failed to connect to PAT input. Attempted pins: [990,478]/
      ),
    }
  );

  expect(result).toEqual(false);
  await reader.close();
});

const pinAddresses = [
  { address: 478, expectedConnectionStatus: true },
  { address: 478, expectedConnectionStatus: false },
  { address: 990, expectedConnectionStatus: true },
  { address: 990, expectedConnectionStatus: false },
];

test.each(pinAddresses)(
  'isPatDeviceConnected can read "$expectedConnectionStatus" from pin $address value file',
  async ({ address, expectedConnectionStatus }) => {
    // Makes a directory for the pin. Analagous to /sys/class/gpio/gpio<n>
    const pinDir = join(mockGpioDir, `gpio${address}`);
    await fs.mkdir(pinDir, { recursive: true });

    // Makes a `value` file and writes one character to it. Analagous to
    // /sys/class/gpio/gpio<n>/value
    const valueFile = join(pinDir, 'value');

    const buf = Buffer.of(expectedStatusToAsciiChar(expectedConnectionStatus));
    await fs.writeFile(valueFile, buf);

    const reader = new PatConnectionStatusReader(
      logger,
      'bmd-155',
      mockWorkspaceDir,
      mockGpioDir
    );
    const result = await reader.open();
    expect(result).toEqual(true);
    const isConnected = await reader.isPatDeviceConnected();
    expect(isConnected).toEqual(expectedConnectionStatus);
    await reader.close();
  }
);

test('bmd-150 implementation happy path', async () => {
  const statusFile = join(mockWorkspaceDir, FAI_100_STATUS_FILENAME);

  const expectedConnectionStatus = true;
  const buf = Buffer.of(expectedStatusToAsciiChar(expectedConnectionStatus));
  await fs.writeFile(statusFile, buf);

  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    mockWorkspaceDir
  );
  const result = await reader.open();
  expect(result).toEqual(true);
  const isConnected = await reader.isPatDeviceConnected();
  expect(isConnected).toEqual(expectedConnectionStatus);
  await reader.close();
});

test('bmd-150 implementation cannot find status file', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });

  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    '/tmp/notarealdirectory/notarealfile.status'
  );

  const openPromise = reader.open();

  // Advance timers and flush promises in steps to handle the retry loop
  const steps = Math.ceil(CONNECTION_TIMEOUT_MS / CONNECTION_RETRY_INTERVAL_MS);
  for (let i = 0; i <= steps; i += 1) {
    await vi.advanceTimersByTimeAsync(CONNECTION_RETRY_INTERVAL_MS);
  }

  const result = await openPromise;

  expect(result).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ConnectToPatInputComplete,
    'system',
    {
      disposition: 'failure',
      message: expect.stringMatching(/Could not find status file at/),
    }
  );

  vi.useRealTimers();
});
