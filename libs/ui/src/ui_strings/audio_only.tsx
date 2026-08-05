import React from 'react';
import { styled } from '../styled.js';

import { AUDIO_ONLY_STYLES } from '../global_styles';

const Container = styled.span`
  ${AUDIO_ONLY_STYLES}
`;

export type AudioOnlyProps = React.HTMLAttributes<HTMLSpanElement>;

export function AudioOnly(props: AudioOnlyProps): JSX.Element {
  return <Container {...props} />;
}
