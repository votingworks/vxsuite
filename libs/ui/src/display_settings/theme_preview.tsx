import styled, { ThemeProvider } from 'styled-components';

import { ColorMode, SizeMode } from '@votingworks/types';

import { makeTheme } from '../themes/make_theme';

/** Props for {@link ThemePreview}. */
export interface ThemePreviewProps {
  colorMode?: ColorMode;
  sizeMode?: SizeMode;
}

const PREVIEW_CONTAINER_STATIC_SIZE_PX = 140;
const PREVIEW_CONTAINER_STATIC_BORDER_RADIUS_PX = 10;
const PREVIEW_CONTAINER_STATIC_BORDER_WIDTH_PX =
  PREVIEW_CONTAINER_STATIC_BORDER_RADIUS_PX / 3;

const Container = styled.span`
  align-items: center;
  background: ${(p) => p.theme.colors.background};
  border-radius: ${PREVIEW_CONTAINER_STATIC_BORDER_RADIUS_PX}px;
  border: ${PREVIEW_CONTAINER_STATIC_BORDER_WIDTH_PX}px solid
    ${(p) => p.theme.colors.onBackground};
  color: ${(p) => p.theme.colors.onBackground};
  display: flex;
  flex-shrink: 0;
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  height: ${PREVIEW_CONTAINER_STATIC_SIZE_PX}px;
  justify-content: center;
  line-height: ${(p) => p.theme.sizes.lineHeight};
  width: ${PREVIEW_CONTAINER_STATIC_SIZE_PX}px;
`;

/**
 * Renders a small preview window for the given theme parameters, which default
 * to the currently active theme parameters, if unspecified.
 */
export function ThemePreview(props: ThemePreviewProps): JSX.Element {
  const { colorMode, sizeMode } = props;

  return (
    <ThemeProvider
      theme={(theme) =>
        makeTheme({
          colorMode: colorMode || theme.colorMode,
          screenType: theme.screenType,
          sizeMode: sizeMode || theme.sizeMode,
        })
      }
    >
      <Container aria-hidden role="img">
        Aa
      </Container>
    </ThemeProvider>
  );
}
