import React from 'react';
import styled, { css } from 'styled-components';
import DomPurify from 'dompurify';

import * as GLOBALS from '../config/globals';

interface Props {
  bold?: boolean;
  light?: boolean;
  center?: boolean;
  error?: boolean;
  italic?: boolean;
  muted?: boolean;
  narrow?: boolean;
  noWrap?: boolean;
  small?: boolean;
  warning?: boolean;
  warningIcon?: boolean;
  wordBreak?: boolean;
  voteIcon?: boolean;
}

const iconStyles = css<Props>`
  &::before {
    display: inline-block;
    margin-top: -0.3rem;
    margin-right: 0.25rem;
    border-radius: ${({ warningIcon }) => warningIcon && '50%'};
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
      (warningIcon && "'!'") || (voteIcon && `'${GLOBALS.CHECK_ICON}'`)};
  }
`;

export const Text = styled('p')<Props>`
  margin-right: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  margin-left: ${({ narrow }) => (narrow ? 'auto' : undefined)};
  max-width: ${({ narrow }) => (narrow ? '33ch' : undefined)};
  text-align: ${({ center }) => (center ? 'center' : undefined)};
  white-space: ${({ noWrap }) => (noWrap ? 'nowrap' : undefined)};
  color: ${({ error, muted, warning }) =>
    (error && 'red') ??
    (warning && 'darkorange') ??
    (muted && 'gray') ??
    undefined};
  @media print {
    color: ${({ error, muted, warning }) =>
      (error && 'black') ??
      (warning && 'black') ??
      (muted && 'black') ??
      undefined};
  }
  font-size: ${({ small }) => (small ? '0.8rem' : undefined)};
  font-weight: ${({ bold, light }) =>
    (bold && '600') ?? (light && '300') ?? undefined};
  font-style: ${({ italic }) => (italic ? 'italic' : undefined)};
  word-break: ${({ wordBreak }) => (wordBreak ? 'break-word' : undefined)};
  /* stylelint-disable-next-line value-keyword-case, order/properties-order */
  ${({ warningIcon, voteIcon }) => (warningIcon || voteIcon) && iconStyles}
`;

interface TextWithLineBreaksProps extends Props {
  text: string;
  style?: React.CSSProperties;
}

export function TextWithLineBreaks({
  text,
  ...rest
}: TextWithLineBreaksProps): JSX.Element {
  return (
    <React.Fragment>
      {text.split(/[\n\r]{2}/g).map((x) => (
        <Text {...rest} key={x}>
          {x.split(/[\n\r]/g).map((y, i, arr) => (
            <React.Fragment key={y}>
              <span
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: DomPurify.sanitize(y),
                }}
              />
              {i !== arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </Text>
      ))}
    </React.Fragment>
  );
}

export const NoWrap = styled.span`
  white-space: nowrap;
`;
