import React from 'react';

import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { Button } from '../button';
import { electionStrings } from '../ui_strings';

export interface LanguageSettingsButtonProps {
  onPress: () => void;
}

export function LanguageSettingsButton(
  props: LanguageSettingsButtonProps
): React.ReactNode {
  const { onPress } = props;
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();

  if (availableLanguages.length < 2) {
    return null;
  }

  return (
    <Button icon="Language" onPress={onPress}>
      {electionStrings.ballotLanguage(currentLanguageCode)}
    </Button>
  );
}
