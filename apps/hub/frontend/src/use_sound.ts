import useSoundLib from 'use-sound';

export type SoundType = 'happy-ping';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}
