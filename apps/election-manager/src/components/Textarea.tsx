import styled, { css } from 'styled-components'
import ReactTextareaAutosize from 'react-textarea-autosize'

interface Props {
  disabled?: boolean
  resize?: boolean
}

const styles = css<Props>`
  border: 1px solid #cccccc;
  background: ${({ disabled = undefined }) =>
    disabled ? '#dddddd' : '#ffffff'};
  width: 100%;
  padding: 0.35rem 0.5rem;
  line-height: 1.25;
  font-size: 1rem;
  resize: ${({ resize = 0 }) => (resize ? undefined : 'none')};
`

export const TextareaAutosize = styled(ReactTextareaAutosize)<Props>`
  ${styles}/* stylelint-disable-line value-keyword-case */
`

const Textarea = styled.textarea<Props>`
  ${styles}/* stylelint-disable-line value-keyword-case */
`

export default Textarea
