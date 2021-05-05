import styled from 'styled-components'

interface Props {
  padded?: boolean
  noOverflow?: boolean
}

export const Main = styled('main')<Props>`
  display: flex;
  flex-direction: column;
  overflow: ${({ noOverflow }) => !noOverflow && 'auto'};
  padding: ${({ padded }) => padded && '1rem 0.5rem 2rem'};
`

interface ChildProps {
  center?: boolean
  centerVertical?: boolean
  centerHorizontal?: boolean
  flexContainer?: boolean
  maxWidth?: boolean
  narrow?: boolean
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
  max-width: ${({ maxWidth = true, narrow = false }) =>
    narrow ? '50%' : maxWidth ? '35rem' : undefined};
`
