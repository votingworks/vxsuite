import React from 'react';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api.js';
import { FrontendLanguageContextProvider } from './language_context.js';
import { UiStringsAudioContextProvider } from './audio_context.js';
import { UiStringScreenReader } from './ui_string_screen_reader.js';
import { KeyboardShortcutHandlers } from './keyboard_shortcut_handlers.js';

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
    <FrontendLanguageContextProvider api={api}>
      {noAudio ? (
        content
      ) : (
        <UiStringsAudioContextProvider api={api}>
          <UiStringScreenReader>{content}</UiStringScreenReader>
        </UiStringsAudioContextProvider>
      )}
    </FrontendLanguageContextProvider>
  );
}
