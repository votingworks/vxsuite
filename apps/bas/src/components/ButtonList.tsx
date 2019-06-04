import styled from 'styled-components'

const ButtonList = styled.div`
  column-gap: 1rem;
  @media (min-width: 720px) {
    columns: 2;
  }
  @media (min-width: 1440px) {
    columns: 3;
  }
  & > button {
    margin-bottom: 0.5rem;
    overflow: hidden;
    padding: 2rem 1rem;
    font-size: 1.5rem;
  }
`

export default ButtonList
