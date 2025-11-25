import { beforeEach, expect, test, vi, Mock } from 'vitest';

import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { execFile } from '../exec';
import { getUsbPortStatus, toggleUsbPorts } from './usb_port_status';

vi.mock(import('../exec.js'));

let mockExecFile: Mock<typeof execFile>;
let logger: MockLogger;

beforeEach(() => {
  mockExecFile = vi.mocked(execFile);
  logger = mockLogger({ fn: vi.fn });
});

test('USB port enabling and disabling', async () => {
  const nodeEnv = 'production';
  const scriptPath = '/vx/code/app-scripts/set-usb-port-status.sh';

  mockExecFile.mockResolvedValue({ stderr: '', stdout: 'usb allowed' });
  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: true,
  });
  expect(mockExecFile).toHaveBeenCalledTimes(1);
  expect(mockExecFile).toHaveBeenLastCalledWith('sudo', [scriptPath]);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are enabled' }
  );

  await toggleUsbPorts({ action: 'disable', logger, nodeEnv });
  expect(mockExecFile).toHaveBeenCalledTimes(2);
  expect(mockExecFile).toHaveBeenLastCalledWith('sudo', [scriptPath, 'block']);
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortsToggled,
    'unknown',
    { message: 'The user has disabled USB ports.' }
  );

  mockExecFile.mockResolvedValue({ stderr: '', stdout: 'usb blocked' });
  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: false,
  });
  expect(mockExecFile).toHaveBeenCalledTimes(3);
  expect(mockExecFile).toHaveBeenLastCalledWith('sudo', [scriptPath]);
  expect(logger.log).toHaveBeenCalledTimes(3);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are disabled' }
  );

  await toggleUsbPorts({ action: 'enable', logger, nodeEnv });
  expect(mockExecFile).toHaveBeenCalledTimes(4);
  expect(mockExecFile).toHaveBeenLastCalledWith('sudo', [scriptPath, 'allow']);
  expect(logger.log).toHaveBeenCalledTimes(4);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortsToggled,
    'unknown',
    { message: 'The user has enabled USB ports.' }
  );

  mockExecFile.mockResolvedValue({ stderr: '', stdout: 'usb allowed' });
  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: true,
  });
  expect(mockExecFile).toHaveBeenCalledTimes(5);
  expect(mockExecFile).toHaveBeenLastCalledWith('sudo', [scriptPath]);
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are enabled' }
  );
});

test('Mocked USB port blocking in development', async () => {
  const nodeEnv = 'development';

  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: true,
  });
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are enabled' }
  );

  await toggleUsbPorts({ action: 'disable', logger, nodeEnv });
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortsToggled,
    'unknown',
    { message: 'The user has disabled USB ports.' }
  );

  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: false,
  });
  expect(logger.log).toHaveBeenCalledTimes(3);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are disabled' }
  );

  await toggleUsbPorts({ action: 'enable', logger, nodeEnv });
  expect(logger.log).toHaveBeenCalledTimes(4);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortsToggled,
    'unknown',
    { message: 'The user has enabled USB ports.' }
  );

  expect(await getUsbPortStatus({ logger, nodeEnv })).toEqual({
    enabled: true,
  });
  expect(logger.log).toHaveBeenCalledTimes(5);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.UsbPortStatus,
    'system',
    { message: 'USB ports are enabled' }
  );
});
