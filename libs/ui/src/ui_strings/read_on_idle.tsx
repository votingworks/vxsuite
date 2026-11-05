import React from 'react';
import { assertDefined } from '@votingworks/basics';
import { AudioOnly } from './audio_only.js';
import { useAudioContext } from './audio_context.js';
import { useScreenReaderActive } from './ui_string_screen_reader.js';

export interface ReadOnIdleProps {
  children: React.ReactNode;
  /** Amount of audio inactivity, in milliseconds, after which a read-out is triggered. */
  delayMs: number;
}

/**
 * Triggers an audio read-out of any descendant `UiString` elements whenever
 * screen reader audio has been idle for {@link ReadOnIdleProps.delayMs}
 * milliseconds, while audio playback is enabled.
 *
 * Content is audio-only and never displayed on screen.
 */
export function ReadOnIdle(props: ReadOnIdleProps): JSX.Element {
  const { children, delayMs } = props;

  const isPlaybackActive = Boolean(useAudioContext()?.isPlaybackActive);
  const isScreenReaderActive = useScreenReaderActive();

  const containerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!isPlaybackActive || isScreenReaderActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      assertDefined(containerRef.current).click();
    }, delayMs);

    return () => window.clearInterval(intervalId);
  }, [delayMs, isPlaybackActive, isScreenReaderActive]);

  return (
    <span ref={containerRef}>
      <AudioOnly>{children}</AudioOnly>
    </span>
  );
}
