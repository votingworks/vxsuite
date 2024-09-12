import styled, { css } from 'styled-components';

import * as GLOBALS from './globals';

export const successTextGreen = 'rgb(0,128,0)';

interface Props {
  bold?: boolean;
  light?: boolean;
  center?: boolean;
  error?: boolean;
  success?: boolean;
  italic?: boolean;
  left?: boolean;
  muted?: boolean;
  narrow?: boolean;
  normal?: boolean;
  noWrap?: boolean;
  preLine?: boolean;
  right?: boolean;
  small?: boolean;
  warning?: boolean;
  warningIcon?: boolean;
  wordBreak?: boolean;
  voteIcon?: boolean;
  white?: boolean;
}

const iconStyles = css<Props>`
  &::before {
    display: inline-block;
    margin-top: -0.3em;
    margin-right: 0.25em;
    border-radius: ${({ warningIcon }) => warningIcon && '50%'};
    background: ${({ warningIcon, voteIcon }) =>
      (warningIcon && 'darkorange') || (voteIcon && '#028099')};
    width: 1em;
    height: 1em;
    vertical-align: middle;
    text-align: center;
    line-height: 1.1;
    color: #fff;
    font-size: 90%;
    font-weight: 800;
    content: ${({ warningIcon, voteIcon }) =>
      (warningIcon && "'!'") || (voteIcon && `'${GLOBALS.CHECK_ICON}'`)};
  }
`;

export const Text = styled('p')<Props>`
  margin-right: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  margin-left: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  max-width: ${({ narrow }) => (narrow ? '33ch' : undefined)};
  text-align: ${({ center, right, left }) =>
    (left && 'left') ||
    (center && 'center') ||
    (right && 'right') ||
    undefined};
  white-space: ${({ noWrap, preLine }) =>
    noWrap ? 'nowrap' : preLine ? 'pre-line' : undefined};
  color: ${({ error, muted, success, warning, white }) =>
    (error && 'red') ??
    (warning && 'darkorange') ??
    (success && successTextGreen) ??
    (muted && 'gray') ??
    (white && '#FFFFFF') ??
    undefined};

  @media print {
    color: ${({ error, muted, success, warning, white }) =>
      (error && 'black') ??
      (warning && 'black') ??
      (success && 'black') ??
      (muted && 'black') ??
      (white && '#FFFFFF') ??
      undefined};
  }

  font-size: ${({ small }) => (small ? '0.8em' : undefined)};
  font-weight: ${({ bold, light, normal }) =>
    (bold && '600') ?? (light && '300') ?? (normal && '400') ?? undefined};
  font-style: ${({ italic }) => (italic ? 'italic' : undefined)};
  word-break: ${({ wordBreak }) => (wordBreak ? 'break-word' : undefined)};
  ${({ warningIcon, voteIcon }) => (warningIcon || voteIcon) && iconStyles}
`;

export const NoWrap = styled.span`
  white-space: nowrap;
`;

export const Monospace = styled.span`
  font-family: monospace;
`;
