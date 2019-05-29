import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import styled from 'styled-components'

const StyledScreen = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
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
    const elementToFocus =
      document.getElementById('audiofocus') || this.screen.current!
    elementToFocus.focus()
    elementToFocus.click()
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
