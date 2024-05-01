import { useAudioContext } from '../ui_strings/audio_context';

export function useAudioEnabled(): boolean {
  return useAudioContext()?.isEnabled || false;
}
