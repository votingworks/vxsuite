// @coverage-exclude-file: currently only used in hwta
import useSoundLib from 'use-sound';

export interface SoundOptions {
  /** Volume ratio between 0 and 1. */
  volume?: number;
}

export function useSound(
  sound: 'success-5s' | 'alarm',
  opts: SoundOptions = {}
): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`, opts);
  return playSound;
}
