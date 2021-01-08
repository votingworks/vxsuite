import React, { useEffect, useRef } from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import styled from 'styled-components'
import { ScreenReader } from '../utils/ScreenReader'

const StyledFocusManager = styled.div`
  height: 100%;
  &:focus {
    outline: none;
  }
`

export interface Props extends RouteComponentProps {
  children: React.ReactNode
  onClick?: React.DOMAttributes<HTMLElement>['onClick']
  onClickCapture?: React.DOMAttributes<HTMLElement>['onClickCapture']
  onFocus?: React.DOMAttributes<HTMLElement>['onFocus']
  onFocusCapture?: React.DOMAttributes<HTMLElement>['onFocusCapture']
  onKeyPress?: React.DOMAttributes<HTMLElement>['onKeyPress']
  onKeyPressCapture?: React.DOMAttributes<HTMLElement>['onKeyPressCapture']
  screenReader: ScreenReader
}

const FocusManager: React.FC<Props> = ({
  onKeyPress,
  onClick,
  onFocus,
  onKeyPressCapture,
  onClickCapture,
  onFocusCapture,
  children,
  screenReader,
  location,
}) => {
  const screen = useRef<HTMLDivElement>(null) // eslint-disable-line no-restricted-syntax
  useEffect(() => {
    const onPageLoad = () => {
      screenReader.onPageLoad()

      // can't seem to find a better way than this, unfortunately.
      // the delay of 150 is to handle the case the Next button is selected
      // via arrow keys and then clicked. A shorter delay will fail to move
      // the focus away from "Next" in terms of audio. Even now, the Next button
      // stays highlighted, which is a bummer. We need to figure out a better solution.
      window.setTimeout(() => {
        const elementToFocus =
          document.getElementById('audiofocus') ?? screen.current!
        elementToFocus?.focus()
        elementToFocus?.click()
      }, 150)
    }
    onPageLoad()
  }, [location.pathname, screenReader])

  return (
    <StyledFocusManager
      ref={screen}
      tabIndex={-1}
      onKeyPress={onKeyPress}
      onClick={onClick}
      onFocus={onFocus}
      onKeyPressCapture={onKeyPressCapture}
      onClickCapture={onClickCapture}
      onFocusCapture={onFocusCapture}
    >
      {children}
    </StyledFocusManager>
  )
}

export default withRouter(FocusManager)
