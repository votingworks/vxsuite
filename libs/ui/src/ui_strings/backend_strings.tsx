import { Trans } from 'react-i18next';

import { LanguageCode } from '@votingworks/types';
import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  FixedLanguageContext,
  useFixedLanguageContext,
} from './language_context';
import { UiStringProps } from './ui_string';
import { LanguageOverrideProps } from './language_override';
import { NumberStringProps } from './number_string';
import { Font } from '../typography';

/**
 * Differs from `UiString` in that it does not use audio and only needs a
 * `FixedLanguageContext`, much more lightweight than the full `UiStringsContext`.
 */
export function BackendUiString(props: UiStringProps): JSX.Element {
  const { as, children, pluralCount, uiStringKey, uiStringSubKey } = props;

  const languageContext = useFixedLanguageContext();
  assert(languageContext);

  const i18nKey =
    uiStringKey &&
    (uiStringSubKey ? `${uiStringKey}.${uiStringSubKey}` : uiStringKey);

  const { currentLanguageCode, i18next } = languageContext;

  console.log(i18next.getResourceBundle(LanguageCode.ENGLISH, 'translation'));
  console.log(currentLanguageCode);
  console.log(i18nKey);
  console.log(children?.toString());
  return (
    <Trans
      i18nKey={i18nKey}
      count={pluralCount}
      i18n={i18next}
      parent={as}
      tOptions={{ lng: currentLanguageCode }}
    >
      {children}
    </Trans>
  );
}

/**
 * Renders the given child elements with all translatable strings translated to
 * the specified language, regardless of the currently active app-wide language
 * setting.
 *
 * NOTE: This will also affect the audio language, when voter audio is enabled.
 */
export function BackendLanguageOverride(
  props: LanguageOverrideProps
): React.ReactNode {
  const { children, languageCode } = props;

  const parentContext = useFixedLanguageContext();
  if (!parentContext) {
    return children;
  }

  return (
    <FixedLanguageContext.Provider
      value={{
        ...parentContext,
        currentLanguageCode: languageCode,
      }}
    >
      {children}
    </FixedLanguageContext.Provider>
  );
}

export function BackendInEnglish(props: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <BackendLanguageOverride {...props} languageCode={LanguageCode.ENGLISH} />
  );
}

/**
 * Renders a screen-reader-compatible number, formatted in the current user
 * language.
 */
export function BackendNumberString(props: NumberStringProps): JSX.Element {
  const { value, ...rest } = props;

  const languageContext = useFixedLanguageContext();

  return (
    <Font {...rest}>
      {format.count(value, languageContext?.currentLanguageCode)}
    </Font>
  );
}
