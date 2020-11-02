import styled from 'styled-components'

const ButtonBar = styled('nav')`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgb(169, 169, 169);
  background: rgba(0, 0, 0, 0.05);
  padding: 0.25rem;

  & > *:first-child {
    order: 2;
  }

  & > * {
    flex: 1;
    margin: 0.25rem;
  }
  & > *:only-child {
    @media (min-width: 480px) {
      flex: 0;
      margin: auto;
      min-width: 33.333%;
    }
  }
`

export default ButtonBar
