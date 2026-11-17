// @coverage-defer-file
import useSoundLib from 'use-sound';

export interface SoundOptions {
  volume?: number;
}

export function useSound(
  sound: 'success-5s' | 'alarm',
  opts: SoundOptions = {}
): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`, opts);
  return playSound;
}
