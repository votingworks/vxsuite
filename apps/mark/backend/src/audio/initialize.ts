import {
  AudioInfoWithBuiltin,
  getAudioInfoWithRetry,
  getNodeEnv,
  setAudioVolume,
  setDefaultAudio,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';

export async function initializeAudio(
  logger: Logger,
  options: { defaultVolumeOverride?: number } = {}
): Promise<AudioInfoWithBuiltin> {
  const nodeEnv = getNodeEnv();
  const audioInfo = await getAudioInfoWithRetry({
    baseRetryDelayMs: 2000,
    logger,
    maxAttempts: 4,
    nodeEnv,
  });

  if (audioInfo.usb) {
    const resultDefaultAudio = await setDefaultAudio(audioInfo.usb.name, {
      logger,
      nodeEnv,
    });
    resultDefaultAudio.assertOk('unable to set USB audio as default output');

    // Screen reader volume levels are calibrated against a maximum system
    // volume setting:
    const resultVolume = await setAudioVolume({
      logger,
      nodeEnv,
      sinkName: audioInfo.usb.name,
      volumePct: options.defaultVolumeOverride ?? 100,
    });
    resultVolume.assertOk('unable to set USB audio volume');
  } else {
    void logger.logAsCurrentRole(LogEventId.AudioDeviceMissing, {
      message: 'USB audio device not detected.',
      disposition: 'failure',
    });
  }

  return audioInfo;
}
