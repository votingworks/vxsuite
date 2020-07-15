import styled from 'styled-components'
import { Rect } from '@votingworks/hmpb-interpreter'
import { MarkStatus } from '../config/types'

const ContestOptionButton = styled.button<{
  rect: Rect
  original: MarkStatus
  changed?: MarkStatus
}>`
  position: absolute;
  color: transparent;
  background-color: ${({ original, changed }) =>
    (changed ?? original) === MarkStatus.Marked
      ? 'rgba(71,167,75,.4)'
      : changed === MarkStatus.Unmarked
      ? 'rgba(167,71,75,.4)'
      : 'transparent'};
  border: none;
  outline: none;
  cursor: pointer;
  left: ${({ rect }) => rect.x}px;
  top: ${({ rect }) => rect.y}px;
  width: ${({ rect }) => rect.width}px;
  height: ${({ rect }) => rect.height}px;

  ::after {
    position: absolute;
    top: ${({ rect }) => (rect.height - 28) / 2}px;
    right: ${30 - 28}px;
    width: 28px;
    height: 28px;

    /* stylelint-disable-next-line string-no-newline */
    content: '${({ original, changed }) =>
      (changed ?? original) === MarkStatus.Marked
        ? '☑️'
        : changed === MarkStatus.Unmarked
        ? '☒'
        : '☐'}';
    color: ${({ original, changed }) =>
      (changed ?? original) === MarkStatus.Marked
        ? '#006600ee'
        : changed === MarkStatus.Unmarked
        ? '#660000ee'
        : '#006600ee'};
  }

  :hover {
    background-color: ${({ original, changed }) =>
      changed === MarkStatus.Unmarked
        ? 'rgba(167,71,75,.4)'
        : original !== MarkStatus.Marked
        ? 'rgba(71,167,75,.2)'
        : 'rgba(71,167,75,.4)'};
  }
`

export default ContestOptionButton
