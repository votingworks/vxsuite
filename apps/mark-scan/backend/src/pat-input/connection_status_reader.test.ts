import { LogEventId, BaseLogger, mockBaseLogger } from '@votingworks/logging';
import tmp from 'tmp';
import * as fs from 'fs/promises';
import { Buffer } from 'buffer';
import { PatConnectionStatusReader } from './connection_status_reader';

const ASCII_ZERO = 48;
const ASCII_ONE = 49;

let logger: BaseLogger;
// Replaces /sys/class/gpio
let mockGpioDir: tmp.DirResult;
tmp.setGracefulCleanup();

beforeEach(() => {
  mockGpioDir = tmp.dirSync();
  logger = mockBaseLogger();
});

test('logs when it cannot access the gpio pin sysfs file', async () => {
  const reader = new PatConnectionStatusReader(logger, mockGpioDir.name);

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

function expectedStatusToAsciiChar(expectedStatus: boolean) {
  // Value file contains '0' when device is connected and '1' when not connected
  return expectedStatus ? ASCII_ZERO : ASCII_ONE;
}

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

    const reader = new PatConnectionStatusReader(logger, mockGpioDir.name);
    const result = await reader.open();
    expect(result).toEqual(true);
    const isConnected = await reader.isPatDeviceConnected();
    expect(isConnected).toEqual(expectedConnectionStatus);
    await reader.close();
  }
);
