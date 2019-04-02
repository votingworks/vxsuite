import React from 'react'
import styled from 'styled-components'

interface Props {
  bold?: boolean
  center?: boolean
  error?: boolean
  muted?: boolean
  small?: boolean
  white?: boolean
}
const Text = styled('p')<Props>`
  color: ${({ error, muted, white }) =>
    (error && 'red') || (white && 'white') || (muted && 'gray') || undefined};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
  font-size: ${({ small }) => (small ? '0.8rem' : undefined)};
  font-weight: ${({ bold }) => (bold ? '600' : undefined)};
  @media print {
    color: ${({ error, muted, white }) =>
      (error && 'black') ||
      (white && 'white') ||
      (muted && 'black') ||
      undefined};
  }
`

export const TextWithLineBreaks = ({ text }: { text: string }) => (
  <React.Fragment>
    {text.split(/[\n|\r]{2}/g).map(x => (
      <p key={x}>
        {x.split(/[\n|\r]/g).map((y, i, arr) => (
          <React.Fragment key={y}>
            {y}
            {arr.length > 1 && i !== arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    ))}
  </React.Fragment>
)

export default Text
