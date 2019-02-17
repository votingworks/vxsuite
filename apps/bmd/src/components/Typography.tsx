import styled from 'styled-components'

interface Props {
  center?: boolean
  error?: boolean
  muted?: boolean
  small?: boolean
  white?: boolean
}
export const Text = styled('p')<Props>`
  color: ${({ error, muted, white }) =>
    (error && 'red') || (white && 'white') || (muted && 'gray') || undefined};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
  font-size: ${({ small }) => (small ? '0.8rem' : undefined)};
`

export default Text
