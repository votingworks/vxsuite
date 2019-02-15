import styled from 'styled-components'

interface Props {
  center?: boolean
  error?: boolean
  muted?: boolean
  white?: boolean
}
export const Text = styled('p')<Props>`
  color: ${({ error, muted, white }) =>
    (error && 'red') || (white && 'white') || (muted && 'gray') || undefined};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
`

export default Text
