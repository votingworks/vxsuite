import styled from 'styled-components'

interface Props {
  noMargin?: boolean
}

const Main = styled('main')<Props>`
  display: flex;
  flex-direction: column;
  flex: 1;
  margin: ${({ noMargin }: Props) => (noMargin ? undefined : '1rem')};
  @media print {
    justify-content: flex-start;
    margin: 0;
  }
`

interface ChildProps {
  center?: boolean
  centerVertical?: boolean
  centerHorizontal?: boolean
}

export const MainChild = styled('div')<ChildProps>`
  width: 100%;
  max-width: 40rem;
  margin: ${({
    center = false,
    centerVertical = center,
    centerHorizontal = true,
  }: ChildProps) =>
    `${centerVertical ? 'auto' : '0'} ${centerHorizontal ? 'auto' : '0'}`};
`

export default Main
