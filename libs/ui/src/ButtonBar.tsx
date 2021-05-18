import styled from 'styled-components'

export const ButtonBar = styled('nav')`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgb(169, 169, 169);
  background: rgba(0, 0, 0, 0.05);
  padding: 0.25rem;

  & > *:first-child {
    order: 2;
    min-width: 50%;
  }

  & > * {
    flex-grow: 1;
    margin: 0.25rem;
  }
  & > *:only-child {
    @media (min-width: 480px) {
      flex-grow: initial;
      margin: auto;
      min-width: 33.333%;
    }
  }
`
