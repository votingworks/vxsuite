import { describe, expect, test, vi } from 'vitest';
import { useAudioEnabled } from '@votingworks/ui';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { deferred, sleep } from '@votingworks/basics';
import { renderHook } from '../test/react_testing_library';
import { ApiProvider } from './api_provider';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import * as api from './api';

const mockAudioControls = mockUseAudioControls(vi.fn);
vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useAudioControls: () => mockAudioControls,
  useAudioEnabled: vi.fn(),
}));

const mockUseAudioEnabled = vi.mocked(useAudioEnabled);

describe('playSound', () => {
  test('mutes TTS audio while server sound is playing', async () => {
    const mockClient = createApiMock();
    const wrapper = testHookWrapper(mockClient);
    mockUseAudioEnabled.mockReturnValue(true);

    const { result } = renderHook(api.playSound.useMutation, { wrapper });
    expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();

    const deferredPlay = mockPlaySound(mockClient);

    const deferredMutate = result.current.mutateAsync({ name: 'success' });
    await sleep(0); // Wait for mutation to run in next tick.
    expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(false);

    deferredPlay.resolve();
    await deferredMutate;
    expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(true);
  });

  test('does NOT unmute TTS audio if already muted by the voter', async () => {
    const mockClient = createApiMock();
    const wrapper = testHookWrapper(mockClient);
    mockUseAudioEnabled.mockReturnValue(false);

    const { result } = renderHook(api.playSound.useMutation, { wrapper });
    expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();

    const deferredPlay = mockPlaySound(mockClient);

    const deferredMutate = result.current.mutateAsync({ name: 'success' });
    await sleep(0); // Wait for mutation to run in next tick.
    expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(false);

    deferredPlay.resolve();
    await deferredMutate;
    expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(false);
  });

  function mockPlaySound(client: ApiMock) {
    const deferredPlay = deferred<void>();
    client.mockApiClient.playSound
      .expectCallWith({ name: 'success' })
      .returns(deferredPlay.promise);

    return deferredPlay;
  }
});

function testHookWrapper(client: ApiMock) {
  return function TestHookWrapper(props: { children: React.ReactNode }) {
    return <ApiProvider {...props} apiClient={client.mockApiClient} noAudio />;
  };
}
