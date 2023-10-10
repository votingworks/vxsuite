import React from 'react';

import { Optional } from '@votingworks/basics';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export interface AudioContextInterface {
  // TODO(kofi): Flesh out.
}

const AudioContext =
  React.createContext<Optional<AudioContextInterface>>(undefined);

export function useAudioContext(): Optional<AudioContextInterface> {
  return React.useContext(AudioContext);
}

export interface AudioContextProviderProps {
  // eslint-disable-next-line react/no-unused-prop-types
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
}

export function AudioContextProvider(
  props: AudioContextProviderProps
): JSX.Element {
  const { children } = props;

  return <AudioContext.Provider value={{}}>{children}</AudioContext.Provider>;
}
