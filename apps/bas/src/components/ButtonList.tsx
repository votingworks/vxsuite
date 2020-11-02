import styled from 'styled-components'

interface Props {
  columns?: number
}

const ButtonList = styled.div<Props>`
  columns: ${({ columns = 1 }) => columns};
  column-gap: 1rem;
  & > button {
    margin-bottom: 1rem;
    overflow: hidden;
    padding: 2rem 1rem;
    font-size: 1.5rem;
  }
`

export default ButtonList
