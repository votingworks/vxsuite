import styled from 'styled-components'

interface Props {
  white?: boolean
}

const Screen = styled.div<Props>`
  display: flex;
  flex-direction: column;
  background-color: ${({ white = true }) => (white ? 'white' : undefined)};
  height: 100%;
  @media print {
    display: none;
  }
`

export default Screen
