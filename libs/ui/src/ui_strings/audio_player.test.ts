import { Buffer } from 'node:buffer';
import type {
  BasicPlaybackState,
  GrainPlayer,
  Param,
  ToneAudioBuffer,
} from 'tone';

import { UiStringAudioClip } from '@votingworks/types';

import { TestLanguageCode } from '@votingworks/test-utils';
import { waitFor } from '../../test/react_testing_library';
import {
  SILENT_SAMPLE_ABSOLUTE_VALUE_THRESHOLD,
  newAudioPlayer,
} from './audio_player';
import { AudioVolume, getAudioGainAmountDb } from './audio_volume';
import {
  DEFAULT_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
} from './audio_playback_rate';

const SILENT_SAMPLE_VALUE = SILENT_SAMPLE_ABSOLUTE_VALUE_THRESHOLD;
const NON_SILENT_SAMPLE_VALUE = SILENT_SAMPLE_ABSOLUTE_VALUE_THRESHOLD + 0.01;
const FIRST_AUDIO_CHANNEL_INDEX = 0;

const mockToneJsGetContext = jest.fn();
const mockToneJsSetContext = jest.fn();
const mockToneJsGrainPlayerConstructor = jest.fn();

jest.mock('tone', () => ({
  getContext: mockToneJsGetContext,
  GrainPlayer: mockToneJsGrainPlayerConstructor,
  setContext: mockToneJsSetContext,
}));

const { ENGLISH } = TestLanguageCode;

function newMockWebAudioContext() {
  return {
    createBuffer: jest.fn(),
    decodeAudioData: jest.fn(),
    destination: { mock: 'web audio destination' },
  } as unknown as jest.Mocked<AudioContext>;
}

function newMockAudioBuffer(samples: number[]) {
  return {
    getChannelData: (channelIndex: number) => {
      expect(channelIndex).toEqual(FIRST_AUDIO_CHANNEL_INDEX);
      return samples;
    },
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: 44100,
  } as unknown as AudioBuffer;
}

function newMockGrainPlayer() {
  let bufferDisposed = false;

  const mockBuffer: jest.Mocked<Partial<ToneAudioBuffer>> = {
    dispose: jest.fn().mockImplementation(() => {
      bufferDisposed = true;
    }),

    get disposed() {
      return bufferDisposed;
    },
  };

  const mockVolume: Partial<Param<'decibels'>> = {
    value: undefined,
  };

  let playerDisposed = false;
  let playerState: BasicPlaybackState = 'stopped';

  const mockPlayer: jest.Mocked<Partial<GrainPlayer>> = {
    buffer: mockBuffer as unknown as jest.Mocked<ToneAudioBuffer>,
    connect: jest.fn(),
    disconnect: jest.fn(),
    dispose: jest.fn().mockImplementation(() => {
      playerDisposed = true;
    }),
    onstop: undefined,
    start: jest.fn().mockImplementation(() => {
      playerState = 'started';
    }),
    stop: jest.fn().mockImplementation(() => {
      playerState = 'stopped';
    }),
    volume: mockVolume as unknown as Param<'decibels'>,

    get disposed() {
      return playerDisposed;
    },

    get state() {
      return playerState;
    },
  };

  return mockPlayer as unknown as jest.Mocked<GrainPlayer>;
}

test('lazy-initializes ToneJS only once', async () => {
  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockResolvedValue(
    newMockAudioBuffer([1, 1, 0])
  );
  mockWebAudioContext.createBuffer.mockReturnValue({
    copyToChannel: jest.fn(),
  } as unknown as AudioBuffer);

  //
  // Expect ToneJS web audio context to be disposed and replaced with Vx web
  // audio context.
  //

  const mockToneJsContext = {
    dispose: jest.fn(),
    rawContext: { foo: 'bar' },
  } as const;
  mockToneJsGetContext.mockReturnValue(mockToneJsContext);

  await newAudioPlayer({
    clip: { dataBase64: '', id: 'clip-1', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  expect(mockToneJsContext.dispose).toHaveBeenCalledTimes(1);
  expect(mockToneJsSetContext).toHaveBeenCalledWith(mockWebAudioContext);

  //
  // Expect subsequent initializations to be no-ops:
  //

  const updatedMockToneJsContext = {
    dispose: jest.fn(),
    rawContext: mockWebAudioContext,
  } as const;
  mockToneJsGetContext.mockReturnValue(updatedMockToneJsContext);
  mockToneJsSetContext.mockReset();

  await newAudioPlayer({
    clip: { dataBase64: '', id: 'clip-2', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  expect(updatedMockToneJsContext.dispose).not.toHaveBeenCalled();
  expect(mockToneJsSetContext).not.toHaveBeenCalled();
});

test('trims beginning silence', async () => {
  const testClip: UiStringAudioClip = {
    dataBase64: 'AAAB',
    id: 'clip-1',
    languageCode: ENGLISH,
  };

  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockImplementation((buffer) => {
    expect(buffer).toEqual(Buffer.from(testClip.dataBase64, 'base64').buffer);

    return Promise.resolve(
      newMockAudioBuffer([
        0,
        0,
        -SILENT_SAMPLE_VALUE,
        SILENT_SAMPLE_VALUE,
        -NON_SILENT_SAMPLE_VALUE,
        NON_SILENT_SAMPLE_VALUE,
        1,
        1,
        0,
      ])
    );
  });

  const mockTrimmedAudioBuffer = {
    copyToChannel: jest.fn(),
  } as unknown as jest.Mocked<AudioBuffer>;
  mockWebAudioContext.createBuffer.mockReturnValue(mockTrimmedAudioBuffer);

  mockToneJsGetContext.mockReturnValue({ rawContext: mockWebAudioContext });

  await newAudioPlayer({
    clip: testClip,
    webAudioContext: mockWebAudioContext,
  });

  expect(mockToneJsGrainPlayerConstructor).toHaveBeenCalledWith(
    mockTrimmedAudioBuffer
  );
  expect(mockTrimmedAudioBuffer.copyToChannel).toHaveBeenCalledWith(
    [-NON_SILENT_SAMPLE_VALUE, NON_SILENT_SAMPLE_VALUE, 1, 1, 0],
    FIRST_AUDIO_CHANNEL_INDEX
  );
});

test('play()', async () => {
  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockResolvedValue(
    newMockAudioBuffer([1, 1, 0])
  );
  mockWebAudioContext.createBuffer.mockReturnValue({
    copyToChannel: jest.fn(),
  } as unknown as AudioBuffer);

  mockToneJsGetContext.mockReturnValue({ rawContext: mockWebAudioContext });

  const mockGrainPlayer = newMockGrainPlayer();
  mockToneJsGrainPlayerConstructor.mockReturnValue(mockGrainPlayer);

  const player = await newAudioPlayer({
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  //
  // Simulate playing twice and assert that the second call is a no-op:
  //

  const onDone1 = jest.fn();
  player.play().then(onDone1, (error) => fail(error));

  const onDone2 = jest.fn();
  player.play().then(onDone2, (error) => fail(error));

  expect(mockGrainPlayer.connect).toHaveBeenCalledTimes(1);
  expect(mockGrainPlayer.connect).toHaveBeenCalledWith(
    mockWebAudioContext.destination
  );
  expect(mockGrainPlayer.start).toHaveBeenCalledTimes(1);

  expect(onDone1).not.toHaveBeenCalled();
  expect(onDone2).not.toHaveBeenCalled();

  mockGrainPlayer.onstop(null as never);

  await waitFor(() => expect(onDone1).toHaveBeenCalledTimes(1));
  expect(onDone2).toHaveBeenCalledTimes(1);
});

test('stop()', async () => {
  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockResolvedValue(
    newMockAudioBuffer([1, 1, 0])
  );
  mockWebAudioContext.createBuffer.mockReturnValue({
    copyToChannel: jest.fn(),
  } as unknown as AudioBuffer);

  mockToneJsGetContext.mockReturnValue({ rawContext: mockWebAudioContext });

  const mockGrainPlayer = newMockGrainPlayer();
  mockToneJsGrainPlayerConstructor.mockReturnValue(mockGrainPlayer);

  const player = await newAudioPlayer({
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  void player.play();

  expect(mockGrainPlayer.disconnect).not.toHaveBeenCalled();
  expect(mockGrainPlayer.dispose).not.toHaveBeenCalled();
  expect(mockGrainPlayer.buffer.dispose).not.toHaveBeenCalled();

  player.stop();
  player.stop();

  expect(mockGrainPlayer.disconnect).toHaveBeenCalled();
  expect(mockGrainPlayer.dispose).toHaveBeenCalledTimes(1);
  expect(mockGrainPlayer.buffer.dispose).toHaveBeenCalledTimes(1);
});

test('setVolume()', async () => {
  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockResolvedValue(
    newMockAudioBuffer([1, 1, 0])
  );
  mockWebAudioContext.createBuffer.mockReturnValue({
    copyToChannel: jest.fn(),
  } as unknown as AudioBuffer);

  mockToneJsGetContext.mockReturnValue({ rawContext: mockWebAudioContext });

  const mockGrainPlayer = newMockGrainPlayer();
  mockToneJsGrainPlayerConstructor.mockReturnValue(mockGrainPlayer);

  const player = await newAudioPlayer({
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  const { MAXIMUM, MINIMUM } = AudioVolume;
  player.setVolume(MAXIMUM);
  expect(mockGrainPlayer.volume.value).toEqual(getAudioGainAmountDb(MAXIMUM));

  player.setVolume(MINIMUM);
  expect(mockGrainPlayer.volume.value).toEqual(getAudioGainAmountDb(MINIMUM));
});

test('setPlaybackRate()', async () => {
  const mockWebAudioContext = newMockWebAudioContext();
  mockWebAudioContext.decodeAudioData.mockResolvedValue(
    newMockAudioBuffer([1, 1, 0])
  );
  mockWebAudioContext.createBuffer.mockReturnValue({
    copyToChannel: jest.fn(),
  } as unknown as AudioBuffer);

  mockToneJsGetContext.mockReturnValue({ rawContext: mockWebAudioContext });

  const mockGrainPlayer = newMockGrainPlayer();
  mockToneJsGrainPlayerConstructor.mockReturnValue(mockGrainPlayer);

  const player = await newAudioPlayer({
    clip: { dataBase64: 'AAAB', id: 'clip-1', languageCode: ENGLISH },
    webAudioContext: mockWebAudioContext,
  });

  player.setPlaybackRate(MIN_PLAYBACK_RATE);
  expect(mockGrainPlayer.playbackRate).toEqual(MIN_PLAYBACK_RATE);

  const minPlaybackRateGrainSize = mockGrainPlayer.grainSize;
  const minPlaybackRateGrainOverlap = mockGrainPlayer.overlap;

  player.setPlaybackRate(DEFAULT_PLAYBACK_RATE);
  expect(mockGrainPlayer.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);
  expect(mockGrainPlayer.grainSize).not.toEqual(minPlaybackRateGrainSize);
  expect(mockGrainPlayer.overlap).not.toEqual(minPlaybackRateGrainOverlap);

  player.setPlaybackRate(MAX_PLAYBACK_RATE);
  expect(mockGrainPlayer.playbackRate).toEqual(MAX_PLAYBACK_RATE);
  expect(mockGrainPlayer.grainSize).not.toEqual(minPlaybackRateGrainSize);
  expect(mockGrainPlayer.overlap).not.toEqual(minPlaybackRateGrainOverlap);
});
