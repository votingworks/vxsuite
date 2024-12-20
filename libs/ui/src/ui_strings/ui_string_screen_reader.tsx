import React from 'react';
import getDeepValue from 'lodash.get';

import { Optional, assertDefined } from '@votingworks/basics';

import { useAudioContext } from './audio_context';
import { ClipParams, PlayAudioClips } from './play_audio_clips';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { UiStringAudioDataAttributeName } from './with_audio';
import { AppStringKey } from './app_strings';
import {
  AudioVolume,
  getDecreasedVolume,
  getIncreasedVolume,
} from './audio_volume';

const EMPTY_CLIP_QUEUE: ClipParams[] = [];

const VOLUME_CHANGE_FEEDBACK_STRING_KEYS: Readonly<
  Record<AudioVolume, AppStringKey>
> = {
  [AudioVolume.MINIMUM]: 'audioFeedbackMinimumVolume',
  [AudioVolume.TEN_PERCENT]: 'audioFeedback10PercentVolume',
  [AudioVolume.TWENTY_PERCENT]: 'audioFeedback20PercentVolume',
  [AudioVolume.THIRTY_PERCENT]: 'audioFeedback30PercentVolume',
  [AudioVolume.FORTY_PERCENT]: 'audioFeedback40PercentVolume',
  [AudioVolume.FIFTY_PERCENT]: 'audioFeedback50PercentVolume',
  [AudioVolume.SIXTY_PERCENT]: 'audioFeedback60PercentVolume',
  [AudioVolume.SEVENTY_PERCENT]: 'audioFeedback70PercentVolume',
  [AudioVolume.EIGHTY_PERCENT]: 'audioFeedback80PercentVolume',
  [AudioVolume.NINETY_PERCENT]: 'audioFeedback90PercentVolume',
  [AudioVolume.MAXIMUM]: 'audioFeedbackMaximumVolume',
};

export interface UiStringScreenReaderProps {
  children?: React.ReactNode;
}

interface UiStringParams {
  i18nKey: string;
  languageCode: string;
}

export interface UiStringScreenReaderContextInterface {
  decreaseVolume: () => void;
  increaseVolume: () => void;
  /** Replays audio for any `UiString`s currently under focus. */
  replay: () => void;
}

export const UiStringScreenReaderContext =
  React.createContext<Optional<UiStringScreenReaderContextInterface>>(
    undefined
  );

export function useUiStringScreenReaderContext(): Optional<UiStringScreenReaderContextInterface> {
  return React.useContext(UiStringScreenReaderContext);
}

function useVolumeControls(params: {
  playVolumeChangeFeedback: (uiStringQueue: UiStringParams[]) => void;
}) {
  const { playVolumeChangeFeedback } = params;

  const currentLanguageCode = useCurrentLanguage();
  const { setVolume: baseSetVolume, volume } = assertDefined(useAudioContext());

  /**
   * Updates output volume and, if no screen reader audio is already in
   * progress, announces the volume level.
   */
  const setVolume = React.useCallback(
    (newVolume: AudioVolume) => {
      baseSetVolume(newVolume);
      playVolumeChangeFeedback([
        {
          i18nKey: VOLUME_CHANGE_FEEDBACK_STRING_KEYS[newVolume],
          languageCode: currentLanguageCode,
        },
      ]);
    },
    [baseSetVolume, currentLanguageCode, playVolumeChangeFeedback]
  );

  const increaseVolume = React.useCallback(
    () => setVolume(getIncreasedVolume(volume)),
    [setVolume, volume]
  );

  const decreaseVolume = React.useCallback(
    () => setVolume(getDecreasedVolume(volume)),
    [setVolume, volume]
  );

  return { decreaseVolume, increaseVolume };
}

/**
 * Monitors the DOM for click/focus user actions and plays back associated audio
 * for all <UiString> elements within the event target.
 */
export function UiStringScreenReader(
  props: UiStringScreenReaderProps
): React.ReactNode {
  const { children } = props;
  const [activeEvent, setActiveEvent] = React.useState<Event>();
  const [uiStringQueue, setUiStringQueue] = React.useState<UiStringParams[]>();
  const [audioFeedbackQueue, setAudioFeedbackQueue] =
    React.useState<UiStringParams[]>();

  const { decreaseVolume, increaseVolume } = useVolumeControls({
    playVolumeChangeFeedback: setAudioFeedbackQueue,
  });

  const { api, isEnabled, setIsPaused } = assertDefined(
    useAudioContext(),
    'Audio context not defined'
  );
  const currentLanguageCode = useCurrentLanguage();

  const activeLanguages = new Set(
    [...(uiStringQueue || []), ...(audioFeedbackQueue || [])].map(
      (s) => s.languageCode
    )
  );
  const audioIdQueries = api.getAudioIds.useQueries([...activeLanguages]);

  // Wrap `isEnabled` and `setIsPaused` in refs, so we can use it in the event
  // listener effect without needing to unload and re-load the effect when the
  // values change:
  const isEnabledRef = React.useRef(isEnabled);
  React.useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  const setIsPausedRef = React.useRef(setIsPaused);
  React.useEffect(() => {
    setIsPausedRef.current = setIsPaused;
  }, [setIsPaused]);

  //
  // Register click/focus handlers:
  //
  React.useEffect(() => {
    function onFocusOrClick(event: Event) {
      setActiveEvent(undefined);

      // Run in the next tick to allow any UI updates related to the event to
      // occur before "reading" the `UiString`s.
      window.setTimeout(() => {
        setActiveEvent(event);

        // In case playback was paused for a previous event, unpause to ensure
        // that the user receives audio feedback for this next event.
        if (isEnabledRef.current) {
          setIsPausedRef.current(false);
        }
      });
    }

    function onBlur() {
      setActiveEvent(undefined);
    }

    document.addEventListener('click', onFocusOrClick, { capture: true });
    document.addEventListener('focus', onFocusOrClick, { capture: true });
    document.addEventListener('blur', onBlur, { capture: true });

    return () => {
      document.removeEventListener('click', onFocusOrClick, { capture: true });
      document.removeEventListener('focus', onFocusOrClick, { capture: true });
      document.removeEventListener('blur', onBlur, { capture: true });
    };
  }, []);

  //
  // Extract and queue up i18n keys within the event target:
  //
  React.useEffect(() => {
    setUiStringQueue(undefined);
    setAudioFeedbackQueue(undefined);

    // Clear the playback queue if the active event has been cleared:
    if (!activeEvent) {
      return;
    }

    const { target } = activeEvent;

    /* istanbul ignore next - tough to test firing click events on non-elements */
    if (!(target instanceof Element)) {
      return;
    }

    // Ignore event if the target element has since been removed from the DOM.
    // (e.g. a button click event that triggers page navigation.)
    /* istanbul ignore next */
    if (!window.document.body.contains(target)) {
      return;
    }

    const { I18N_KEY, LANGUAGE_CODE } = UiStringAudioDataAttributeName;
    const audioElements = target.querySelectorAll(`[${I18N_KEY}]`);
    const newI18nKeys: UiStringParams[] = [];

    for (const audioElement of audioElements.values()) {
      const i18nKey = audioElement.getAttribute(I18N_KEY);
      const languageCode = audioElement.getAttribute(LANGUAGE_CODE);

      if (i18nKey && languageCode) {
        newI18nKeys.push({ i18nKey, languageCode });
      }
    }

    if (newI18nKeys.length > 0) {
      setUiStringQueue(newI18nKeys);
    }
  }, [activeEvent]);

  const replay = React.useCallback(() => {
    if (activeEvent?.target) {
      activeEvent.target.dispatchEvent(new Event('focus', { bubbles: true }));
    }
  }, [activeEvent]);

  //
  // When display language changes, stop playback and replay audio for focused
  // element(s) in the new language:
  //
  const previousLanguageRef = React.useRef(currentLanguageCode);
  React.useEffect(() => {
    if (currentLanguageCode === previousLanguageRef.current) {
      return;
    }

    // Replay audio for the active event, if any, in the new language:
    replay();

    previousLanguageRef.current = currentLanguageCode;
  }, [currentLanguageCode, replay]);

  let clipQueue = EMPTY_CLIP_QUEUE;

  const isDataReady = Object.values(audioIdQueries).every((q) => q.isSuccess);
  if (isDataReady) {
    // To avoid interrupting in-progress screen reader audio, only play audio
    // feedback if the UI string audio queue is empty:
    const audioStringQueue = uiStringQueue || audioFeedbackQueue || [];

    clipQueue = audioStringQueue.flatMap(({ i18nKey, languageCode }) => {
      const audioIdMappings = assertDefined(
        audioIdQueries[languageCode],
        `audioIdQueries[${languageCode}] not defined`
      ).data;
      const matchingAudioIds = getDeepValue(audioIdMappings, i18nKey);

      if (!Array.isArray(matchingAudioIds)) {
        // TODO(kofi): start asserting that audio ID data is available once
        // we're sure it won't break for dev fixtures.
        return [];
      }

      return matchingAudioIds.map(
        (audioId): ClipParams => ({ audioId, languageCode })
      );
    });
  }

  const memoizedClipQueue = React.useMemo(
    () => clipQueue,
    // Using a stringified audioId queue as a proxy for deep equality here to
    // make sure the `PlayAudioClips.clips` prop value only changes when the
    // queue is cleared/changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clipQueue.map((c) => c.audioId).join(',')]
  );

  const onDone = React.useCallback(() => {
    setUiStringQueue(undefined);
    setAudioFeedbackQueue(undefined);
  }, []);

  return (
    <UiStringScreenReaderContext.Provider
      value={{ decreaseVolume, increaseVolume, replay }}
    >
      {isEnabled && (
        <PlayAudioClips clips={memoizedClipQueue} onDone={onDone} />
      )}
      {children}
    </UiStringScreenReaderContext.Provider>
  );
}
