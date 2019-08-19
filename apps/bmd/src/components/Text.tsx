import React from 'react'
import styled, { css } from 'styled-components'

import * as GLOBALS from '../config/globals'

interface Props {
  bold?: boolean
  center?: boolean
  error?: boolean
  italic?: boolean
  muted?: boolean
  narrow?: boolean
  small?: boolean
  warning?: boolean
  warningIcon?: boolean
  wordBreak?: boolean
  white?: boolean
  voteIcon?: boolean
}

const iconStyles = css<Props>`
  &::before {
    display: inline-block;
    margin-top: -0.3rem;
    margin-right: 0.25rem;
    border-radius: ${({ warningIcon }) => (warningIcon && '50%') || undefined};
    background: ${({ warningIcon, voteIcon }) =>
      (warningIcon && 'darkorange') || (voteIcon && '#028099')};
    width: 1rem;
    height: 1rem;
    vertical-align: middle;
    text-align: center;
    line-height: 1.1;
    color: #ffffff;
    font-size: 90%;
    font-weight: 800;
    content: ${({ warningIcon, voteIcon }) =>
      (warningIcon && `'!'`) || (voteIcon && `'${GLOBALS.CHECK_ICON}'`)};
  }
`

const Text = styled('p')<Props>`
  margin-right: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  margin-left: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  max-width: ${({ narrow }) => (narrow ? '33ch' : undefined)};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
  color: ${({ error, muted, warning, white }) =>
    (error && 'red') ||
    (warning && 'darkorange') ||
    (white && '#FFFFFF') ||
    (muted && 'gray') ||
    undefined};
  @media print {
    color: ${({ error, muted, warning, white }) =>
      (error && 'black') ||
      (warning && 'black') ||
      (white && '#FFFFFF') ||
      (muted && 'black') ||
      undefined};
  }
  font-size: ${({ small }) => (small ? '0.8rem' : undefined)};
  font-weight: ${({ bold }) => (bold ? '600' : undefined)};
  font-style: ${({ italic }) => (italic ? 'italic' : undefined)};
  word-break: ${({ wordBreak }) => (wordBreak ? 'break-word' : undefined)};
  /* stylelint-disable-next-line value-keyword-case, order/properties-order */
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
