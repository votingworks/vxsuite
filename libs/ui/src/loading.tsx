import React from 'react';
import styled from 'styled-components';
import { ProgressEllipsis } from './progress_ellipsis';

const Fullscreen = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`;

interface LoadingProps {
  children?: React.ReactNode;
  isFullscreen?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export function Loading({
  as = 'h1',
  children = 'Loading',
  isFullscreen = false,
}: LoadingProps): JSX.Element {
  const content = (
    <div>
      {/* FIXME: Workaround for https://github.com/jamesmfriedman/rmwc/issues/501 */}
      <ProgressEllipsis as={as} aria-label={`${children}.`}>
        {children}
      </ProgressEllipsis>
    </div>
  );
  if (isFullscreen) {
    return <Fullscreen>{content}</Fullscreen>;
  }
  return content;
}
