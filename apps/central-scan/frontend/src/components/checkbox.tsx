import styled from 'styled-components';

interface Props {
  isSelected?: boolean;
  isRemoved?: boolean;
  isUnknown?: boolean;
}

export const Checkbox = styled.span<Props>`
  /* stylelint-disable string-no-newline */
  position: relative;
  top: 1px;
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  border: 2px solid #666;
  border-color: ${({ isSelected, isRemoved, isUnknown }) =>
    isSelected || isRemoved ? '#ffffff' : isUnknown ? '#000000' : undefined};
  text-align: center;
  border-radius: 0.125em;

  &::before {
    position: absolute;
    inset: 0;
    font-weight: 700;
    font-size: 0.65em;
    text-align: center;
    content: '${({ isSelected, isRemoved, isUnknown }) =>
      isRemoved ? '✕' : isSelected ? '✓' : isUnknown ? '?' : undefined}';
  }
`;
