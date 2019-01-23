import styled from 'styled-components'

interface Props {
  center?: boolean
  error?: boolean
  muted?: boolean
}
export const Text = styled.p`
  color: ${({ error, muted }: Props) =>
    (error && 'red') || (muted && 'gray') || undefined};
  text-align: ${({ center }: Props) => (center ? 'center' : undefined)};
`

export default Text
