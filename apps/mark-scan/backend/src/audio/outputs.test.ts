import { expect, test, vi } from 'vitest';
import { execFile } from '@votingworks/backend';
import { sleep } from '@votingworks/basics';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { getNodeEnv } from '../globals';
import {
  AudioOutput,
  MAX_PULSE_COMMAND_ATTEMPTS,
  setAudioOutput,
} from './outputs';

vi.mock(import('@votingworks/backend'));

vi.mock(import('../globals.js'));

vi.mock(import('@votingworks/basics'), async (importActual) => ({
  ...(await importActual()),
  sleep: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const mockSleep = vi.mocked(sleep);
const mockGetNodeEnv = vi.mocked(getNodeEnv);
const mockLog = mockLogger({ fn: vi.fn });

test('setAudioOutput - success on retry', async () => {
  mockGetNodeEnv.mockReturnValue('production');
  mockSleep.mockResolvedValue();
  mockExecFile.mockRejectedValueOnce('command failed');
  mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });

  await setAudioOutput(AudioOutput.SPEAKER, mockLog);

  expect(mockExecFile).toHaveBeenCalledTimes(2);
  expect(mockSleep).toHaveBeenCalledTimes(1);
  expect(mockLog.log).toHaveBeenCalledTimes(1);
  expect(mockLog.log).toHaveBeenCalledWith(
    LogEventId.Info,
    'system',
    expect.objectContaining({
      message: expect.stringContaining('command failed'),
    })
  );
});

test('setAudioOutput - retries and rethrows on failure', async () => {
  mockGetNodeEnv.mockReturnValue('production');
  mockSleep.mockResolvedValue();
  mockExecFile.mockRejectedValue('command failed');

  await expect(() =>
    setAudioOutput(AudioOutput.SPEAKER, mockLog)
  ).rejects.toMatchObject({
    message: /command failed/,
  });

  expect(mockExecFile).toHaveBeenCalledTimes(MAX_PULSE_COMMAND_ATTEMPTS);
  expect(mockSleep).toHaveBeenCalledTimes(MAX_PULSE_COMMAND_ATTEMPTS - 1);
  expect(mockLog.log).toHaveBeenCalledTimes(MAX_PULSE_COMMAND_ATTEMPTS - 1);
});

test('setAudioOutput - no-op in non-prod environments', async () => {
  mockGetNodeEnv.mockReturnValue('development');

  await setAudioOutput(AudioOutput.SPEAKER, mockLog);

  expect(mockExecFile).not.toHaveBeenCalled();
  expect(mockSleep).not.toHaveBeenCalled();
  expect(mockLog.log).not.toHaveBeenCalled();
});
