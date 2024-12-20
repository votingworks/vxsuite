/*
 * Gain values in this file represent the amount of amplification (in decibels)
 * added to the audio output to increase/decrease its volume.
 *
 * [VVSG 2.0, 7.1-K – Audio settings]
 *
 * 1. The settings for volume and rate of speech are followed regardless of the
 *    technical means of producing audio output.
 *
 * 2. The default volume for each voting session is set between 60 and 70 dB SPL.
 *
 * 3. The volume is adjustable from a minimum of 20 dB SPL up to a maximum of
 *    100 dB SPL, in increments no greater than 10 dB
 */

import { assertDefined } from '@votingworks/basics';

const MIN_VOLUME_DB_SPL = 20;
const MAX_VOLUME_DB_SPL = 100;

/**
 * Screen reader volume levels, dividing the 20 dbSPL - 100 dbSPL range
 * specified in VVSG 2.0 into 10 equal steps.
 *
 * These are explicitly defined to facilitate mapping to pre-generated audio
 * feedback clips played whenever a voter adjusts the output volume.
 */
export enum AudioVolume {
  MINIMUM = '0%',
  TEN_PERCENT = '10%',
  TWENTY_PERCENT = '20%',
  THIRTY_PERCENT = '30%',
  FORTY_PERCENT = '40%',
  FIFTY_PERCENT = '50%',
  SIXTY_PERCENT = '60%',
  SEVENTY_PERCENT = '70%',
  EIGHTY_PERCENT = '80%',
  NINETY_PERCENT = '90%',
  MAXIMUM = '100%',
}

/**
 * Estimated gain offset to apply to audio generated in Google Cloud to result
 * in roughly an output level of {@link MIN_VOLUME_DB_SPL} when the OS volume is
 * set to its maximum output level.
 *
 * Last Calibration: 2024-09-11 on VSAP 150 with Lorelei X6 Headphones.
 *
 * TODO: Might be worth defining different offsets for different machines
 * (VxMark vs VxMarkScan), since audio hardware and output levels will likely
 * differ between the two.
 */
const GOOGLE_CLOUD_TTS_GAIN_OFFSET_FOR_MIN_VOLUME = -55;

export function getAudioGainAmountDb(volume: AudioVolume): number {
  // eslint-disable-next-line vx/gts-safe-number-parse
  const additionalGainPercentage = parseInt(volume, 10);
  const additionalGainDb =
    (MAX_VOLUME_DB_SPL - MIN_VOLUME_DB_SPL) * (additionalGainPercentage / 100);

  return GOOGLE_CLOUD_TTS_GAIN_OFFSET_FOR_MIN_VOLUME + additionalGainDb;
}

export const DEFAULT_AUDIO_VOLUME: AudioVolume = AudioVolume.FIFTY_PERCENT;

const ORDERED_AUDIO_GAIN_AMOUNTS: AudioVolume[] = [
  AudioVolume.MINIMUM,
  AudioVolume.TEN_PERCENT,
  AudioVolume.TWENTY_PERCENT,
  AudioVolume.THIRTY_PERCENT,
  AudioVolume.FORTY_PERCENT,
  AudioVolume.FIFTY_PERCENT,
  AudioVolume.SIXTY_PERCENT,
  AudioVolume.SEVENTY_PERCENT,
  AudioVolume.EIGHTY_PERCENT,
  AudioVolume.NINETY_PERCENT,
  AudioVolume.MAXIMUM,
];

export function getIncreasedVolume(volume: AudioVolume): AudioVolume {
  if (volume === AudioVolume.MAXIMUM) {
    return volume;
  }

  const volumeIndex = ORDERED_AUDIO_GAIN_AMOUNTS.indexOf(volume);
  return assertDefined(ORDERED_AUDIO_GAIN_AMOUNTS[volumeIndex + 1]);
}

export function getDecreasedVolume(volume: AudioVolume): AudioVolume {
  if (volume === AudioVolume.MINIMUM) {
    return volume;
  }

  const volumeIndex = ORDERED_AUDIO_GAIN_AMOUNTS.indexOf(volume);
  return assertDefined(ORDERED_AUDIO_GAIN_AMOUNTS[volumeIndex - 1]);
}
