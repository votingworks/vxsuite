import styled from 'styled-components'

interface Props {
  resize: boolean
}

const Textarea = styled.textarea<Props>`
  width: 100%;
  min-height: 400px;
  resize: ${({ resize = true }) => (resize ? undefined : 'none')};
  padding: 0.25rem;
  font-size: 1rem;
  border: 2px solid #333333;
  font-family: monospace;
`

export default Textarea
