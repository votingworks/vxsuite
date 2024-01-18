import React from 'react';
import { Trans } from 'react-i18next';

import { ReactUiString } from './types';
import { useLanguageContext } from './language_context';
import { WithAudio } from './with_audio';

export interface UiStringProps {
  as?: string | React.ComponentType<never>;
  children: ReactUiString;
  pluralCount?: number;
  uiStringKey: string;
  uiStringSubKey?: string;
}

export function UiString(props: UiStringProps): JSX.Element {
  const { as, children, pluralCount, uiStringKey, uiStringSubKey } = props;

  const languageContext = useLanguageContext();

  const i18nKey =
    uiStringKey &&
    (uiStringSubKey ? `${uiStringKey}.${uiStringSubKey}` : uiStringKey);

  if (!languageContext) {
    // Enable tests to run without the need for a UiStringContext:
    return (
      <WithAudio i18nKey={i18nKey}>
        <Trans i18nKey={i18nKey} count={pluralCount} parent={as}>
          {children}
        </Trans>
      </WithAudio>
    );
  }

  const { currentLanguageCode, i18next, translationFunction } = languageContext;

  return (
    <WithAudio i18nKey={i18nKey}>
      <Trans
        i18nKey={i18nKey}
        count={pluralCount}
        i18n={i18next}
        parent={as}
        tOptions={{ lng: currentLanguageCode }}
        t={translationFunction}
      >
        {children}
      </Trans>
    </WithAudio>
  );
}
