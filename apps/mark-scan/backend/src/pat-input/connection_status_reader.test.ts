import { beforeEach, expect, test, vi } from 'vitest';
import {
  LogEventId,
  mockBaseLogger,
  MockBaseLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { PatConnectionStatusReader } from './connection_status_reader';
import { FAI_100_STATUS_FILENAME } from './constants';

const ASCII_ZERO = 48;
const ASCII_ONE = 49;

let logger: MockBaseLogger<typeof vi.fn>;
let mockWorkspaceDir: tmp.DirResult;
// Replaces /sys/class/gpio
let mockGpioDir: tmp.DirResult;
tmp.setGracefulCleanup();

function expectedStatusToAsciiChar(expectedStatus: boolean) {
  // Value file contains '0' when device is connected and '1' when not connected
  return expectedStatus ? ASCII_ZERO : ASCII_ONE;
}

beforeEach(() => {
  mockWorkspaceDir = tmp.dirSync();
  mockGpioDir = tmp.dirSync();
  logger = mockBaseLogger({ fn: vi.fn });
});

test('logs when it cannot access the gpio pin sysfs file', async () => {
  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-155',
    mockWorkspaceDir.name,
    mockGpioDir.name
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
    const pinDir = tmp.dirSync({
      tmpdir: mockGpioDir.name,
      name: `gpio${address}`,
    });

    // Makes a `value` file and writes one character to it. Analagous to
    // /sys/class/gpio/gpio<n>/value
    const valueFile = tmp.fileSync({
      tmpdir: pinDir.name,
      name: 'value',
    });

    const buf = Buffer.of(expectedStatusToAsciiChar(expectedConnectionStatus));
    await fs.appendFile(valueFile.name, buf);

    const reader = new PatConnectionStatusReader(
      logger,
      'bmd-155',
      mockWorkspaceDir.name,
      mockGpioDir.name
    );
    const result = await reader.open();
    expect(result).toEqual(true);
    const isConnected = await reader.isPatDeviceConnected();
    expect(isConnected).toEqual(expectedConnectionStatus);
    await reader.close();
  }
);

test('bmd-150 implementation happy path', async () => {
  const statusFile = tmp.fileSync({
    tmpdir: mockWorkspaceDir.name,
    name: FAI_100_STATUS_FILENAME,
  });

  const expectedConnectionStatus = true;
  const buf = Buffer.of(expectedStatusToAsciiChar(expectedConnectionStatus));
  await fs.appendFile(statusFile.name, buf);

  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    mockWorkspaceDir.name
  );
  const result = await reader.open();
  expect(result).toEqual(true);
  const isConnected = await reader.isPatDeviceConnected();
  expect(isConnected).toEqual(expectedConnectionStatus);
  await reader.close();
});

test('bmd-150 implementation cannot find workspace', async () => {
  const reader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    '/tmp/notarealdirectory/notarealfile.status'
  );
  const result = await reader.open();
  expect(result).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ConnectToPatInputComplete,
    'system',
    {
      disposition: 'failure',
      message: expect.stringMatching(/Unexpected error trying to open/),
    }
  );
});
