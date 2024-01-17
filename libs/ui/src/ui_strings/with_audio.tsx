import React from 'react';
import getDeepValue from 'lodash.get';

import { LanguageCode } from '@votingworks/types';

import { useAudioContext } from './audio_context';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export enum UiStringAudioDataAttributeName {
  I18N_KEY = 'data-i18n-key',
  LANGUAGE_CODE = 'data-language-code',
}

export interface WithAudioProps {
  children: React.ReactNode;
  i18nKey: string;
}

/**
 * Utility component for pre-fetching audio clip data to help shorten audio
 * playback response times.
 */
function PrefetchAudioClip(props: {
  api: UiStringsReactQueryApi;
  audioId: string;
  languageCode: LanguageCode;
}) {
  const { api, audioId, languageCode } = props;

  api.getAudioClip.useQuery({
    id: audioId,
    languageCode,
  });

  return null;
}

/**
 * Utility component for pre-fetching audio clip data to help shorten audio
 * playback response times.
 */
function PrefetchAudioClips(props: {
  api: UiStringsReactQueryApi;
  i18nKey: string;
  languageCode: LanguageCode;
}) {
  const { api, i18nKey, languageCode } = props;

  const audioIdsQuery = api.getAudioIds.useQuery(languageCode);
  const audioIdMappings = audioIdsQuery.isFetching
    ? undefined
    : audioIdsQuery.data;

  if (!audioIdMappings) {
    return null;
  }

  const mappedValues = getDeepValue(audioIdMappings, i18nKey);

  // TODO(kofi): Log invalid/missing audio ID mappings. Worth adding server-side
  // election package validation during configuration to make this fallback
  // unlikely in prod.
  const audioIds = Array.isArray(mappedValues) ? mappedValues : [];

  return audioIds.map((audioId) => (
    <PrefetchAudioClip
      api={api}
      audioId={audioId}
      key={audioId}
      languageCode={languageCode}
    />
  ));
}

/**
 * Wraps {@link children} in a span optionally tagged with data attributes used
 * by the screen reader (in audio-enabled apps) for fetching and playing back
 * the corresponding synthesized/pre-recorded audio for {@link i18nKey}.
 */
export function WithAudio(props: WithAudioProps): React.ReactNode {
  const { children, i18nKey } = props;
  const languageCode = useCurrentLanguage();
  const audioContext = useAudioContext();

  if (!audioContext) {
    return <span>{children}</span>;
  }

  const dataAttributes: Record<UiStringAudioDataAttributeName, string> = {
    [UiStringAudioDataAttributeName.I18N_KEY]: i18nKey,
    [UiStringAudioDataAttributeName.LANGUAGE_CODE]: languageCode,
  };

  return (
    <span {...dataAttributes}>
      <PrefetchAudioClips
        api={audioContext.api}
        i18nKey={i18nKey}
        languageCode={languageCode}
      />
      {children}
    </span>
  );
}
