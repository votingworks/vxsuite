import styled from 'styled-components'

interface Props {
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  voterMode?: boolean
}

const Screen = styled.div<Props>`
  display: flex;
  flex-direction: ${({ flexDirection = 'row' }) => flexDirection};
  height: 100%;
  & > nav {
    flex: ${({ voterMode = true }) => (voterMode ? '1' : '2')};
  }
  & > main {
    flex: ${({ voterMode = true }) => (voterMode ? '2' : '3')};
  }
  @media print {
    display: none;
  }
`

export default Screen
