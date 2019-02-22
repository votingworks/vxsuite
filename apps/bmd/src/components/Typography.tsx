import styled from 'styled-components'

interface Props {
  bold?: boolean
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
  font-weight: ${({ bold }) => (bold ? '600' : undefined)};
`

export default Text

// {
//   `First line\nSecond line\nThird line`
//     .split('\n')
//   .map((item, key) => (
//     <React.Fragment key={key}>
//       {item}
//       <br />
//     </React.Fragment>
//   ))
// }
