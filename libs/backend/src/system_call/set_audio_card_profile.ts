import { ok, Result, sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import type { NODE_ENV } from '../scan_globals';
import { pactl } from './pulse_audio';

/** {@link setAudioCardProfile} params. */
export interface SetAudioCardProfileParams {
  /** Name of the target audio card (see `./get_audio_card_name.ts`). */
  cardName: string;
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
  profile: AudioCardProfile;
}

/**
 * Audio card profiles for v4 VxMark/VxScan. These are fairly
 * hardware-specific and are not all guaranteed to be available on other setups.
 */
export enum AudioCardProfile {
  ANALOG = 'output:analog-stereo',
  HDMI = 'output:hdmi-stereo',
}

/** {@link setAudioCardProfile} result. */
export type SetAudioCardProfileResult = Result<void, string>;

/**
 * Sets the active audio card profile, which determines what outputs are
 * available for audio playback.
 * NOTE: Only guaranteed to work on production v4 VxMark/VxScan hardware.
 */
export async function setAudioCardProfile(
  p: SetAudioCardProfileParams
): Promise<SetAudioCardProfileResult> {
  if (p.nodeEnv !== 'production') return ok();

  const res = await pactl(p.nodeEnv, p.logger, [
    'set-card-profile',
    p.cardName,
    p.profile,
  ]);

  if (res.isErr()) {
    p.logger.log(LogEventId.UnknownError, 'system', {
      disposition: 'failure',
      message: `unable to set audio output to ${p.profile}: ${res.err()}`,
    });

    return res;
  }

  p.logger.log(LogEventId.Info, 'system', {
    disposition: 'success',
    message: `audio output set to ${p.profile}`,
  });

  /**
   * We've noticed a slight delay in profile switching taking effect when
   * testing on a production VxScan, causing sounds targeting one output to
   * briefly play through the previous output. This provides a bit of buffer
   * to allow for things to settle before playing audio.
   */
  await sleep(300);

  return ok();
}
