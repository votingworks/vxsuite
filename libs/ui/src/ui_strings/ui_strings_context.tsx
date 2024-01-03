import React from 'react';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import { LanguageContextProvider } from './language_context';
import { UiStringsAudioContextProvider } from './audio_context';

export interface UiStringsContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
  disabled?: boolean;
  noAudio?: boolean;
}

export function UiStringsContextProvider(
  props: UiStringsContextProviderProps
): React.ReactNode {
  const { api, children, disabled, noAudio } = props;

  if (disabled) {
    return children;
  }

  return (
    <LanguageContextProvider api={api}>
      {noAudio ? (
        children
      ) : (
        <UiStringsAudioContextProvider api={api}>
          {children}
        </UiStringsAudioContextProvider>
      )}
    </LanguageContextProvider>
  );
}
