import { expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { execFile } from '@votingworks/backend';
import { Player } from './player';

vi.mock(import('@votingworks/backend'));

const mockExecFile = vi.mocked(execFile);

test('NODE_ENV === production - runs app script via sudo', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new Player('production', logger, 'builtin_audio.stereo');

  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: '',
  });

  await player.play('success');

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('sudo', [
    '/vx/code/app-scripts/paplay.sh',
    `${__dirname}/success.mp3`,
    '--device=builtin_audio.stereo',
  ]);
  expect(logger.log).not.toHaveBeenCalled();
});

test('NODE_ENV === development - runs paplay directly', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new Player('development', logger, 'headphones.stereo');

  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: '',
  });

  await player.play('error');

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('paplay', [
    `${__dirname}/error.mp3`,
    '--device=headphones.stereo',
  ]);
  expect(logger.log).not.toHaveBeenCalled();
});

test('with execFile error', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new Player('development', logger, 'headphones.stereo');

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
  const player = new Player('development', logger, 'headphones.stereo');

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
