import { mockOf, TestLanguageCode } from '@votingworks/test-utils';
import { deferred } from '@votingworks/basics';

import { newTestContext } from '../../test/test_context';
import { PlayAudioClips } from './play_audio_clips';
import { AudioPlayer, AudioPlayerParams, newAudioPlayer } from './audio_player';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { DEFAULT_AUDIO_VOLUME } from './audio_volume';
import { DEFAULT_PLAYBACK_RATE } from './audio_playback_rate';

jest.mock('./audio_player', (): typeof import('./audio_player') => ({
  ...jest.requireActual('./audio_player'),
  newAudioPlayer: jest.fn(),
}));

const { ENGLISH, SPANISH } = TestLanguageCode;

function initMockPlayer() {
  const mockPlayer: jest.Mocked<AudioPlayer> = {
    play: jest.fn(),
    setPlaybackRate: jest.fn(),
    setVolume: jest.fn(),
    stop: jest.fn(),
  };

  const mockOfNewAudioPlayer = mockOf(newAudioPlayer);
  mockOf(mockOfNewAudioPlayer).mockResolvedValue(mockPlayer);

  return { mockPlayer, mockOfNewAudioPlayer };
}

const originalWebAudioContext = window.AudioContext;
const mockWebAudioContext = {
  destination: {
    disconnect: jest.fn(),
  },
  resume: jest.fn(),
  suspend: jest.fn(),
} as unknown as AudioContext;

beforeEach(() => {
  const mockAudioContextConstructor = jest.fn();
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
  mockPlayer.play.mockReturnValue(deferredPlayClip1.promise);

  const onDone = jest.fn();

  render(
    <PlayAudioClips
      clips={[
        { audioId: 'abc', languageCode: ENGLISH },
        { audioId: 'def', languageCode: SPANISH },
      ]}
      onDone={onDone}
    />
  );

  // Verify player instantiation and playback for the 1st clip:
  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
      webAudioContext: mockWebAudioContext,
    })
  );
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(1);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );
  expect(mockPlayer.setVolume).toHaveBeenCalledTimes(1);
  expect(mockPlayer.setVolume).toHaveBeenLastCalledWith(DEFAULT_AUDIO_VOLUME);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();

  // Prep mock player for 2nd clip adn simulate first clip ending:
  const deferredPlayClip2 = deferred<void>();
  mockPlayer.play.mockReturnValue(deferredPlayClip2.promise);
  act(() => deferredPlayClip1.resolve());

  // Verify player instantiation and playback for the 2nd clip:
  await waitFor(() =>
    expect(mockOfNewAudioPlayer).toHaveBeenCalledWith<[AudioPlayerParams]>({
      clip: { id: 'def', dataBase64: 'data-for-def', languageCode: SPANISH },
      webAudioContext: mockWebAudioContext,
    })
  );
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledTimes(2);
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(
    DEFAULT_PLAYBACK_RATE
  );
  expect(mockPlayer.setVolume).toHaveBeenCalledTimes(2);
  expect(mockPlayer.setVolume).toHaveBeenLastCalledWith(DEFAULT_AUDIO_VOLUME);
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(2);
  expect(onDone).not.toHaveBeenCalled();

  // Simulate end of the audio queue and expect a final `stop` call for cleanup:
  mockPlayer.play.mockReset();
  mockPlayer.stop.mockReset();
  act(() => deferredPlayClip2.resolve());
  await waitFor(() => expect(mockPlayer.stop).toHaveBeenCalled());
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);

  // Expect only 2 player instantiations over the course of the test.
  expect(mockOfNewAudioPlayer).toHaveBeenCalledTimes(2);
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

test('volume follows user setting', async () => {
  const { getAudioContext, getAudioControls, mockApiClient, render } =
    newTestContext();
  mockApiClient.getAudioClips.mockResolvedValue([
    { id: 'abc', dataBase64: 'data-for-abc', languageCode: ENGLISH },
  ]);

  const { mockOfNewAudioPlayer, mockPlayer } = initMockPlayer();
  mockPlayer.play.mockReturnValueOnce(deferred<void>().promise);

  render(
    <PlayAudioClips clips={[{ audioId: 'abc', languageCode: ENGLISH }]} />
  );

  await waitFor(() => expect(mockOfNewAudioPlayer).toHaveBeenCalled());
  expect(mockPlayer.setVolume).toHaveBeenCalledTimes(1);
  expect(mockPlayer.setVolume).toHaveBeenLastCalledWith(DEFAULT_AUDIO_VOLUME);

  act(() => getAudioControls()?.increaseVolume());

  const newVolume = getAudioContext()?.volume;
  await waitFor(() =>
    expect(mockPlayer.setVolume).toHaveBeenLastCalledWith(newVolume)
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
