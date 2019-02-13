import styled from 'styled-components'

interface Props {
  noMargin?: boolean
}

const Main = styled('main')<Props>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  margin: ${({ noMargin }: Props) => (noMargin ? undefined : '1rem')};
  @media print {
    justify-content: flex-start;
    margin: 0;
  }
`

export default Main
