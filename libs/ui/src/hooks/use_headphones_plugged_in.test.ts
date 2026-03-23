import { beforeEach, expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { useHeadphonesPluggedIn } from './use_headphones_plugged_in.js';
import { AUDIO_INFO_POLLING_INTERVAL_MS } from '../system_call_api.js';
import { newTestContext } from '../../test/test_context.js';
import { act, waitFor } from '../../test/react_testing_library.js';

function createTestContext() {
  return newTestContext({
    // The audio context uses the `useHeadphonesPluggedIn` hook, so disabling
    // the audio context to focus these tests on the test instance of the hook.
    uiStringsApiOptions: { noAudio: true },
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });

  vi.unstubAllEnvs();
  vi.stubEnv(
    BooleanEnvironmentVariableName.ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES,
    'TRUE'
  );
});

test('uses getAudioInfo system call API', async () => {
  const { mockApiClient, renderHook } = createTestContext();
  mockApiClient.getAudioInfo.mockResolvedValueOnce({});

  const { result, unmount } = renderHook(useHeadphonesPluggedIn);
  await waitFor(() => expect(result.current).toEqual(false));

  mockApiClient.getAudioInfo.mockResolvedValueOnce({
    usb: { name: 'alsa_output.usb-Generic.analog-stereo' },
  });
  vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  await waitFor(() => expect(result.current).toEqual(true));

  mockApiClient.getAudioInfo.mockResolvedValueOnce({
    builtin: {
      headphonesActive: true,
      name: 'alsa_output.pci.analog-stereo',
    },
  });
  vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  await waitFor(() => expect(result.current).toEqual(true));

  mockApiClient.getAudioInfo.mockResolvedValueOnce({
    builtin: {
      headphonesActive: false,
      name: 'alsa_output.pci.analog-stereo',
    },
  });
  vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  await waitFor(() => expect(result.current).toEqual(false));

  unmount(); // Prevent any further API polling.
});

test('always returns true if headphones restriction flag is disabled', async () => {
  vi.stubEnv(
    BooleanEnvironmentVariableName.ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES,
    'FALSE'
  );

  const { mockApiClient, renderHook } = createTestContext();
  mockApiClient.getAudioInfo.mockResolvedValue({});

  const { result } = renderHook(useHeadphonesPluggedIn);

  await waitFor(() => expect(result.current).toEqual(true));
  expect(result.current).toEqual(true);

  act(() => {
    vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  });
  await waitFor(() => {
    // wait for promises
  });
  expect(mockApiClient.getAudioInfo).not.toHaveBeenCalled();
});
