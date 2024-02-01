import React from 'react';
import getDeepValue from 'lodash.get';

import { Optional, assertDefined } from '@votingworks/basics';
import { LanguageCode, LanguageCodeSchema } from '@votingworks/types';
import { useAudioContext } from './audio_context';
import { ClipParams, PlayAudioClips } from './play_audio_clips';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { UiStringAudioDataAttributeName } from './with_audio';

const EMPTY_UI_STRING_QUEUE: UiStringParams[] = [];
const EMPTY_CLIP_QUEUE: ClipParams[] = [];

export interface UiStringScreenReaderProps {
  children?: React.ReactNode;
}

interface UiStringParams {
  i18nKey: string;
  languageCode: LanguageCode;
}

export interface UiStringScreenReaderContextInterface {
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

/**
 * Monitors the DOM for click/focus user actions and plays back associated audio
 * for all <UiString> elements within the event target.
 */
export function UiStringScreenReader(
  props: UiStringScreenReaderProps
): React.ReactNode {
  const { children } = props;
  const [activeEvent, setActiveEvent] = React.useState<Event>();
  const [uiStringQueue, setUiStringQueue] = React.useState<UiStringParams[]>(
    EMPTY_UI_STRING_QUEUE
  );

  const { api, isEnabled, setIsPaused } = assertDefined(useAudioContext());
  const currentLanguageCode = useCurrentLanguage();

  const activeLanguages = uiStringQueue.map((s) => s.languageCode);
  const audioIdQueries = api.getAudioIds.useQueries(activeLanguages);

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
        if (isEnabled) {
          setIsPaused(false);
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
  }, [isEnabled, setIsPaused]);

  //
  // Extract and queue up i18n keys within the event target:
  //
  React.useEffect(() => {
    // Clear the playback queue if the active event has been cleared:
    if (!activeEvent) {
      setUiStringQueue(EMPTY_UI_STRING_QUEUE);
      return;
    }

    const { target } = activeEvent;

    /* istanbul ignore next - tough to test firing click events on non-elements */
    if (!(target instanceof Element)) {
      setActiveEvent(undefined);
      return;
    }

    // Ignore event if the target element has since been removed from the DOM.
    // (e.g. a button click event that triggers page navigation.)
    /* istanbul ignore next */
    if (!window.document.body.contains(target)) {
      setUiStringQueue(EMPTY_UI_STRING_QUEUE);
      return;
    }

    const { I18N_KEY, LANGUAGE_CODE } = UiStringAudioDataAttributeName;
    const audioElements = target.querySelectorAll(`[${I18N_KEY}]`);
    const newI18nKeys: UiStringParams[] = [];

    for (const audioElement of audioElements.values()) {
      const i18nKey = audioElement.getAttribute(I18N_KEY);
      const languageCodeResult = LanguageCodeSchema.safeParse(
        audioElement.getAttribute(LANGUAGE_CODE)
      );

      if (i18nKey && languageCodeResult.success) {
        newI18nKeys.push({ i18nKey, languageCode: languageCodeResult.data });
      }
    }

    setUiStringQueue(newI18nKeys);
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
    clipQueue = uiStringQueue.flatMap(({ i18nKey, languageCode }) => {
      const audioIdMappings = assertDefined(audioIdQueries[languageCode]).data;
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

  return (
    <UiStringScreenReaderContext.Provider value={{ replay }}>
      {isEnabled && <PlayAudioClips clips={memoizedClipQueue} />}
      {children}
    </UiStringScreenReaderContext.Provider>
  );
}
