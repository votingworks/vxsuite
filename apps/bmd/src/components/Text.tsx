import React from 'react'
import styled, { css } from 'styled-components'

import GLOBALS from '../config/globals'

interface Props {
  bold?: boolean
  center?: boolean
  error?: boolean
  muted?: boolean
  small?: boolean
  warning?: boolean
  warningIcon?: boolean
  wordBreak?: boolean
  white?: boolean
  voteIcon?: boolean
}

const iconStyles = css<Props>`
  &:before {
    content: ${({ warningIcon, voteIcon }) =>
      (warningIcon && `'!'`) || (voteIcon && `'${GLOBALS.CHECK_ICON}'`)};
    display: inline-block;
    margin-top: -0.3rem;
    margin-right: 0.25rem;
    width: 1rem;
    height: 1rem;
    border-radius: ${({ warningIcon }) => (warningIcon && '50%') || undefined};
    background: ${({ warningIcon, voteIcon }) =>
      (warningIcon && 'darkorange') || (voteIcon && '#028099')};
    color: white;
    text-align: center;
    line-height: 1.1;
    font-size: 90%;
    font-weight: 800;
    vertical-align: middle;
  }
`

const Text = styled('p')<Props>`
  color: ${({ error, muted, warning, white }) =>
    (error && 'red') ||
    (warning && 'darkorange') ||
    (white && 'white') ||
    (muted && 'gray') ||
    undefined};
  @media print {
    color: ${({ error, muted, warning, white }) =>
      (error && 'black') ||
      (warning && 'black') ||
      (white && 'white') ||
      (muted && 'black') ||
      undefined};
  }
  text-align: ${({ center }) => (center ? 'center' : undefined)};
  font-size: ${({ small }) => (small ? '0.8rem' : undefined)};
  font-weight: ${({ bold }) => (bold ? '600' : undefined)};
  word-break: ${({ wordBreak }) => (wordBreak ? 'break-word' : undefined)};
  ${({ warningIcon, voteIcon }) => (warningIcon || voteIcon) && iconStyles}
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
