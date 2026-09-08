import React, { useEffect, useState } from 'react';
import { styled } from './styled.js';
import { ProgressEllipsis } from './progress_ellipsis.js';

export const FULLSCREEN_LOADING_DELAY_MS = 200;

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
  animationDurationS?: number;
}

export function Loading({
  as = 'h1',
  children = 'Loading',
  isFullscreen = false,
  animationDurationS,
}: LoadingProps): JSX.Element {
  const [showIndicator, setShowIndicator] = useState(!isFullscreen);

  useEffect(() => {
    if (showIndicator) return undefined;
    const timer = setTimeout(
      () => setShowIndicator(true),
      FULLSCREEN_LOADING_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [showIndicator]);

  const content = (
    <div>
      {/* FIXME: Workaround for https://github.com/jamesmfriedman/rmwc/issues/501 */}
      <ProgressEllipsis
        as={as}
        aria-label={`${children}.`}
        animationDurationS={animationDurationS}
      >
        {children}
      </ProgressEllipsis>
    </div>
  );
  if (isFullscreen) {
    return <Fullscreen>{showIndicator && content}</Fullscreen>;
  }
  return content;
}
