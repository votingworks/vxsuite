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
      switch (event.key) {
        case 'L': {
          const currentLanguageIndex = availableLanguages.findIndex(
            (l) => l === currentLanguageCode
          );
          const nextIndex =
            (currentLanguageIndex + 1) % availableLanguages.length;

          setLanguage(availableLanguages[nextIndex]);
          break;
        }
        case 'M':
          audioControls.toggleEnabled();
          break;
        case 'R':
          audioControls.replay();
          break;
        case ',':
          // eslint-disable-next-line no-console
          console.log(', received');
          audioControls.decreasePlaybackRate();
          break;
        case '.':
          // eslint-disable-next-line no-console
          console.log('. received');
          audioControls.increasePlaybackRate();
          break;
        case 'P':
          audioControls.togglePause();
          break;
        case '-':
          // eslint-disable-next-line no-console
          console.log('- received');
          audioControls.decreaseVolume();
          break;
        case '=':
          audioControls.increaseVolume();
          break;
        default:
          // eslint-disable-next-line no-console
          console.log(`Unhandled key event: ${event.key}`);
          // eslint-disable-next-line no-console
          console.log(event);
      }
    }

    document.addEventListener('keydown', onKeyPress);

    return () => document.removeEventListener('keydown', onKeyPress);
  }, [availableLanguages, currentLanguageCode, setLanguage, audioControls]);

  return null;
}
