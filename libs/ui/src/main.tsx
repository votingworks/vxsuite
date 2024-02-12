import styled from 'styled-components';
import { assert } from '@votingworks/basics';

export interface MainProps {
  padded?: boolean;
  centerChild?: boolean;
  flexRow?: boolean;
  flexColumn?: boolean;
}

/**
 * The main content area of a page in the app (not including navigation).
 */
export const Main = styled('main')<MainProps>`
  display: ${({ centerChild, flexRow, flexColumn }) => {
    assert(
      !(flexRow && flexColumn),
      'Cannot specify both flexRow and flexColumn'
    );
    return (centerChild || flexRow || flexColumn) && 'flex';
  }};
  flex: 1;
  flex-direction: ${({ centerChild, flexColumn }) =>
    (centerChild || flexColumn) && 'column'};
  align-items: ${({ centerChild }) => centerChild && 'center'};
  justify-content: ${({ centerChild }) => centerChild && 'center'};
  overflow: auto;
  padding: ${({ padded }) => (padded ? '1rem' : undefined)};
  position: relative; /* For sticky header */
`;

/**
 * A header for the page that sticks to the top of Main.
 */
export const MainHeader = styled.header`
  padding: 1rem;
  background: ${(p) => p.theme.colors.container};
  position: sticky;
  top: 0;
  width: 100%;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  z-index: 1;

  h1 {
    margin: 0 !important;
  }
`;

/**
 * When using MainHeader, a sibling container for the page contents.
 */
export const MainContent = styled.div`
  overflow: auto;
  padding: 1rem;
  flex-grow: 1;
`;
