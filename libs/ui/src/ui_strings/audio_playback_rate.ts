/*
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

/** Minimum allowed playback rate (50%), as prescribed in VVSG 2.0 7.1-K. */
export const MIN_PLAYBACK_RATE = 0.5;

/**
 * Default playback rate, assuming a synthesized speech rate of 120-125 wpm, as
 * prescribed in VVSG 2.0 7.1-K.
 */
export const DEFAULT_PLAYBACK_RATE = 1;

/** Maximum allowed playback rate (200%), as prescribed in VVSG 2.0 7.1-K. */
export const MAX_PLAYBACK_RATE = 2;

/**
 * Amount by which the rate is changed when increasing/decreasing playback rate.
 * This should be assigned a value that allows for 6-8 rate settings, per VVSG.
 */
export const PLAYBACK_RATE_INCREMENT_AMOUNT = 0.25;
