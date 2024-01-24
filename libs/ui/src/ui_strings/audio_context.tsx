import React from 'react';

import { Optional } from '@votingworks/basics';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import {
  DEFAULT_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_INCREMENT_AMOUNT,
} from './audio_playback_rate';
import {
  GAIN_INCREMENT_AMOUNT_DB,
  DEFAULT_GAIN_DB,
  MAX_GAIN_DB,
  MIN_GAIN_DB,
} from './audio_volume';

export interface UiStringsAudioContextInterface {
  api: UiStringsReactQueryApi;
  decreasePlaybackRate: () => void;
  decreaseVolume: () => void;
  gainDb: number;
  increasePlaybackRate: () => void;
  increaseVolume: () => void;
  isEnabled: boolean;
  isPaused: boolean;
  playbackRate: number;
  reset: () => void;
  setIsEnabled: (enabled: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  togglePause: () => void;
  webAudioContext?: AudioContext;
}

export const UiStringsAudioContext =
  React.createContext<Optional<UiStringsAudioContextInterface>>(undefined);

export function useAudioContext(): Optional<UiStringsAudioContextInterface> {
  return React.useContext(UiStringsAudioContext);
}

export interface UiStringsAudioContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
}

let webAudioContext: AudioContext | undefined;
function getWebAudioContextInstance() {
  if (!window.AudioContext) {
    return undefined;
  }

  if (!webAudioContext) {
    webAudioContext = new AudioContext();
  }

  return webAudioContext;
}

export function UiStringsAudioContextProvider(
  props: UiStringsAudioContextProviderProps
): JSX.Element {
  const { api, children } = props;
  const [isEnabled, setIsEnabled] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(true);
  const [playbackRate, setPlaybackRate] = React.useState<number>(
    DEFAULT_PLAYBACK_RATE
  );
  const [gainDb, setGainDb] = React.useState<number>(DEFAULT_GAIN_DB);

  const webAudioContextRef = React.useRef(getWebAudioContextInstance());

  const reset = React.useCallback(() => {
    setGainDb(DEFAULT_GAIN_DB);
    setPlaybackRate(DEFAULT_PLAYBACK_RATE);
    setIsPaused(false);
  }, []);

  React.useEffect(() => {
    if (isEnabled) {
      reset();
    } else {
      // Pausing here isn't strictly necessary, since we're disconnecting the
      // context destination node from any inputs, but this makes sure any
      // active audio streams don't continue to "play" in the background.
      setIsPaused(true);
      webAudioContextRef.current?.destination.disconnect();
    }
  }, [isEnabled, reset]);

  React.useEffect(() => {
    if (!webAudioContextRef.current) {
      return;
    }

    if (isPaused) {
      void webAudioContextRef.current.suspend();
    } else {
      void webAudioContextRef.current.resume();
    }
  }, [isPaused]);

  const increasePlaybackRate = React.useCallback(() => {
    setPlaybackRate(
      Math.min(MAX_PLAYBACK_RATE, playbackRate + PLAYBACK_RATE_INCREMENT_AMOUNT)
    );
  }, [playbackRate]);

  const decreasePlaybackRate = React.useCallback(() => {
    setPlaybackRate(
      Math.max(MIN_PLAYBACK_RATE, playbackRate - PLAYBACK_RATE_INCREMENT_AMOUNT)
    );
  }, [playbackRate]);

  const increaseVolume = React.useCallback(
    () => setGainDb(Math.min(MAX_GAIN_DB, gainDb + GAIN_INCREMENT_AMOUNT_DB)),
    [gainDb]
  );

  const decreaseVolume = React.useCallback(
    () => setGainDb(Math.max(MIN_GAIN_DB, gainDb - GAIN_INCREMENT_AMOUNT_DB)),
    [gainDb]
  );

  const togglePause = React.useCallback(
    () => setIsPaused(!isPaused),
    [isPaused]
  );

  return (
    <UiStringsAudioContext.Provider
      value={{
        api,
        decreasePlaybackRate,
        decreaseVolume,
        gainDb,
        increasePlaybackRate,
        increaseVolume,
        isEnabled,
        isPaused,
        playbackRate,
        reset,
        setIsEnabled,
        setIsPaused,
        togglePause,
        webAudioContext: webAudioContextRef.current,
      }}
    >
      {children}
    </UiStringsAudioContext.Provider>
  );
}
