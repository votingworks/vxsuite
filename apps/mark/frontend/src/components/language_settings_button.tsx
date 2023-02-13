// This component is a prototype. File is not tested because Props required are not yet implemented.
// If the secondaryLanguageKey === '' then only the "English" button is shown. Clicking this button opens the "Language Setting Modal".
// If a secondaryLanguageKey is set, then a toggle is displayed with both the name of the secondary language and "English".
// When the toggle button for the language name not matching the currentLanguageKey is pressed, toggle the value of the
// When the toggle button for the language name matching the currentLanguageKey is pressed, then show the "Language Setting Modal".

import React from 'react';

import {
  Button,
  ButtonProps,
  SegmentedButton,
} from '@votingworks/shared-frontend';
import { EventTargetFunction, DefinedDictionary } from '@votingworks/types';

interface Props extends ButtonProps {
  isSupported?: boolean;
  isSecondaryLanguageActive: boolean;
  secondaryLanguageKey: string;
  onPress: EventTargetFunction;
}

const tempSupportedLanguagesDictionary: DefinedDictionary<{
  name: string;
}> = {
  EN: {
    name: 'English',
  },
  ES: {
    name: 'Español',
  },
};

/* istanbul ignore next */
export function LanguageSettingsButton({
  isSupported,
  large,
  onPress: toggleCurrentLanguage,
  isSecondaryLanguageActive,
  secondaryLanguageKey = 'EN',
}: Props): JSX.Element | null {
  if (!isSupported) {
    return null;
  }
  const secondaryLanguageName =
    tempSupportedLanguagesDictionary[secondaryLanguageKey].name;
  if (secondaryLanguageKey === 'EN') {
    return (
      <Button large={large} onPress={toggleCurrentLanguage}>
        Language
      </Button>
    );
  }
  return (
    <SegmentedButton>
      <Button
        primary={isSecondaryLanguageActive}
        onPress={toggleCurrentLanguage}
        data-language-key={secondaryLanguageKey}
        aria-label={`Change Language to ${secondaryLanguageName}`}
      >
        {secondaryLanguageName}
      </Button>
      <Button
        primary={!isSecondaryLanguageActive}
        onPress={toggleCurrentLanguage}
        data-language-key="EN"
        aria-label="Change Language to English"
      >
        English
      </Button>
    </SegmentedButton>
  );
}
