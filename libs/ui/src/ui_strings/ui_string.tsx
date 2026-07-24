import React from 'react';
import { Trans } from 'react-i18next';

import sanitizeHtml from 'sanitize-html';
import { DEFAULT_LANGUAGE_CODE } from '@votingworks/types';
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

interface UiRichTextStringProps {
  children: string;
  uiStringKey: string;
  uiStringSubKey?: string;
  /**
   * Optional transform applied to the sanitized HTML before it's rendered
   * (e.g. to add presentational markup), along with the language code of the
   * string being rendered. The transform's output is rendered without further
   * sanitization, so it must only add trusted markup.
   */
  transformHtml?: (html: string, languageCode: string) => string;
}

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt'],
  },
  allowedSchemes: ['data'],
};

/**
 * Renders the UI string for the given key as rich text (i.e. rendering the
 * string as HTML). The translations for the string should all have fully formed
 * HTML in them - this does not use any of the react-i18next support for HTML
 * tag replacement. Sanitizes the HTML to prevent XSS attacks.
 */
export function UiRichTextString(props: UiRichTextStringProps): JSX.Element {
  const { children, uiStringKey, uiStringSubKey, transformHtml } = props;

  const languageContext = useLanguageContext();

  const i18nKey =
    uiStringKey &&
    (uiStringSubKey ? `${uiStringKey}.${uiStringSubKey}` : uiStringKey);

  function toRenderedHtml(html: string, languageCode: string): string {
    const sanitizedHtml = sanitizeHtml(html, sanitizeOptions);
    return transformHtml
      ? transformHtml(sanitizedHtml, languageCode)
      : sanitizedHtml;
  }

  // Enable tests to run without the need for a UiStringContext
  if (!languageContext) {
    return (
      <WithAudio i18nKey={i18nKey}>
        <div
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: toRenderedHtml(children, DEFAULT_LANGUAGE_CODE),
          }}
        />
      </WithAudio>
    );
  }

  let translatedString = languageContext.translationFunction(i18nKey, {
    lng: languageContext.currentLanguageCode,
  });
  // react-i18next returns the key if the translation is missing, in which case
  // we want to use the provided children like UiString does.
  if (translatedString === i18nKey) {
    translatedString = children;
  }
  return (
    <WithAudio i18nKey={i18nKey}>
      <div
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: toRenderedHtml(
            translatedString,
            languageContext.currentLanguageCode
          ),
        }}
      />
    </WithAudio>
  );
}
