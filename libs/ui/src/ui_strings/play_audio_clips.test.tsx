import { afterAll, beforeEach, expect, Mocked, test, vi } from 'vitest';
import { TestLanguageCode } from '@votingworks/test-utils';
import { deferred } from '@votingworks/basics';

import { newTestContext } from '../../test/test_context';
import { PlayAudioClips } from './play_audio_clips';
import { AudioPlayer, AudioPlayerParams, newAudioPlayer } from './audio_player';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { DEFAULT_PLAYBACK_RATE } from './audio_playback_rate';

vi.mock(import('./audio_player.js'), async (importActual) => ({
  ...(await importActual()),
  newAudioPlayer: vi.fn(),
}));

const { ENGLISH, SPANISH } = TestLanguageCode;

function initMockPlayer() {
  const mockPlayer: Mocked<AudioPlayer> = {
    play: vi.fn(),
    setPlaybackRate: vi.fn(),
    stop: vi.fn(),
  };

  const mockOfNewAudioPlayer = vi.mocked(newAudioPlayer);
  vi.mocked(mockOfNewAudioPlayer).mockReturnValue(mockPlayer);

  return { mockPlayer, mockOfNewAudioPlayer };
}

const mockGainNode = { gain: { value: 3.14 } } as unknown as GainNode;

const originalWebAudioContext = window.AudioContext;
const mockWebAudioContext = {
  createGain: () => mockGainNode,
  destination: {
    disconnect: vi.fn(),
  },
  resume: vi.fn(),
  suspend: vi.fn(),
} as unknown as AudioContext;

beforeEach(() => {
  const mockAudioContextConstructor = vi.fn();
  mockAudioContextConstructor.mockReturnValue(mockWebAudioContext);
  window.AudioContext = mockAudioContextConstructor;
});

afterAll(() => {
  window.AudioContext = originalWebAudioContext;
});

test('plays clips in order', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAudioClips.mockResolvedValue([
    { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
    { id: 'def', dataBase64: 'data-for-def', languageCode: SPANISH },
  ]);

  const { mockOfNewAudioPlayer, mockPlayer } = initMockPlayer();
  const deferredPlayClip1 = deferred<void>();
  mockPlayer.play.mockReturnValueOnce(deferredPlayClip1.promise);

  const onDone = vi.fn();

  render(
    <PlayAudioClips
      clips={[
        { audioId: 'abc', languageCode: ENGLISH },
        { audioId: 'def', languageCode: SPANISH },
        { audioId: 'def', languageCode: SPANISH }, // Should handle repeats.
      ]}
      onDone={onDone}
    />
  );

  // Verify player instantiation and playback for the 1st clip:
  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
      output: mockGainNode,
      webAudioContext: mockWebAudioContext,
    })
  );
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(1);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();

  // Prep mock player for 2nd clip and simulate first clip ending:
  const deferredPlayClip2 = deferred<void>();
  mockPlayer.play.mockReturnValueOnce(deferredPlayClip2.promise);
  act(() => deferredPlayClip1.resolve());

  // Verify player instantiation and playback for the 2nd clip:
  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'def', dataBase64: 'data-for-def', languageCode: SPANISH },
      output: mockGainNode,
      webAudioContext: mockWebAudioContext,
    })
  );
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(2);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(2);
  expect(onDone).not.toHaveBeenCalled();

  // Prep mock player for 3rd clip and simulate 2nd clip ending:
  const deferredPlayClip3 = deferred<void>();
  mockPlayer.play.mockReturnValueOnce(deferredPlayClip3.promise);
  act(() => deferredPlayClip2.resolve());

  // Verify handling of repeated audio (clip #2 -> clip #3):
  await waitFor(() => expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(3));
  expect(mockOfNewAudioPlayer).toHaveBeenLastCalledWith<[AudioPlayerParams]>({
    clip: { id: 'def', dataBase64: 'data-for-def', languageCode: SPANISH },
    output: mockGainNode,
    webAudioContext: mockWebAudioContext,
  });
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(3);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );
  expect(mockPlayer.play).toHaveBeenCalledTimes(3);
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(3);
  expect(onDone).not.toHaveBeenCalled();

  // Simulate end of the audio queue and expect a final `stop` call for cleanup:
  mockPlayer.play.mockReset();
  mockPlayer.stop.mockReset();
  act(() => deferredPlayClip3.resolve());
  await waitFor(() => expect(mockPlayer.stop).toHaveBeenCalled());
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);

  // Expect no aditional player instantiations.
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(3);
});

test('works without an onDone prop value', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAudioClips.mockResolvedValue([
    { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
  ]);

  const { mockPlayer } = initMockPlayer();
  mockPlayer.play.mockResolvedValue();

  // Render without `onDone` to verify no lifecycle errors are thrown:
  render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
});

test('playback rate follows user setting', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();
  mockApiClient.getAudioClips.mockResolvedValue([
    { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
  ]);

  const { mockOfNewAudioPlayer, mockPlayer } = initMockPlayer();
  mockPlayer.play.mockReturnValueOnce(deferred<void>().promise);

  render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );

  await waitFor(() => expect(mockOfNewAudioPlayer).toHaveBeenCalled());
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(1);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );

  act(() => getAudioContext()?.decreasePlaybackRate());

  const newPlaybackRate = getAudioContext()?.playbackRate;
  await waitFor(() =>
    expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(newPlaybackRate)
  );
});

test('stops playback and resets when clip queue is changed', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAudioClips.mockResolvedValue([
    { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
    { id: 'def', dataBase64: 'data-for-def', languageCode: ENGLISH },
  ]);

  const { mockOfNewAudioPlayer, mockPlayer } = initMockPlayer();
  mockPlayer.play.mockReturnValue(deferred<void>().promise);

  const { rerender } = render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );

  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
      output: mockGainNode,
      webAudioContext: mockWebAudioContext,
    })
  );
  expect(mockPlayer.stop).not.toHaveBeenCalled();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);

  rerender(
    <PlayAudioClips clips={[{ audioId: 'def', languageCode: ENGLISH }]} />
  );

  expect(mockPlayer.stop).toHaveBeenCalled();
  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'def', dataBase64: 'data-for-def', languageCode: ENGLISH },
      output: mockGainNode,
      webAudioContext: mockWebAudioContext,
    })
  );

  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
});

test('is no-op in environments with no web AudioContext support', async () => {
  window.AudioContext = originalWebAudioContext;
  const { render } = newTestContext();
  const { mockOfNewAudioPlayer } = initMockPlayer();

  render(
    <div>
      <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
      <span data-testid="renderDone" />
    </div>
  );

  await screen.findByTestId('renderDone');

  expect(mockOfNewAudioPlayer).not.toHaveBeenCalled();
});

test('is no-op while loading clip data', async () => {
  const { mockApiClient, render } = newTestContext();
  const { mockOfNewAudioPlayer } = initMockPlayer();

  mockApiClient.getAudioClips.mockImplementation(() => new Promise(() => {}));

  render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );

  await waitFor(() => expect(mockApiClient.getAudioClips).toHaveBeenCalled());

  expect(mockOfNewAudioPlayer).not.toHaveBeenCalled();
});

test('handles missing clip data', async () => {
  const { mockApiClient, render } = newTestContext();
  const { mockOfNewAudioPlayer } = initMockPlayer();

  mockApiClient.getAudioClips.mockResolvedValue([]);

  render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );

  await waitFor(() => expect(mockApiClient.getAudioClips).toHaveBeenCalled());

  expect(mockOfNewAudioPlayer).not.toHaveBeenCalled();
});
