/* istanbul ignore file - stub implementation */

import React from 'react';

import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';
import { Button } from '../button';

export function LanguageModalButton(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();

  // TODO(kofi): Let clients trigger navigation to a language settings screen
  // instead:
  const onPress = React.useCallback(() => {
    const currentLanguageIndex = availableLanguages.findIndex(
      (l) => l === currentLanguageCode
    );
    const nextIndex = (currentLanguageIndex + 1) % availableLanguages.length;

    setLanguage(availableLanguages[nextIndex]);
  }, [availableLanguages, currentLanguageCode, setLanguage]);

  if (availableLanguages.length < 2) {
    return null;
  }

  return (
    <Button icon="Language" onPress={onPress}>
      {/* TODO(kofi): Use a UiString from the election package to enable audio */}
      {new Intl.DisplayNames([currentLanguageCode], {
        type: 'language',
        style: 'narrow',
      }).of(currentLanguageCode)}
    </Button>
  );
}
