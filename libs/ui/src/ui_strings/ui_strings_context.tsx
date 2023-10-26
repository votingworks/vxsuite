import React from 'react';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import { LanguageContextProvider } from './language_context';
import { AudioContextProvider } from './audio_context';

export interface UiStringsContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
  disabledForTesting?: boolean;
  noAudio?: boolean;
}

export function UiStringsContextProvider(
  props: UiStringsContextProviderProps
): JSX.Element {
  const { api, children, disabledForTesting, noAudio } = props;

  if (disabledForTesting) {
    return <React.Fragment>{children}</React.Fragment>;
  }

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
