import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';

/**
 * Installs UI String keyboard shortcuts for dev convenience.
 *   - Shift+L: Switch to next available display/audio language.
 */
export function KeyboardShortcutHandlers(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();

  React.useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      // Shift+L: Switch to next available display/audio language:
      if (event.key === 'L') {
        const currentLanguageIndex = availableLanguages.findIndex(
          (l) => l === currentLanguageCode
        );

        const nextIndex =
          (currentLanguageIndex + 1) % availableLanguages.length;

        setLanguage(availableLanguages[nextIndex]);
      }
    }

    document.addEventListener('keypress', onKeyPress);

    return () => document.removeEventListener('keypress', onKeyPress);
  }, [availableLanguages, currentLanguageCode, setLanguage]);

  return null;
}
