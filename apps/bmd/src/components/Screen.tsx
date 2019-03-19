import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router'
import styled from 'styled-components'

const StyledScreen = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`

class Screen extends React.Component<RouteComponentProps> {
  public screen = React.createRef<HTMLDivElement>()
  public componentDidUpdate = (prevProps: RouteComponentProps) => {
    if (this.props.location.pathname !== prevProps.location.pathname) {
      // Hack: setTimeout delays click until end of current event loop to ensure
      // new screen has mounted.
      window.setTimeout(() => {
        this.screen.current!.click()
      }, 0)
    }
  }
  public render() {
    return <StyledScreen ref={this.screen}>{this.props.children}</StyledScreen>
  }
}

export default withRouter(Screen)
