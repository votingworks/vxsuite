import styled from 'styled-components'

interface Props {
  disabled?: boolean
}

const TextInput = styled.input<Props>`
  border: 1px solid #cccccc;
  background: ${({ disabled = false }) => (disabled ? '#dddddd' : '#ffffff')};
  width: 100%;
  padding: 0.35rem 0.5rem;
  line-height: 1.25;
`

export default TextInput
