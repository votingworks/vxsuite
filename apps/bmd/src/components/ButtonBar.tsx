import styled from 'styled-components'

const ButtonBar = styled.div`
  display: flex;
  padding: 1rem 2rem;
  background: grey;
  border-bottom: 1px solid darkgrey;
  justify-content: space-between;
  & > :first-child {
    order: 2;
  }
  @media print {
    display: none;
  }
`

export default ButtonBar
