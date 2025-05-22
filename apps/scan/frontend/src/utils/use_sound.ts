import useSoundLib from 'use-sound';

export type SoundType = 'success' | 'warning' | 'error' | 'alarm';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}
