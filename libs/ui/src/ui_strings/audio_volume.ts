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

/**
 * Minimum allowed gain to achieve a minimum SPL of 20 dB, as prescribed in
 * VVSG 2.0, section 7.1-K,
 *
 * Assumes a 0 dB gain represents the 65 dB SPL midpoint of the default 60-70
 * dB range prescribed in the VVSG spec.
 */
export const MIN_GAIN_DB = -45;

/**
 * Default gain applied, assuming a 0 dB gain represents the 65 dB midpoint of
 * the 60-70 dB range prescribed in VVSG 2.0 7.1-K.
 */
export const DEFAULT_GAIN_DB = 0;

/**
 * Maximum allowed gain to achieve a maximum SPL of 100 dB, as prescribed in
 * VVSG 2.0, section 7.1-K,
 *
 * Assumes a 0 dB gain represents the 65 dB SPL midpoint of the default 60-70
 * dB range prescribed in the VVSG spec.
 */
export const MAX_GAIN_DB = 35;

/**
 * Amount of gain to add/subtract at a time when increasing/decreasing audio
 * volume.
 */
export const GAIN_INCREMENT_AMOUNT_DB = 5;
