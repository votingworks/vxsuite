import styled from 'styled-components'

interface Props {
  noPadding?: boolean
}

const Main = styled('main')<Props>`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: scroll;
  padding: ${({ noPadding }) => (noPadding ? undefined : '1rem 0.5rem 2rem')};
  @media (min-width: 480px) {
    padding: ${({ noPadding }) => (noPadding ? undefined : '2rem 1rem')};
  }
  @media print {
    justify-content: flex-start;
    padding: 0;
  }
`

interface ChildProps {
  center?: boolean
  centerVertical?: boolean
  centerHorizontal?: boolean
  padded?: boolean
}

export const MainChild = styled('div')<ChildProps>`
  width: 100%;
  max-width: 35rem;
  margin: ${({
    center = false,
    centerVertical = center,
    centerHorizontal = true,
  }) => `${centerVertical ? 'auto' : '0'} ${centerHorizontal ? 'auto' : '0'}`};
  padding: ${({ padded = false }) => (padded ? '1rem' : undefined)};
  @media print {
    max-width: 100%;
    margin: 0;
  }
`

export default Main
