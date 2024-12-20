/* istanbul ignore file - tested via VxMark Playwright tests */
import React from 'react';
import styled, { DefaultTheme, ThemeProvider } from 'styled-components';

import { rgba } from 'polished';
import { SizeMode, TouchSizeMode, isTouchSizeMode } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { Button } from './button';
import { Icons } from './icons';
import { makeTheme } from './themes/make_theme';
import { appStrings } from './ui_strings';

export interface WithScrollButtonsProps {
  children: React.ReactNode;
  focusable?: boolean;
  noPadding?: boolean;
}

const SCROLL_DISTANCE_TO_CONTENT_HEIGHT_RATIO = 0.75;

const SCROLL_BUTTON_SIZE_MODE_OVERRIDES: Readonly<
  Record<TouchSizeMode, TouchSizeMode>
> = {
  touchSmall: 'touchSmall',
  touchMedium: 'touchMedium',
  touchLarge: 'touchMedium',
  touchExtraLarge: 'touchMedium',
};

const CONTENT_SPACING_VALUES_REM: Readonly<Record<SizeMode, number>> = {
  desktop: 0.5,
  print: 0.5,
  touchSmall: 0.5,
  touchMedium: 0.5,
  touchLarge: 0.25,
  touchExtraLarge: 0.25,
};

function getSpacingValueRem(p: { theme: DefaultTheme }) {
  return CONTENT_SPACING_VALUES_REM[p.theme.sizeMode];
}

const Container = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

interface ContentProps {
  noPadding?: boolean;
  scrollEnabled: boolean;
}

const Content = styled.div<ContentProps>`
  align-items: stretch;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  justify-content: stretch;
  overflow: scroll;
  padding: 0 ${(p) => (p.noPadding ? 0 : getSpacingValueRem(p))}rem;

  /*
   * TODO: We should consider making this configurable via voter settings, since
   * Some voters may prefer a reduced-motion mode without these smoothed-out
  * transitions.
  */
  scroll-behavior: smooth;

  /* Always pad bottom when scroll enabled, to account for bottom shadow: */
  padding-bottom: ${(p) => (p.scrollEnabled ? getSpacingValueRem(p) : 0)}rem;
`;

const Controls = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: ${(p) => getSpacingValueRem(p) / 2}rem;
  padding: ${(p) => getSpacingValueRem(p) / 2}rem;
  padding-left: 0;
`;

/**
 * Allows controls to stay fixed at top and bottom when only one of them is
 * visible (without the need for absolute positioning).
 */

const Control = styled(Button)`
  border-radius: 50%;
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  width: 4.75em;
  height: 4.75em;

  :disabled {
    opacity: 0;
  }
`;

const ControlLabel = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.25em;
`;

const TopShadow = styled.div`
  box-shadow:
    0 0.2rem 0.1rem -0.1rem ${(p) => rgba(p.theme.colors.onBackground, 0.25)},
    0 0.1rem 0.2rem 0 ${(p) => rgba(p.theme.colors.onBackground, 0.25)},
    0 0.1rem 0.3rem 0 ${(p) => rgba(p.theme.colors.onBackground, 0.15)};
  height: 1rem;
  left: 0;
  position: absolute;
  top: -1rem;
  width: 100%;
`;

const BottomShadow = styled.div`
  box-shadow:
    0 -0.1rem 0.1rem 0.1rem ${(p) => rgba(p.theme.colors.onBackground, 0.25)},
    0 -0.05rem 0.2rem 0 ${(p) => rgba(p.theme.colors.onBackground, 0.25)},
    0 -0.05rem 0.3rem 0 ${(p) => rgba(p.theme.colors.onBackground, 0.15)};
  bottom: -1rem;
  height: 1rem;
  left: 0;
  position: absolute;
  width: 100%;
`;

/**
 * Renders the provided child content with touch-friendly scroll buttons when
 * the content extends beyond the available height.
 *
 * This assumes {@link WithScrollButtons} is rendered within a parent container
 * which has an explicit height/max height set.
 */
export function WithScrollButtons(props: WithScrollButtonsProps): JSX.Element {
  const { children, focusable, noPadding } = props;

  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);
  const scrollEnabled = canScrollUp || canScrollDown;

  const contentRef = React.useRef<HTMLDivElement>(null);

  function updateScrollState() {
    if (contentRef.current) {
      const { offsetHeight, scrollHeight, scrollTop } = contentRef.current;

      setCanScrollUp(Math.floor(scrollTop) > 0);
      setCanScrollDown(
        Math.ceil(scrollTop + offsetHeight) < Math.floor(scrollHeight)
      );
    }
  }
  React.useLayoutEffect(updateScrollState, [children, contentRef]);

  const onScrollUp = React.useCallback(() => {
    if (contentRef.current) {
      const { offsetHeight, scrollTop } = contentRef.current;

      const targetScrollTop =
        scrollTop -
        Math.round(offsetHeight * SCROLL_DISTANCE_TO_CONTENT_HEIGHT_RATIO);

      contentRef.current.scrollTo({
        top: Math.max(targetScrollTop, 0),
      });
    }
  }, []);

  const onScrollDown = React.useCallback(() => {
    if (contentRef.current) {
      const { offsetHeight, scrollHeight, scrollTop } = contentRef.current;

      const maxScrollTop = scrollHeight - offsetHeight;
      const targetScrollTop =
        scrollTop +
        Math.round(offsetHeight * SCROLL_DISTANCE_TO_CONTENT_HEIGHT_RATIO);

      contentRef.current.scrollTo({
        top: Math.min(targetScrollTop, maxScrollTop),
      });
    }
  }, []);

  return (
    <Container>
      <Content
        ref={contentRef}
        scrollEnabled={scrollEnabled}
        onScroll={updateScrollState}
        noPadding={noPadding}
      >
        {children}
      </Content>
      {scrollEnabled && (
        <ThemeProvider
          theme={(theme) => {
            assert(isTouchSizeMode(theme.sizeMode));
            return makeTheme({
              colorMode: theme.colorMode,
              screenType: theme.screenType,
              sizeMode: SCROLL_BUTTON_SIZE_MODE_OVERRIDES[theme.sizeMode],
            });
          }}
        >
          <Controls aria-hidden={!focusable}>
            <Control
              disabled={!canScrollUp}
              onPress={onScrollUp}
              variant="primary"
            >
              <ControlLabel>
                <Icons.ChevronCircleUp />
                {appStrings.buttonMore()}
              </ControlLabel>
            </Control>
            <Control
              disabled={!canScrollDown}
              onPress={onScrollDown}
              variant="primary"
            >
              <ControlLabel>
                {appStrings.buttonMore()}
                <Icons.ChevronCircleDown />
              </ControlLabel>
            </Control>
          </Controls>
        </ThemeProvider>
      )}
      {canScrollUp && <TopShadow />}
      {canScrollDown && <BottomShadow />}
    </Container>
  );
}
