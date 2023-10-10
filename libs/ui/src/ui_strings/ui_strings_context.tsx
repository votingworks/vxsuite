import React from 'react';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import { LanguageContextProvider } from './language_context';
import { AudioContextProvider } from './audio_context';

export interface UiStringsContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
  noAudio?: boolean;
}

export function UiStringsContextProvider(
  props: UiStringsContextProviderProps
): JSX.Element {
  const { api, children, noAudio } = props;

  return (
    <LanguageContextProvider api={api}>
      {noAudio ? (
        children
      ) : (
        <AudioContextProvider api={api}>{children}</AudioContextProvider>
      )}
    </LanguageContextProvider>
  );
}
