import { LogEventId, BaseLogger, mockBaseLogger } from '@votingworks/logging';
import tmp from 'tmp';
import * as fs from 'fs/promises';
import { Buffer } from 'buffer';
import { PatConnectionStatusReader } from './connection_status_reader';

let logger: BaseLogger;

beforeEach(() => {
  logger = mockBaseLogger();
});

test('logs when it cannot access the gpio pin sysfs file', async () => {
  const reader = new PatConnectionStatusReader(
    logger,
    '/sys/class/gpio/not-a-real-gpio-123/value'
  );
  const result = await reader.open();
  expect(logger.log).toHaveBeenCalledWith(LogEventId.PatDeviceError, 'system', {
    message: expect.stringMatching(/not accessible from VxMarkScan backend/),
  });

  expect(result).toEqual(false);
});

test('isPatDeviceConnected can read "true" pin value from a file', async () => {
  const file = tmp.fileSync();
  const buf = Buffer.of(48); // ASCII char '0'
  await fs.appendFile(file.name, buf);

  const reader = new PatConnectionStatusReader(logger, file.name);
  const result = await reader.open();
  expect(result).toEqual(true);
  const isConnected = await reader.isPatDeviceConnected();
  expect(isConnected).toEqual(true);
});

test('isPatDeviceConnected can read "false" pin value from a file', async () => {
  const file = tmp.fileSync();
  const buf = Buffer.of(49); // ASCII char '1'
  await fs.appendFile(file.name, buf);

  const reader = new PatConnectionStatusReader(logger, file.name);
  const result = await reader.open();
  expect(result).toEqual(true);
  const isConnected = await reader.isPatDeviceConnected();
  expect(isConnected).toEqual(false);
});
