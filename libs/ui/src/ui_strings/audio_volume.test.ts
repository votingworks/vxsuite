import { expect, test } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  AudioVolume,
  getAudioGainRatio,
  getDecreasedVolume,
  getIncreasedVolume,
} from './audio_volume';

const VVSG_MAX_INCREMENT_AMOUNT_DB = 10;
const VVSG_REQUIRED_VOLUME_RANGE_DB = 80; // 20 to 100 dB SPL
const { MAXIMUM, MINIMUM } = AudioVolume;

function gainDbFromRatio(ratio: number): number {
  // "20 log rule" for calculating amplitude from gain ratio:
  // https://en.wikipedia.org/wiki/Gain_(electronics)#Voltage_gain
  return 20 * Math.log10(ratio);
}

function gainDbFromVolume(volume: AudioVolume): number {
  return gainDbFromRatio(getAudioGainRatio(volume));
}

test('getIncreasedVolume', () => {
  expect(getIncreasedVolume(MINIMUM)).not.toEqual(MINIMUM);
  expect(getIncreasedVolume(MAXIMUM)).toEqual(MAXIMUM);
});

test('getDecreasedVolume', () => {
  expect(getDecreasedVolume(AudioVolume.MINIMUM)).toEqual(MINIMUM);
  expect(getDecreasedVolume(AudioVolume.MAXIMUM)).not.toEqual(MAXIMUM);
});

test('VVSG 2.0 volume range requirement', () => {
  expect(gainDbFromVolume(MAXIMUM) - gainDbFromVolume(MINIMUM)).toEqual(
    VVSG_REQUIRED_VOLUME_RANGE_DB
  );
});

test('VVSG 2.0 gain increments requirement', async () => {
  // Increase volume from `MINIMUM` through `MAXIMUM` and track gain deltas:
  const gainDeltas: number[] = [];
  let previousVolume: AudioVolume;
  let currentVolume = AudioVolume.MINIMUM;
  await waitFor(() => {
    previousVolume = currentVolume;
    currentVolume = getIncreasedVolume(previousVolume);

    if (currentVolume !== previousVolume) {
      gainDeltas.push(
        gainDbFromVolume(currentVolume) - gainDbFromVolume(previousVolume)
      );
    }

    expect(currentVolume).toEqual(MAXIMUM);
  });

  // Expect all deltas to satisfy VVSG 2.0, 7.1-K, #3:
  expect(gainDeltas.every((d) => d <= VVSG_MAX_INCREMENT_AMOUNT_DB)).toEqual(
    true
  );
});
