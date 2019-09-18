import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import styled from 'styled-components'

const StyledScreen = styled.div`
  /* Media query used to avoid having to undo these styles for print. */
  @media screen {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  &:focus {
    outline: none;
  }
`

class Screen extends React.Component<RouteComponentProps> {
  public screen = React.createRef<HTMLDivElement>()
  public componentDidMount() {
    this.focus()
  }
  public componentDidUpdate(prevProps: RouteComponentProps) {
    if (this.props.location.pathname !== prevProps.location.pathname) {
      this.focus()
    }
  }
  public focus = () => {
    // can't seem to find a better way than this, unfortunately.
    // the delay of 150 is to handle the case the Next button is selected
    // via arrow keys and then clicked. A shorter delay will fail to move
    // the focus away from "Next" in terms of audio. Even now, the Next button
    // stays highlighted, which is a bummer. We need to figure out a better solution.
    window.setTimeout(() => {
      const elementToFocus =
        document.getElementById('audiofocus') || this.screen.current!

      elementToFocus.focus()
      elementToFocus.click()
    }, 150)
  }
  public render() {
    return (
      <StyledScreen ref={this.screen} tabIndex={-1}>
        {this.props.children}
      </StyledScreen>
    )
  }
}

export default withRouter(Screen)
