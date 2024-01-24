/* istanbul ignore file - pending implementation. */

import React from 'react';

import { LanguageCode } from '@votingworks/types';

export interface ClipParams {
  audioId: string;
  languageCode: LanguageCode;
}

export interface PlayAudioClipsProps {
  clips: ClipParams[];
}

export function PlayAudioClips(props: PlayAudioClipsProps): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clips } = props;

  // TODO(kofi): Flesh out.

  return null;
}
