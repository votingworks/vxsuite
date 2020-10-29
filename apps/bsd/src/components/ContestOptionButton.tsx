import styled from 'styled-components'
import type { Rect } from '@votingworks/hmpb-interpreter'
import { MarkStatus } from '../config/types'

const GREEN_BG = 'rgba(71,167,75,.4)'
const GREEN_BG_LIGHT = 'rgba(71,167,75,.2)'
const GREEN_FG = '#006600ee'
const YELLOW_BG = '#ffff0066'
const RED_BG = 'rgba(167,71,75,.4)'
const RED_FG = '#660000ee'

interface Props {
  rect: Rect
  current: MarkStatus
  changed?: MarkStatus
}

const ContestOptionButton = styled.button<Props>`
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
  left: ${({ rect }) => rect.x}%;
  top: ${({ rect }) => rect.y}%;
  width: ${({ rect }) => rect.width}%;
  height: ${({ rect }) => rect.height}%;

  &::after {
    position: absolute;
    right: 2px;
    top: 0;
    font-size: 1.5vw;
    line-height: 1;
    color: ${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? GREEN_FG
        : changed === MarkStatus.Unmarked
        ? RED_FG
        : GREEN_FG};

    /* stylelint-disable-next-line string-no-newline */
    content: '${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '☑️'
        : changed === MarkStatus.Unmarked
        ? '☒'
        : '☐'}';
  }

  &:hover,
  &:focus {
    background-color: ${({ current, changed }) =>
      changed === MarkStatus.Unmarked
        ? RED_BG
        : current !== MarkStatus.Marked
        ? GREEN_BG_LIGHT
        : GREEN_BG};
  }
`

export default ContestOptionButton
