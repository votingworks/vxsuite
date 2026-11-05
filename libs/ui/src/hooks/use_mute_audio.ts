import React from 'react';
import { useAudioContext } from '../ui_strings/audio_context.js';

/**
 * Silences screen reader audio while {@link shouldMute} is true, without
 * changing the voter's audio on/off setting.
 */
export function useMuteAudio(shouldMute: boolean): void {
  const setIsMuted = useAudioContext()?.setIsMuted;

  React.useEffect(() => {
    if (!shouldMute || !setIsMuted) return;

    setIsMuted(true);
    return () => setIsMuted(false);
  }, [shouldMute, setIsMuted]);
}
