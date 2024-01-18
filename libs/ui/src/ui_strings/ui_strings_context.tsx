import React from 'react';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import { LanguageContextProvider } from './language_context';
import { UiStringsAudioContextProvider } from './audio_context';
import { KeyboardShortcutHandlers } from './keyboard_shortcut_handlers';

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

  const content = (
    <React.Fragment>
      <KeyboardShortcutHandlers />
      {children}
    </React.Fragment>
  );

  return (
    <LanguageContextProvider api={api}>
      {noAudio ? (
        content
      ) : (
        <UiStringsAudioContextProvider api={api}>
          {content}
        </UiStringsAudioContextProvider>
      )}
    </LanguageContextProvider>
  );
}
