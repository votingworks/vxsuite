import { expect, Mocked, test, vi } from 'vitest';

import { TestLanguageCode } from '@votingworks/test-utils';
import { deferred, typedAs } from '@votingworks/basics';
import { waitFor } from '../../test/react_testing_library';
import { newAudioPlayer } from './audio_player';
import { DEFAULT_PLAYBACK_RATE, PlaybackRate } from './audio_playback_rate';

const { ENGLISH } = TestLanguageCode;

function audioMocks() {
  const mockSrc = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaElementAudioSourceNode;

  const mockCtx = {
    createMediaElementSource: vi.fn(() => mockSrc),
  } as unknown as Mocked<AudioContext>;

  const mockGain = { gain: { value: 3.14 } } as unknown as GainNode;

  const mockAudio = vi.mocked<HTMLAudioElement>(
    typedAs<Partial<typeof Audio.prototype>>({
      onended: null,
      pause: vi.fn(),
      play: vi.fn(),
      playbackRate: null,
      volume: null,
    }) as unknown as typeof Audio.prototype
  );

  const mockAudioCtor = vi.fn(() => mockAudio);

  return { mockAudio, mockAudioCtor, mockCtx, mockGain, mockSrc };
}

test('audio node graph wiring is sound', () => {
  const { mockAudio, mockAudioCtor, mockCtx, mockGain, mockSrc } = audioMocks();

  newAudioPlayer({
    AudioCtor: mockAudioCtor,
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    output: mockGain,
    webAudioContext: mockCtx,
  });

  expect(mockAudioCtor).toHaveBeenCalledWith('AAAB');
  expect(mockCtx.createMediaElementSource).toHaveBeenCalledWith(mockAudio);
  expect(mockSrc.connect).toHaveBeenCalledWith(mockGain);
});

test('play()', async () => {
  const { mockAudio, mockAudioCtor, mockCtx, mockGain } = audioMocks();

  const player = newAudioPlayer({
    AudioCtor: mockAudioCtor,
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    output: mockGain,
    webAudioContext: mockCtx,
  });

  const onDone1 = vi.fn();
  player.play().then(onDone1, (error) => fail(error));

  const onDone2 = vi.fn();
  player.play().then(onDone2, (error) => fail(error));

  expect(mockAudio.play).toHaveBeenCalledTimes(2);

  expect(onDone1).not.toHaveBeenCalled();
  expect(onDone2).not.toHaveBeenCalled();

  mockAudio.onended?.(null as never);

  await waitFor(() => expect(onDone1).toHaveBeenCalledTimes(1));
  expect(onDone2).toHaveBeenCalledTimes(1);
});

test('stop()', async () => {
  const { mockAudio, mockAudioCtor, mockCtx, mockGain, mockSrc } = audioMocks();

  const player = newAudioPlayer({
    AudioCtor: mockAudioCtor,
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    output: mockGain,
    webAudioContext: mockCtx,
  });
  mockAudio.src = 'AAAB';

  const deferredPlay = deferred<void>();
  mockAudio.play.mockReturnValue(deferredPlay.promise);

  void player.play();

  expect(mockSrc.disconnect).not.toHaveBeenCalled();
  expect(mockAudio.pause).not.toHaveBeenCalled();
  expect(mockAudio.onended).not.toBeNull();
  expect(mockAudio.src).toEqual('AAAB');

  const promiseStop = player.stop();
  expect(mockAudio.pause).not.toHaveBeenCalled(); // Should wait for play.

  deferredPlay.resolve();
  await promiseStop;
  expect(mockAudio.pause).toHaveBeenCalledTimes(1);

  await player.stop(); // Verify idempotence.

  expect(mockAudio.pause).toHaveBeenCalledTimes(2);
  expect(mockSrc.disconnect).toHaveBeenCalledTimes(2);
  expect(mockAudio.onended).toBeNull();
  expect(mockAudio.src).toEqual('');
});

test('setPlaybackRate()', () => {
  const { mockAudio, mockAudioCtor, mockCtx, mockGain } = audioMocks();

  const player = newAudioPlayer({
    AudioCtor: mockAudioCtor,
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    output: mockGain,
    webAudioContext: mockCtx,
  });

  player.setPlaybackRate(PlaybackRate.MINIMUM);
  expect(mockAudio.playbackRate).toEqual(PlaybackRate.MINIMUM);

  player.setPlaybackRate(DEFAULT_PLAYBACK_RATE);
  expect(mockAudio.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);

  player.setPlaybackRate(PlaybackRate.MAXIMUM);
  expect(mockAudio.playbackRate).toEqual(PlaybackRate.MAXIMUM);
});
