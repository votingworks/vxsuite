import { isIntegrationTest } from '@votingworks/utils';
import { execFile } from './exec';

/**
 * Configures system audio settings for audio-enabled precinct machines.
 *
 * VVSG 2.0 requires setting audio volume within an explicit loudness
 * range and in gain increments of <= 10 dB. This is easier to do if we set the
 * system volume to a fixed level and adjust the amplification for audio clips
 * during playback by explicit decibel amounts, instead of adjusting the system
 * volume by percentage amounts.
 *
 * Setting the system volume to 100% allows us to limit how much positive gain
 * we apply to audio and avoid signal distortion at higher volumes.
 */
export async function initializeSystemAudio(): Promise<void> {
  // Skip for integration tests (since there's no sound card available in the
  // CI environment):
  /* istanbul ignore next */
  if (isIntegrationTest()) {
    return;
  }

  await execFile('amixer', ['sset', 'Master', `100%`, 'unmute']);
}
