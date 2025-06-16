import { expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { err, ok } from '@votingworks/basics';
import { execFile } from '../exec';
import { SetAudioVolumeResult, setAudioVolume } from './set_audio_volume';

vi.mock(import('../exec.js'));

const mockExecFile = vi.mocked(execFile);

test('NODE_ENV=production - runs app script via sudo', async () => {
  mockExecFile.mockResolvedValue({ stderr: '', stdout: '' });

  const sinkName = 'usb.stereo';
  const logger = mockLogger({ fn: vi.fn });
  const result = await setAudioVolume({
    logger,
    nodeEnv: 'production',
    sinkName,
    volumePct: 100,
  });
  expect(result).toEqual(ok());

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('sudo', [
    '/vx/code/app-scripts/pactl.sh',
    'set-sink-volume',
    sinkName,
    '100%',
  ]);

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioVolumeChanged,
    { message: expect.stringContaining(sinkName), disposition: 'success' }
  );
});

test('NODE_ENV=development - runs pactl directly', async () => {
  mockExecFile.mockResolvedValue({ stderr: '', stdout: '' });

  const sinkName = 'usb.stereo';
  const logger = mockLogger({ fn: vi.fn });
  const result = await setAudioVolume({
    logger,
    nodeEnv: 'development',
    sinkName,
    volumePct: 50.5,
  });
  expect(result).toEqual(ok());

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('pactl', [
    'set-sink-volume',
    sinkName,
    '50.5%',
  ]);

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioVolumeChanged,
    { message: expect.stringContaining(sinkName), disposition: 'success' }
  );
});

test('invalid value', async () => {
  await expect(
    setAudioVolume({
      logger: mockLogger({ fn: vi.fn }),
      nodeEnv: 'production',
      sinkName: 'usb.stereo',
      volumePct: -1,
    })
  ).rejects.toThrow('Audio volume must be between 0 and 100');

  await expect(
    setAudioVolume({
      logger: mockLogger({ fn: vi.fn }),
      nodeEnv: 'production',
      sinkName: 'usb.stereo',
      volumePct: 100.1,
    })
  ).rejects.toThrow('Audio volume must be between 0 and 100');
});

test('execFile error', async () => {
  const error = 'execFile failed';
  mockExecFile.mockRejectedValue(error);

  const logger = mockLogger({ fn: vi.fn });
  expect(
    await setAudioVolume({
      logger,
      nodeEnv: 'production',
      sinkName: 'usb.stereo',
      volumePct: 100,
    })
  ).toEqual<SetAudioVolumeResult>(err({ code: 'execFileError', error }));

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioVolumeChangeError,
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
  expect(
    await setAudioVolume({
      logger,
      nodeEnv: 'production',
      sinkName: 'cup_and_string.mono',
      volumePct: 20,
    })
  ).toEqual<SetAudioVolumeResult>(err({ code: 'pactlError', error }));

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioVolumeChangeError,
    {
      message: expect.stringContaining(error),
      disposition: 'failure',
    }
  );
});
