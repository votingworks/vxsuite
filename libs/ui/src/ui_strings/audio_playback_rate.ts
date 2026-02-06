/**
 * ## Screen reader rate-of-speech settings.
 *
 * [VVSG 2.0 7.1-K – Audio settings]
 *
 * 4. The rate of speech is adjustable throughout the voting session while
 *    preserving the current votes, with 6 to 8 discrete steps in the rate.
 *
 * 5. The default rate of speech is 120 to 125 words per minute (wpm).
 *
 * 6. The range of speech rates supported is from 60-70 wpm to 240-250 wpm (or
 *    50% to 200% of the default rate), with no distortion.
 *
 * 7. Adjusting the rate of speech does not affect the pitch of the voice.
 */
export enum PlaybackRate {
  /**
   * Minimum allowed playback rate (50%), as prescribed in VVSG 2.0 7.1-K.
   */
  MINIMUM = 0.5,
  PERCENT_75 = 0.75,
  /**
   * Default playback rate, assuming a synthesized speech rate of 120-125 wpm,
   * as prescribed in VVSG 2.0 7.1-K.
   */
  PERCENT_100 = 1,
  PERCENT_125 = 1.25,
  PERCENT_150 = 1.5,
  PERCENT_175 = 1.75,
  /**
   * Maximum allowed playback rate (200%), as prescribed in VVSG 2.0 7.1-K.
   */
  MAXIMUM = 2,
}

export const PLAYBACK_RATES = [
  PlaybackRate.MINIMUM,
  PlaybackRate.PERCENT_75,
  PlaybackRate.PERCENT_100,
  PlaybackRate.PERCENT_125,
  PlaybackRate.PERCENT_150,
  PlaybackRate.PERCENT_175,
  PlaybackRate.MAXIMUM,
] as const;

export const DEFAULT_PLAYBACK_RATE = PlaybackRate.PERCENT_100;
export const MAX_PLAYBACK_RATE = PLAYBACK_RATES.at(-1);
export const MIN_PLAYBACK_RATE = PLAYBACK_RATES[0];
