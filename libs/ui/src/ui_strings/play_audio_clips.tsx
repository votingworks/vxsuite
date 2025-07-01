import React from 'react';

import { assertDefined } from '@votingworks/basics';

import { useAudioContext } from './audio_context';
import { AudioPlayer, newAudioPlayer } from './audio_player';

export interface ClipParams {
  audioId: string;
  languageCode: string;
}

type PlayAudioClipProps = ClipParams & {
  onDone: () => void;
};

function PlayAudioClip(props: PlayAudioClipProps) {
  const { audioId, languageCode, onDone } = props;
  const [audioPlayer, setAudioPlayer] = React.useState<AudioPlayer>();
  const { api, output, playbackRate, webAudioContext } = assertDefined(
    useAudioContext()
  );

  const { data: clip, isSuccess: hasClipLoaded } = api.getAudioClip.useQuery({
    id: audioId,
    languageCode,
  });

  //
  // Create audio player when clip data is loaded:
  //
  React.useEffect(() => {
    setAudioPlayer(undefined);

    if (!hasClipLoaded || !clip || !webAudioContext || !output) {
      return;
    }

    // TODO(kofi): assert that the requested clip data exists in the backend.

    setAudioPlayer(newAudioPlayer({ clip, output, webAudioContext }));
  }, [clip, hasClipLoaded, output, webAudioContext]);

  //
  // Set/update playback rate when audio player is ready or when user
  // settings change:
  //
  React.useEffect(() => {
    audioPlayer?.setPlaybackRate(playbackRate);
  }, [audioPlayer, playbackRate]);

  //
  // Store `onDone` callback ref to avoid re-running the "start playback" effect
  // when it changes:
  //
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onDoneRef.current = onDone;
  });

  //
  // Start playback when audio player is ready:
  //
  React.useEffect(() => {
    if (!audioPlayer) {
      return;
    }

    void (async () => {
      await audioPlayer.play();
      onDoneRef.current();
    })();

    return () => void audioPlayer.stop();
  }, [audioPlayer]);

  return null;
}

export interface PlayAudioQueueProps {
  clips: ClipParams[];
  onDone?: () => void;
}

export function PlayAudioClips(props: PlayAudioQueueProps): React.ReactNode {
  const { clips, onDone } = props;
  const [clipIndex, setClipIndex] = React.useState(0);
  const clipIndexRef = React.useRef(clipIndex);

  //
  // Initialize/reset on `clips` prop update:
  //
  React.useEffect(() => {
    setClipIndex(0);
  }, [clips]);

  //
  // Advance to next clip in the queue when current clip is done playing:
  //
  clipIndexRef.current = clipIndex;
  const onClipDone = React.useCallback(() => {
    if (clipIndexRef.current < clips.length) {
      setClipIndex(clipIndexRef.current + 1);
    }
  }, [clips]);

  //
  // Trigger `onDone` handler once all clips are done playing:
  //
  const allClipsDone = clipIndex >= clips.length;
  React.useEffect(() => {
    if (allClipsDone) {
      onDone?.();
    }
  }, [allClipsDone, onDone]);

  const currentClip = clips[clipIndex];
  if (!currentClip) {
    return null;
  }

  return (
    <PlayAudioClip
      {...currentClip}
      // Ensure that a remount (and, by extension, a replay) is triggered for
      // repeated audio (e.g. repeated characters in a write-in candidate name).
      key={clipIndex}
      onDone={onClipDone}
    />
  );
}
