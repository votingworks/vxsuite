// Inspiration: https://www.filamentgroup.com/lab/select-css.html
import styled from 'styled-components'

interface Props {
  fullWidth?: boolean
}

const Select = styled.select<Props>`
  display: block;
  margin: 0;
  border: none;
  border-radius: 0.25rem;
  box-sizing: border-box;
  background: rgb(211, 211, 211) url('/images/select-caret.svg') right 0.75em
    top 50%/0.75em auto no-repeat;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : undefined)};
  max-width: 100%;
  padding: 0.75rem 1.75rem 0.75rem 1rem;
  line-height: 1.25;
  appearance: none;
`

export default Select
