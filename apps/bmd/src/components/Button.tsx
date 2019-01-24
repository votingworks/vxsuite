import styled from 'styled-components'

import { ButtonEvent } from '../config/types'

const StyledButton = styled.button`
  background: lightgrey;
  border-radius: 0.25rem;
  color: black;
  white-space: nowrap;
`

interface Props {
  autoFocus?: boolean
  onClick: (event: ButtonEvent) => void
  children: React.ReactNode
}

const Button: React.StatelessComponent<Props> = props => {
  return <StyledButton {...props}>{props.children}</StyledButton>
}
export default Button
