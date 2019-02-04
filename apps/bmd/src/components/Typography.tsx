import styled from 'styled-components'

interface Props {
  center?: boolean
  error?: boolean
  muted?: boolean
}
export const Text = styled('p')<Props>`
  color: ${({ error, muted }) =>
    (error && 'red') || (muted && 'gray') || undefined};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
`

export default Text
