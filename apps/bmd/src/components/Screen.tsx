import React from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import styled from 'styled-components'

const StyledScreen = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
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
    const screen = this.screen.current!
    screen.focus()
    screen.click()
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
