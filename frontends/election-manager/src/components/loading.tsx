import React from 'react';
import styled from 'styled-components';

import { ProgressEllipsis, Prose } from '@votingworks/ui';

const Fullscreen = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`;

interface Props {
  children?: string | string[];
  isFullscreen?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export function Loading({
  as = 'h1',
  children = 'Loading',
  isFullscreen = false,
}: Props): JSX.Element {
  const content = (
    <Prose>
      <ProgressEllipsis as={as} aria-label={`${children}.`}>
        {children}
      </ProgressEllipsis>
    </Prose>
  );
  if (isFullscreen) {
    return <Fullscreen>{content}</Fullscreen>;
  }
  return content;
}
