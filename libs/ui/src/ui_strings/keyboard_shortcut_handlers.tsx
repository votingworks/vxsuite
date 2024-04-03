import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';
import { useAudioControls } from '../hooks/use_audio_controls';
import { Keybinding } from '../keybindings';

/**
 * Installs UI String keyboard shortcuts for dev convenience.
 */
export function KeyboardShortcutHandlers(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();
  const audioControls = useAudioControls();

  React.useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      switch (event.key) {
        case Keybinding.SWITCH_LANGUAGE: {
          const currentLanguageIndex = availableLanguages.findIndex(
            (l) => l === currentLanguageCode
          );
          const nextIndex =
            (currentLanguageIndex + 1) % availableLanguages.length;

          setLanguage(availableLanguages[nextIndex]);
          break;
        }
        case Keybinding.TOGGLE_AUDIO:
          audioControls.toggleEnabled();
          break;
        case Keybinding.PLAYBACK_RATE_DOWN:
          audioControls.decreasePlaybackRate();
          break;
        case Keybinding.PLAYBACK_RATE_UP:
          audioControls.increasePlaybackRate();
          break;
        case Keybinding.TOGGLE_PAUSE:
          audioControls.togglePause();
          break;
        case Keybinding.VOLUME_DOWN:
          audioControls.decreaseVolume();
          break;
        case Keybinding.VOLUME_UP:
          audioControls.increaseVolume();
          break;
        default:
        // No op
      }
    }

    document.addEventListener('keydown', onKeyPress);

    return () => document.removeEventListener('keydown', onKeyPress);
  }, [availableLanguages, currentLanguageCode, setLanguage, audioControls]);

  return null;
}
