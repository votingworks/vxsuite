import { expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { AudioPlayer } from './player';
import { execFile } from '../exec';

vi.mock('../exec');

const mockExecFile = vi.mocked(execFile);

test('NODE_ENV === production - runs app script via sudo', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const soundsDirectory = '/test/sounds';
  const player = new AudioPlayer({
    nodeEnv: 'production',
    logger,
    outputName: 'builtin_audio.stereo',
    soundsDirectory,
  });

  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: '',
  });

  await player.play('success');

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('sudo', [
    '/vx/code/app-scripts/paplay.sh',
    `${soundsDirectory}/success.mp3`,
    '--device=builtin_audio.stereo',
  ]);
  expect(logger.log).not.toHaveBeenCalled();
});

test('NODE_ENV === development - runs paplay directly', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const soundsDirectory = '/test/sounds';
  const player = new AudioPlayer({
    nodeEnv: 'development',
    logger,
    outputName: 'headphones.stereo',
    soundsDirectory,
  });

  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: '',
  });

  await player.play('error');

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('paplay', [
    `${soundsDirectory}/error.mp3`,
    '--device=headphones.stereo',
  ]);
  expect(logger.log).not.toHaveBeenCalled();
});

test('with execFile error', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new AudioPlayer({
    nodeEnv: 'development',
    logger,
    outputName: 'headphones.stereo',
    soundsDirectory: '/test/sounds',
  });

  mockExecFile.mockRejectedValue('execFile failed');

  await player.play('alarm');

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioPlaybackError,
    {
      message: expect.stringContaining('execFile failed'),
      disposition: 'failure',
    }
  );
});

test('with paplay error', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new AudioPlayer({
    nodeEnv: 'development',
    logger,
    outputName: 'headphones.stereo',
    soundsDirectory: '/test/sounds',
  });

  mockExecFile.mockResolvedValue({
    stderr: 'open(): No such file or directory',
    stdout: '',
  });

  await player.play('warning');

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioPlaybackError,
    {
      message: expect.stringContaining('No such file or directory'),
      disposition: 'failure',
    }
  );
});
