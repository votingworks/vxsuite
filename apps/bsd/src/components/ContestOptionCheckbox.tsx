import styled from 'styled-components'
import { MarkStatus } from '../config/types'

const ContestOptionCheckbox = styled.div<{
  current: MarkStatus
  changed?: MarkStatus
}>`
  * {
    cursor: pointer;
    color: ${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '#006600ee'
        : changed === MarkStatus.Unmarked
        ? '#660000ee'
        : 'auto'}
  }

  > input {
    display: none;
    margin-left: 5px;
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
