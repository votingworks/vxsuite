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
  const { api, playbackRate, volume, webAudioContext } = assertDefined(
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

    if (!hasClipLoaded || !clip || !webAudioContext) {
      return;
    }

    // TODO(kofi): assert that the requested clip data exists in the backend.

    // void (async () => {
    //   setAudioPlayer(await newAudioPlayer({ clip, webAudioContext }));
    // })();
  }, [clip, hasClipLoaded, webAudioContext]);

  //
  // Set/update playback rate and volume when audio player is ready or when user
  // settings change:
  //
  React.useEffect(() => {
    audioPlayer?.setPlaybackRate(playbackRate);
  }, [audioPlayer, playbackRate]);
  React.useEffect(() => {
    audioPlayer?.setVolume(volume);
  }, [audioPlayer, volume]);

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

  return <PlayAudioClip {...currentClip} onDone={onClipDone} />;
}
