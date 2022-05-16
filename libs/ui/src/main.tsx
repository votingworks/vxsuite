import styled from 'styled-components';

interface Props {
  padded?: boolean;
  noOverflow?: boolean;
}

export const Main = styled('main')<Props>`
  display: flex;
  overflow: ${({ noOverflow }) => (noOverflow ? undefined : 'auto')};
  padding: ${({ padded }) => (padded ? '1rem 0.5rem 2rem' : undefined)};
`;

interface ChildProps {
  center?: boolean;
  flexContainer?: boolean;
  flexDirection?: React.CSSProperties['flexDirection'];
  maxWidth?: boolean;
  narrow?: boolean;
}

export const MainChild = styled('div')<ChildProps>`
  display: ${({ flexContainer }) => (flexContainer ? 'flex' : undefined)};
  flex: ${({ flexContainer }) => (flexContainer ? 1 : undefined)};
  flex-direction: ${({ flexDirection = 'column' }) => flexDirection};
  margin: ${({ center = false }) => (center ? 'auto' : undefined)};
  max-width: ${({ maxWidth = true, narrow = false }) =>
    narrow ? '50%' : maxWidth ? '35rem' : undefined};
`;

export const MainChildFlexRow = styled.div`
  display: flex;
  flex: 1;
`;
