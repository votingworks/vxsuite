import React from 'react';

import { UiStringsAudioContext } from './audio_context';
import { AudioOnly } from './audio_only';
import { LanguageOverride } from './language_override';
import { useCurrentLanguage } from '../hooks/use_current_language';

export interface WithAltAudioProps {
  audioLanguageOverride?: string;
  audioText: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders the given {@link children} within an empty audio context, to exclude
 * them from screen reader audio playback.
 */
function TextOnly(props: { children: React.ReactNode }): React.ReactNode {
  const { children } = props;

  return (
    <UiStringsAudioContext.Provider value={undefined}>
      {children}
    </UiStringsAudioContext.Provider>
  );
}

/**
 * Disables the screen reader for {@link children} and renders
 * {@link audioText} within a hidden {@link AudioOnly}.
 *
 * Useful when we need to provide assistive audio users with additional or
 * extended information that isn't necessary for or relevant to visual-only
 * users.
 */
export function WithAltAudio(props: WithAltAudioProps): React.ReactNode {
  const { audioLanguageOverride, audioText, children } = props;
  const userLanguageCode = useCurrentLanguage();

  return (
    <React.Fragment>
      <TextOnly>{children}</TextOnly>
      <LanguageOverride
        languageCode={audioLanguageOverride || userLanguageCode}
      >
        <AudioOnly>{audioText}</AudioOnly>
      </LanguageOverride>
    </React.Fragment>
  );
}
