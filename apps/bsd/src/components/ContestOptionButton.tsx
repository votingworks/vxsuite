import styled from 'styled-components'
import { Rect } from '@votingworks/hmpb-interpreter'
import { MarkStatus } from '../config/types'

const GREEN_BG = 'rgba(71,167,75,.4)'
const GREEN_BG_LIGHT = 'rgba(71,167,75,.2)'
const RED_BG = 'rgba(167,71,75,.4)'
const YELLOW_BG = '#ffff0066'

const GREEN_FG = '#006600ee'
const RED_FG = '#660000ee'

const ContestOptionButton = styled.button<{
  rect: Rect
  current: MarkStatus
  changed?: MarkStatus
}>`
  position: absolute;
  color: transparent;
  background-color: ${({ current, changed }) =>
    (changed ?? current) === MarkStatus.Marked
      ? GREEN_BG
      : changed === MarkStatus.Unmarked
      ? RED_BG
      : current === MarkStatus.Marginal
      ? YELLOW_BG
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
    content: '${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '☑️'
        : changed === MarkStatus.Unmarked
        ? '☒'
        : '☐'}';
    color: ${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? GREEN_FG
        : changed === MarkStatus.Unmarked
        ? RED_FG
        : GREEN_FG};
  }

  :hover {
    background-color: ${({ current, changed }) =>
      changed === MarkStatus.Unmarked
        ? RED_BG
        : current !== MarkStatus.Marked
        ? GREEN_BG_LIGHT
        : GREEN_BG};
  }
`

export default ContestOptionButton
