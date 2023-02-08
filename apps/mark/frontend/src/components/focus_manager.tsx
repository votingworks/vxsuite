import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { ScreenReader } from '../utils/ScreenReader';

const StyledFocusManager = styled.div`
  height: 100%;
  &:focus {
    outline: none;
  }
`;

export interface Props {
  children: React.ReactNode;
  onClick?: React.DOMAttributes<HTMLElement>['onClick'];
  onClickCapture?: React.DOMAttributes<HTMLElement>['onClickCapture'];
  onFocus?: React.DOMAttributes<HTMLElement>['onFocus'];
  onFocusCapture?: React.DOMAttributes<HTMLElement>['onFocusCapture'];
  onKeyDown?: React.DOMAttributes<HTMLElement>['onKeyDown'];
  onKeyDownCapture?: React.DOMAttributes<HTMLElement>['onKeyDownCapture'];
  screenReader: ScreenReader;
}

export function FocusManager({
  onKeyDown,
  onClick,
  onFocus,
  onKeyDownCapture,
  onClickCapture,
  onFocusCapture,
  children,
  screenReader,
}: Props): JSX.Element {
  const location = useLocation();
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPageLoad() {
      void screenReader.onPageLoad();

      // can't seem to find a better way than this, unfortunately.
      // the delay of 150 is to handle the case the Next button is selected
      // via arrow keys and then clicked. A shorter delay will fail to move
      // the focus away from "Next" in terms of audio. Even now, the Next button
      // stays highlighted, which is a bummer. We need to figure out a better solution.
      window.setTimeout(() => {
        const elementToFocus =
          document.getElementById('audiofocus') ?? screen.current;
        /* istanbul ignore next */
        if (!elementToFocus) return;
        elementToFocus.focus();
        elementToFocus.click();
      }, 150);
    }
    onPageLoad();
  }, [location.pathname, screenReader]);

  return (
    <StyledFocusManager
      ref={screen}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDownCapture={onKeyDownCapture}
      onClickCapture={onClickCapture}
      onFocusCapture={onFocusCapture}
    >
      {children}
    </StyledFocusManager>
  );
}
