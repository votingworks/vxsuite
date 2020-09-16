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
  flexContainer?: boolean
}

export const MainChild = styled('div')<ChildProps>`
  display: ${({ flexContainer }) => (flexContainer ? 'flex' : undefined)};
  flex: ${({ flexContainer }) => (flexContainer ? 1 : undefined)};
  flex-direction: inherit;
  margin: ${({
    center = false,
    centerVertical = center,
    centerHorizontal = center,
  }) => `${centerVertical ? 'auto' : '0'} ${centerHorizontal ? 'auto' : '0'}`};
`

export default Main
