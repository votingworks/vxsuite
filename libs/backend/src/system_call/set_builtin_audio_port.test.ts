import { expect, test, vi } from 'vitest';
import { sleep } from '@votingworks/basics';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { execFile } from '../exec';
import { AudioPort, setBuiltinAudioPort } from './set_builtin_audio_port';

vi.mock(import('../exec.js'));

vi.mock(import('@votingworks/basics'), async (importActual) => ({
  ...(await importActual()),
  sleep: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const mockSleep = vi.mocked(sleep);
const mockLog = mockLogger({ fn: vi.fn });

test('success on retry', async () => {
  mockSleep.mockResolvedValue();
  mockExecFile.mockRejectedValueOnce('command failed');
  mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });

  await setBuiltinAudioPort('production', AudioPort.SPEAKER, mockLog, {
    maxRetries: 3,
  });

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

test('retries and rethrows on failure', async () => {
  mockSleep.mockResolvedValue();
  mockExecFile.mockRejectedValue('command failed');

  await expect(() =>
    setBuiltinAudioPort('production', AudioPort.SPEAKER, mockLog, {
      maxRetries: 3,
    })
  ).rejects.toMatchObject({
    message: /command failed/,
  });

  expect(mockExecFile).toHaveBeenCalledTimes(4);
  expect(mockSleep).toHaveBeenCalledTimes(3);
  expect(mockLog.log).toHaveBeenCalledTimes(3);
});

test('no-op in non-prod environments', async () => {
  await setBuiltinAudioPort('development', AudioPort.SPEAKER, mockLog, {
    maxRetries: 3,
  });

  expect(mockExecFile).not.toHaveBeenCalled();
  expect(mockSleep).not.toHaveBeenCalled();
  expect(mockLog.log).not.toHaveBeenCalled();
});
