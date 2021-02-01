import styled from 'styled-components'

const ButtonList = styled.p`
  column-gap: 0.5rem;
  @media (min-width: 1024px) {
    columns: 2;
  }
  @media (min-width: 1440px) {
    columns: 3;
  }
  & > button {
    margin-bottom: 0.5rem;
    overflow: hidden;
  }
`

export default ButtonList
