import styled from 'styled-components'

//  RootScreen
//    Main
//      MainContent
//    Sidebar
//      SidebarContent

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
    padding: ${({ padded = false }) => (padded ? '2rem' : undefined)};
  }
  @media print {
    display: none;
  }
`

interface ChildProps {
  center?: boolean
  centerVertical?: boolean
  centerHorizontal?: boolean
  maxWidth?: boolean
  padded?: boolean
}

export const MainChild = styled('div')<ChildProps>`
  margin: ${({
    center = false,
    centerVertical = center,
    centerHorizontal = center,
  }) => `${centerVertical ? 'auto' : '0'} ${centerHorizontal ? 'auto' : '0'}`};
  max-width: ${({ maxWidth = true }) => (maxWidth ? '35rem' : undefined)};
  @media print {
    margin: 0;
    max-width: 100%;
  }
`

export default Main
