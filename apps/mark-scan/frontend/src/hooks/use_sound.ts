import useSoundLib from 'use-sound';

export function useSound(sound: 'success-5s' | 'alarm'): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}
