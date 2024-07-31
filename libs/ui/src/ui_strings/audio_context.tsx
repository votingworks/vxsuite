import React from 'react';

import { Optional } from '@votingworks/basics';

import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';
import {
  DEFAULT_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_INCREMENT_AMOUNT,
} from './audio_playback_rate';
import { AudioVolume, DEFAULT_AUDIO_VOLUME } from './audio_volume';
import { useHeadphonesPluggedIn } from '../hooks/use_headphones_plugged_in';

export const DEFAULT_AUDIO_ENABLED_STATE = true;

function noOp() {}

export interface UiStringsAudioContextInterface {
  api: UiStringsReactQueryApi;
  decreasePlaybackRate: () => void;
  increasePlaybackRate: () => void;
  isEnabled: boolean;
  isPaused: boolean;
  playbackRate: number;
  reset: () => void;
  setControlsEnabled: (enabled: boolean) => void;
  setIsEnabled: (enabled: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  setVolume: (volume: AudioVolume) => void;
  toggleEnabled: () => void;
  togglePause: () => void;
  volume: AudioVolume;
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
  const [isEnabled, setIsEnabledInternal] = React.useState(
    DEFAULT_AUDIO_ENABLED_STATE
  );
  const [controlsEnabled, setControlsEnabled] = React.useState(true);
  const [isPaused, setIsPaused] = React.useState(true);
  const [playbackRate, setPlaybackRate] = React.useState<number>(
    DEFAULT_PLAYBACK_RATE
  );
  const [volume, setVolume] = React.useState<AudioVolume>(DEFAULT_AUDIO_VOLUME);
  const headphonesPluggedIn = useHeadphonesPluggedIn();

  const webAudioContextRef = React.useRef(getWebAudioContextInstance());

  const resetPlaybackSettings = React.useCallback(() => {
    setVolume(DEFAULT_AUDIO_VOLUME);
    setPlaybackRate(DEFAULT_PLAYBACK_RATE);
    setIsPaused(false);
  }, []);

  const setIsEnabled = React.useCallback(
    (enabled: boolean) => {
      if (headphonesPluggedIn) {
        setIsEnabledInternal(enabled);
      }
    },
    [headphonesPluggedIn]
  );

  const reset = React.useCallback(() => {
    resetPlaybackSettings();
    setIsEnabled(DEFAULT_AUDIO_ENABLED_STATE);
    setControlsEnabled(true);
  }, [resetPlaybackSettings, setIsEnabled]);

  React.useEffect(
    () => setIsEnabledInternal(headphonesPluggedIn),
    [headphonesPluggedIn]
  );

  React.useEffect(() => {
    if (isEnabled) {
      setIsPaused(false);
    } else {
      // Pausing here isn't strictly necessary, since we're disconnecting the
      // context destination node from any inputs, but this makes sure any
      // active audio streams don't continue to "play" in the background.
      setIsPaused(true);
      webAudioContextRef.current?.destination.disconnect();
    }
  }, [isEnabled, resetPlaybackSettings]);

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

  const togglePause = React.useCallback(
    () => setIsPaused(!isPaused),
    [isPaused]
  );

  const toggleEnabled = React.useCallback(
    () => setIsEnabled(!isEnabled),
    [isEnabled, setIsEnabled]
  );

  return (
    <UiStringsAudioContext.Provider
      value={{
        api,
        decreasePlaybackRate: controlsEnabled ? decreasePlaybackRate : noOp,
        increasePlaybackRate: controlsEnabled ? increasePlaybackRate : noOp,
        isEnabled,
        isPaused,
        playbackRate,
        reset,
        setControlsEnabled,
        setIsEnabled: controlsEnabled ? setIsEnabled : noOp,
        setIsPaused: controlsEnabled ? setIsPaused : noOp,
        setVolume: controlsEnabled ? setVolume : noOp,
        toggleEnabled: controlsEnabled ? toggleEnabled : noOp,
        togglePause: controlsEnabled ? togglePause : noOp,
        volume,
        webAudioContext: webAudioContextRef.current,
      }}
    >
      {children}
    </UiStringsAudioContext.Provider>
  );
}
