import styled from 'styled-components'

interface Props {
  resize: boolean
}

const Textarea = styled.textarea<Props>`
  border: 2px solid #333333;
  width: 100%;
  min-height: 400px;
  padding: 0.25rem;
  font-family: monospace;
  font-size: 1rem;
  resize: ${({ resize = true }) => (resize ? undefined : 'none')};
`

export default Textarea
