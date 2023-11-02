// Inspiration: https://www.filamentgroup.com/lab/select-css.html
import React from 'react';
import styled from 'styled-components';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  children?: React.ReactNode;
  readonly fullWidth?: boolean;
  readonly large?: boolean;
  readonly small?: boolean;
  readonly primary?: boolean;
  readonly onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  readonly value?: string | readonly string[] | number;
};

const StyledSelect = styled.select<SelectProps>`
  /* stylelint-disable string-no-newline, unit-no-unknown */
  display: inline-block;
  margin: 0;
  border: none;
  border-radius: 0.25rem;
  box-sizing: border-box;
  background-color: ${({ primary }) =>
    (primary && 'rgb(71, 167, 75)') || 'rgb(211, 211, 211)'};
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 287.87"><path style="fill:${({
    primary,
  }) =>
    (primary && 'white') ||
    'darkslategrey'}" d="M502.54,9.46A30.83,30.83,0,0,0,479.78,0H32.22A30.84,30.84,0,0,0,9.63,9.46,30.81,30.81,0,0,0,0,31.87,30.8,30.8,0,0,0,9.46,54.46l224.13,224q22.41,18.91,44.82,0L502.54,54.29q19-22.49-.17-44.83Z" /></svg>');
  background-position: right
    ${({ large, small }) =>
      (small && '0.5em') || (large && '1.125em') || '0.75em'}
    center;
  background-repeat: no-repeat;
  background-size: ${({ large, small }) =>
      (small && '0.5em') || (large && '0.85em') || '0.75em'}
    auto;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : undefined)};
  max-width: 100%;
  padding: ${({ large, small }) =>
    (small && '0.35em 1.25em 0.35em 0.5em') ||
    (large && '1em 2.5em 1em 1.75em') ||
    '0.75rem 1.75rem 0.75rem 1rem'};
  line-height: 1.25;
  color: ${({ primary }) => (primary && '#FFFFFF') || 'black'};
  font-size: ${({ large }) => large && '1.25em'};
  appearance: none;

  &:disabled {
    background: #ddd;
    color: rgb(170, 170, 170);
  }
`;

/**
 * @deprecated Select doesn't support themes, use SearchSelect instead
 */
export function Select(
  props: SelectProps
): React.ReactElement<SelectProps, typeof Select> {
  return <StyledSelect {...props} />;
}
