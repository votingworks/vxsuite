import styled, { DefaultTheme } from 'styled-components';
import { assert } from '@votingworks/basics';
import { SizeMode } from '@votingworks/types';

export type JustifyContent =
  | 'start'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export interface MainProps {
  padded?: boolean;
  centerChild?: boolean;
  flexRow?: boolean;
  flexColumn?: boolean;
  justifyContent?: JustifyContent;
}

const CONTENT_SPACING_VALUES_REM: Readonly<Record<SizeMode, number>> = {
  desktop: 1,
  print: 1,
  touchSmall: 0.5,
  touchMedium: 0.35,
  touchLarge: 0.25,
  touchExtraLarge: 0.2,
};

function getSpacingValueRem(p: { theme: DefaultTheme }) {
  return CONTENT_SPACING_VALUES_REM[p.theme.sizeMode];
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
  justify-content: ${({ centerChild, justifyContent }) => {
    if (centerChild) {
      return 'center';
    }
    return justifyContent || undefined;
  }};
  overflow: auto;
  padding: ${(p) => (p.padded ? getSpacingValueRem(p) : 0)}rem;
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
