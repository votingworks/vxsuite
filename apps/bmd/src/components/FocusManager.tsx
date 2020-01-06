import React from 'react'
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
  screenReader: ScreenReader
  onKeyPress?: React.DOMAttributes<HTMLElement>['onKeyPress']
  onClick?: React.DOMAttributes<HTMLElement>['onClick']
  onFocus?: React.DOMAttributes<HTMLElement>['onFocus']
  onKeyPressCapture?: React.DOMAttributes<HTMLElement>['onKeyPressCapture']
  onClickCapture?: React.DOMAttributes<HTMLElement>['onClickCapture']
  onFocusCapture?: React.DOMAttributes<HTMLElement>['onFocusCapture']
}

class FocusManager extends React.Component<Props> {
  public screen = React.createRef<HTMLDivElement>()

  public componentDidMount() {
    this.onPageLoad()
  }

  public componentDidUpdate(prevProps: RouteComponentProps) {
    if (this.props.location.pathname !== prevProps.location.pathname) {
      this.onPageLoad()
    }
  }

  public onPageLoad = () => {
    this.props.screenReader.onPageLoad()

    // can't seem to find a better way than this, unfortunately.
    // the delay of 150 is to handle the case the Next button is selected
    // via arrow keys and then clicked. A shorter delay will fail to move
    // the focus away from "Next" in terms of audio. Even now, the Next button
    // stays highlighted, which is a bummer. We need to figure out a better solution.
    window.setTimeout(() => {
      const elementToFocus =
        document.getElementById('audiofocus') ?? this.screen.current!
      elementToFocus?.focus()
      elementToFocus?.click()
    }, 150)
  }

  public render() {
    return (
      <StyledFocusManager
        ref={this.screen}
        tabIndex={-1}
        onKeyPress={this.props.onKeyPress}
        onClick={this.props.onClick}
        onFocus={this.props.onFocus}
        onKeyPressCapture={this.props.onKeyPressCapture}
        onClickCapture={this.props.onClickCapture}
        onFocusCapture={this.props.onFocusCapture}
      >
        {this.props.children}
      </StyledFocusManager>
    )
  }
}

export default withRouter(FocusManager)
