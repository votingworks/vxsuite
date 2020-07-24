import styled from 'styled-components'

interface Props {
  isSelected?: boolean
  isRemoved?: boolean
  isUnknown?: boolean
}

const Checkbox = styled.span<Props>`
  position: relative;
  top: 1px;
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  border: 2px solid #666666;
  border-color: ${({ isSelected, isRemoved, isUnknown }) =>
    isSelected || isRemoved ? '#ffffff' : isUnknown ? '#000000' : undefined};
  text-align: center;
  border-radius: 0.125em;
  &::before {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    font-weight: 700;
    font-size: 0.65em;
    text-align: center;
    /* stylelint-disable-next-line string-no-newline */
    content: '${({ isSelected, isRemoved, isUnknown }) =>
      isRemoved ? '✕' : isSelected ? '✓' : isUnknown ? '?' : undefined}';
  }
`

export default Checkbox
