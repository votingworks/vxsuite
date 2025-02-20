import { beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { useHeadphonesPluggedIn } from './use_headphones_plugged_in';
import { AUDIO_INFO_POLLING_INTERVAL_MS } from '../system_call_api';
import { newTestContext } from '../../test/test_context';
import { act, waitFor } from '../../test/react_testing_library';

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: vi.fn(),
}));

const mockFeatureFlagger = getFeatureFlagMock();

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

  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES
  );

  vi.mocked(isFeatureFlagEnabled).mockImplementation(
    mockFeatureFlagger.isEnabled
  );
});

test('uses getAudioInfo system call API', async () => {
  const { mockApiClient, renderHook } = createTestContext();
  mockApiClient.getAudioInfo.mockResolvedValueOnce({ headphonesActive: false });

  const { result, unmount } = renderHook(useHeadphonesPluggedIn);
  await waitFor(() => expect(result.current).toEqual(false));

  mockApiClient.getAudioInfo.mockResolvedValueOnce({ headphonesActive: true });
  vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  await waitFor(() => expect(result.current).toEqual(true));

  mockApiClient.getAudioInfo.mockResolvedValueOnce({ headphonesActive: false });
  vi.advanceTimersByTime(AUDIO_INFO_POLLING_INTERVAL_MS);
  await waitFor(() => expect(result.current).toEqual(false));

  unmount(); // Prevent any further API polling.
});

test('always returns true if headphones restriction flag is disabled', async () => {
  mockFeatureFlagger.disableFeatureFlag(
    BooleanEnvironmentVariableName.ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES
  );

  const { mockApiClient, renderHook } = createTestContext();
  mockApiClient.getAudioInfo.mockResolvedValue({ headphonesActive: false });

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
