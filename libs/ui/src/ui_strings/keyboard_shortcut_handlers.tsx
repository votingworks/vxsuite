import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';
import { useAudioControls } from '../hooks/use_audio_controls';

/**
 * Installs UI String keyboard shortcuts for dev convenience.
 *   - Shift+L: Switch to next available display/audio language.
 */
export function KeyboardShortcutHandlers(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();
  const audioControls = useAudioControls();

  React.useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      const currentLanguageIndex = availableLanguages.findIndex(
        (l) => l === currentLanguageCode
      );
      const nextIndex = (currentLanguageIndex + 1) % availableLanguages.length;

      switch (event.key) {
        // Shift+L: Switch to next available display/audio language:
        case 'L':
          setLanguage(availableLanguages[nextIndex]);
          break;
        case 'R':
          audioControls.replay();
          break;
        case '[':
          audioControls.decreasePlaybackRate();
          break;
        case ']':
          audioControls.increasePlaybackRate();
          break;
        case 'P':
          audioControls.togglePause();
          break;
        case '-':
          audioControls.decreaseVolume();
          break;
        case '=':
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
