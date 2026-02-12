import useSoundLib from 'use-sound';

export type SoundType = 'success' | 'warning' | 'error' | 'alarm';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}

export function useSoundControls(sound: SoundType): {
  play: () => void;
  stop: () => void;
} {
  const [playSound, controls] = useSoundLib(`/sounds/${sound}.mp3`);

  return {
    play: playSound,
    stop: controls.stop,
  };
}
