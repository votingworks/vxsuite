import React from 'react';

import { LinkButton, LinkButtonProps } from '@votingworks/ui';

import * as api from '../api';

export type AudioLinkButtonProps = Omit<LinkButtonProps, 'icon'> & {
  to: string;
};

export function AudioLinkButton(props: AudioLinkButtonProps): React.ReactNode {
  const features = api.getUserFeatures.useQuery().data;

  if (!features?.AUDIO_PROOFING) return null;

  return (
    <LinkButton
      icon="VolumeUp"
      fill="transparent"
      variant="primary"
      {...props}
    />
  );
}
