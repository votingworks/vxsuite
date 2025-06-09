import { audio } from '@votingworks/backend';
import { expect, test, vi } from 'vitest';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { getAudioInfo } from './info';

vi.mock('@votingworks/backend');

vi.useFakeTimers();

const mockGetAudioInfo = vi.mocked(audio.getAudioInfo);

test('retries with increasing delays', async () => {
  mockGetAudioInfo.mockRejectedValueOnce('first failure');

  const baseRetryDelayMs = 500;
  const logger = mockLogger({ fn: vi.fn });
  const deferredAudioInfo = getAudioInfo({
    baseRetryDelayMs,
    logger,
    maxAttempts: 4,
    nodeEnv: 'development',
  });

  // Attempt #1: should retry on API error.
  await vi.advanceTimersByTimeAsync(0);
  expect(logger.log).toHaveBeenLastCalledWith(LogEventId.Info, 'system', {
    message: expect.stringContaining('first failure'),
  });

  // Attempt #2: should retry on missing builtin audio info.
  mockGetAudioInfo.mockResolvedValueOnce({});
  await vi.advanceTimersByTimeAsync(baseRetryDelayMs);
  expect(logger.log).toHaveBeenLastCalledWith(LogEventId.Info, 'system', {
    message: expect.stringContaining('builtin audio device not found'),
  });

  // Next delay should be longer than the base:
  await vi.advanceTimersByTimeAsync(baseRetryDelayMs);
  expect(mockGetAudioInfo).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenCalledTimes(2);

  // Attempt #3: should retry if USB audio is detected, but not builtin audio.
  mockGetAudioInfo.mockResolvedValueOnce({ usb: { name: 'usb.stereo' } });
  await vi.advanceTimersByTimeAsync(baseRetryDelayMs);
  expect(logger.log).toHaveBeenLastCalledWith(LogEventId.Info, 'system', {
    message: expect.stringContaining('builtin audio device not found'),
  });

  // Attempt #4: should succeed if builtin audio detected.
  mockGetAudioInfo.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'usb.stereo' },
  });
  await vi.advanceTimersByTimeAsync(baseRetryDelayMs * 3);
  expect(await deferredAudioInfo).toEqual({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
  });

  // No more logs expected after attempt #3.
  expect(logger.log).toHaveBeenCalledTimes(3);
});

test('throws last error after last retry', async () => {
  mockGetAudioInfo.mockRejectedValueOnce('first failure');

  const baseRetryDelayMs = 500;
  const deferredAudioInfo = getAudioInfo({
    baseRetryDelayMs,
    logger: mockLogger({ fn: vi.fn }),
    maxAttempts: 3,
    nodeEnv: 'development',
  });

  // Attempt #1:
  await vi.advanceTimersByTimeAsync(0);

  // Attempt #2:
  mockGetAudioInfo.mockRejectedValueOnce('second failure');
  await vi.advanceTimersByTimeAsync(baseRetryDelayMs);

  // Attempt #3:
  mockGetAudioInfo.mockResolvedValueOnce({ usb: { name: 'usb.stereo' } });
  vi.advanceTimersByTime(baseRetryDelayMs * 2);

  await expect(deferredAudioInfo).rejects.toThrow(
    'builtin audio device not found'
  );
});
