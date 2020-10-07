import styled from 'styled-components'

const TextInput = styled.input`
  border: 1px solid #333333;
  border-radius: 0.25rem;
  background: #ffffff;
  width: 100%;
  padding: 0.35rem 0.5rem;
  line-height: 1.25;
  &:disabled {
    background: #dddddd;
    color: rgb(170, 170, 170);
  }
`

export default TextInput
