import _ from 'lodash';
import { Trans } from 'react-i18next';
import styled from 'styled-components';

import { ReactUiString } from './types';
import { useLanguageContext } from './language_context';

export interface UiStringProps {
  children: ReactUiString;
  pluralCount?: number;
  uiStringKey: string;
  uiStringSubKey?: string;
}

const Container = styled.span`
  /* TODO(kofi): Override font-family for non-latin character sets. */
`;

export function UiString(props: UiStringProps): JSX.Element {
  const { children, pluralCount, uiStringKey, uiStringSubKey } = props;

  const languageContext = useLanguageContext();

  const i18nKey =
    uiStringKey && _.compact([uiStringKey, uiStringSubKey]).join('.');

  if (!languageContext) {
    // Enable tests to run without the need for a UiStringContext:
    return (
      <Container>
        <Trans i18nKey={i18nKey} count={pluralCount}>
          {children}
        </Trans>
      </Container>
    );
  }

  const { i18next, translationFunction } = languageContext;

  return (
    <Container data-audio-ids={'' /* TODO(kofi): fetch audio IDs */}>
      <Trans
        i18nKey={i18nKey}
        count={pluralCount}
        i18n={i18next}
        t={translationFunction}
      >
        {children}
      </Trans>
    </Container>
  );
}
