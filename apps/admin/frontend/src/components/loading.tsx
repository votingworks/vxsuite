import React from 'react';
import styled from 'styled-components';

import { ProgressEllipsis } from '@votingworks/ui';

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
  let content = (
    <ProgressEllipsis
      as={as}
      aria-label={`${Array.isArray(children) ? children.join('') : children}.`}
    >
      {children}
    </ProgressEllipsis>
  );
  if (isFullscreen) {
    content = <Fullscreen>{content}</Fullscreen>;
  }
  return content;
}
