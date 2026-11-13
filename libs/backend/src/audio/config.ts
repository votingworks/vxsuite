/**
 * Headphone-based screen reader audio is calibrated against a 100% system
 * volume level (assuming screen hardware speaker volume is also set to
 * maximum). Voter-controlled volume change is implemented client-side.
 */
export const DEFAULT_HEADPHONE_VOLUME_PCT = 100;

/**
 * The screen speaker on the newer v4 ELO 1504LS screen is fairly underpowered
 * and limited in volume output when both hardware and software volume are set
 * to maximum. To compensate, we boost the software volume a bit to bring up the
 * level of important system sounds.
 */
export const DEFAULT_SPEAKER_VOLUME_PCT = 120;

/**
 * Last round of testing done on a v4 VxComputer with HWTA running.
 * Over 10 reboots, the number of retries before successful connection to the
 * pulseaudio service ranged from 3 to 4. Setting the max a little higher to be
 * safe.
 */
export const MAX_AUDIO_DETECTION_RETRIES = 6;

/** Used in conjunction with {@link MAX_AUDIO_DETECTION_RETRIES}. */
export const MIN_AUDIO_DETECTION_RETRY_DELAY_MS = 1000;
