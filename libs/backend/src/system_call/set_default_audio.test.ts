import { expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { err, ok } from '@votingworks/basics';
import { execFile } from '../exec';
import { SetDefaultAudioResult, setDefaultAudio } from './set_default_audio';

vi.mock(import('../exec.js'));

const mockExecFile = vi.mocked(execFile);

test('NODE_ENV=production - runs app script via sudo', async () => {
  mockExecFile.mockResolvedValue({ stderr: '', stdout: '' });

  const sinkName = 'usb.stereo';
  const logger = mockLogger({ fn: vi.fn });
  const result = await setDefaultAudio(sinkName, {
    logger,
    nodeEnv: 'production',
  });
  expect(result).toEqual(ok());

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('sudo', [
    '/vx/code/app-scripts/pactl.sh',
    'set-default-sink',
    sinkName,
  ]);

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceSelected,
    { message: expect.stringContaining(sinkName), disposition: 'success' }
  );
});

test('NODE_ENV=development - runs pactl directly', async () => {
  mockExecFile.mockResolvedValue({ stderr: '', stdout: '' });

  const sinkName = 'usb.stereo';
  const logger = mockLogger({ fn: vi.fn });
  const result = await setDefaultAudio(sinkName, {
    logger,
    nodeEnv: 'development',
  });
  expect(result).toEqual(ok());

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('pactl', [
    'set-default-sink',
    sinkName,
  ]);

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceSelected,
    { message: expect.stringContaining(sinkName), disposition: 'success' }
  );
});

test('execFile error', async () => {
  const error = 'execFile failed';
  mockExecFile.mockRejectedValue(error);

  const logger = mockLogger({ fn: vi.fn });
  expect(
    await setDefaultAudio('usb.stereo', { logger, nodeEnv: 'production' })
  ).toEqual<SetDefaultAudioResult>(err({ code: 'execFileError', error }));

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceSelectionError,
    {
      message: expect.stringContaining(error),
      disposition: 'failure',
    }
  );
});

test('pactl error', async () => {
  const error = 'Failure: No such entity';
  mockExecFile.mockResolvedValue({ stderr: error, stdout: '' });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(
    await setDefaultAudio('cup_and_string.mono', { logger, nodeEnv })
  ).toEqual<SetDefaultAudioResult>(err({ code: 'pactlError', error }));

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceSelectionError,
    {
      message: expect.stringContaining(error),
      disposition: 'failure',
    }
  );
});
