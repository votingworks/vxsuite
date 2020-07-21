import styled from 'styled-components'
import { MarkStatus } from '../config/types'

// const GREEN_BG = 'rgba(71,167,75,.4)'
// const GREEN_BG_LIGHT = 'rgba(71,167,75,.2)'
// const RED_BG = 'rgba(71,167,75,.4)'
// const YELLOW_BG = '#ffff0066'

const GREEN_FG = '#006600ee'
const RED_FG = '#660000ee'
const YELLOW_FG = '#666600ee'

const ContestOptionCheckbox = styled.div<{
  current: MarkStatus
  changed?: MarkStatus
}>`
  cursor: pointer;

  * {
    color: ${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? GREEN_FG
        : changed === MarkStatus.Unmarked
        ? RED_FG
        : current === MarkStatus.Marginal
        ? YELLOW_FG
        : 'auto'}
  }

  > input {
    display: none;
    margin-left: 5px;
  }

  label {
    cursor: pointer;
  }

  > label::before {
    /* stylelint-disable-next-line string-no-newline */
    content: '${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '☑'
        : changed === MarkStatus.Unmarked
        ? '☒'
        : '☐'}'
  }
`

export default ContestOptionCheckbox
