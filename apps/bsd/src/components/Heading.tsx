import styled from 'styled-components'

const Heading = styled.div`
  margin-bottom: 1rem;
  & p + h1 {
    margin-top: -1rem;
  }
`

export default Heading
