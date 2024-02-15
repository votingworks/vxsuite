import React from 'react';

import { useCurrentLanguage } from '../hooks/use_current_language';
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

  return (
    <Button icon="Language" onPress={onPress}>
      {electionStrings.ballotLanguage(currentLanguageCode)}
    </Button>
  );
}
