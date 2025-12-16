import { expect, test, vi } from 'vitest';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { getAudioInfoWithRetry } from './get_audio_info_with_retry';
import * as audio from '../system_call/get_audio_info';

vi.mock('../system_call/get_audio_info');

let mockIsIntegrationTest = false;
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isIntegrationTest: () => mockIsIntegrationTest,
}));

vi.useFakeTimers();

const mockGetAudioInfo = vi.mocked(audio.getAudioInfo);

test('retries with increasing delays', async () => {
  mockGetAudioInfo.mockRejectedValueOnce('first failure');

  const baseRetryDelayMs = 500;
  const logger = mockLogger({ fn: vi.fn });
  const deferredAudioInfo = getAudioInfoWithRetry({
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
  const deferredAudioInfo = getAudioInfoWithRetry({
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

test('returns mock audio info during integration tests', async () => {
  mockIsIntegrationTest = true;

  const logger = mockLogger({ fn: vi.fn });
  const audioInfo = await getAudioInfoWithRetry({
    baseRetryDelayMs: 500,
    logger,
    maxAttempts: 4,
    nodeEnv: 'development',
  });

  expect(audioInfo).toEqual({
    builtin: { headphonesActive: false, name: 'mock.builtin.stereo' },
  });

  // Should not call the real getAudioInfo during integration tests:
  expect(mockGetAudioInfo).not.toHaveBeenCalled();

  mockIsIntegrationTest = false;
});
