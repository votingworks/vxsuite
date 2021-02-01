import styled from 'styled-components'

interface Props {
  padded?: boolean
  noOverflow?: boolean
}

const Main = styled('main')<Props>`
  display: flex;
  flex-direction: column;
  overflow: ${({ noOverflow = false }) => (noOverflow ? undefined : 'auto')};
  padding: ${({ padded = false }) => (padded ? '1rem 0.5rem 2rem' : undefined)};
  @media (min-width: 480px) {
    padding: ${({ padded = false }) => (padded ? '1rem' : undefined)};
  }
`

interface ChildProps {
  center?: boolean
  centerVertical?: boolean
  centerHorizontal?: boolean
  maxWidth?: boolean
  narrow?: boolean
}

export const MainChild = styled('div')<ChildProps>`
  margin: ${({
    center = false,
    centerVertical = center,
    centerHorizontal = center,
  }) => `${centerVertical ? 'auto' : '0'} ${centerHorizontal ? 'auto' : '0'}`};
  max-width: ${({ maxWidth = true, narrow = false }) =>
    narrow ? '50%' : maxWidth ? '35rem' : undefined};
`

export default Main
