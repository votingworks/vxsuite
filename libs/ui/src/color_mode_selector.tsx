/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';
import styled, { css, DefaultTheme, ThemeConsumer } from 'styled-components';

import { Color, ColorMode, SizeMode, UiTheme } from '@votingworks/types';
import { SegmentedButton, SegmentedButtonOption } from './segmented_button';
import { UiThemeManagerContext } from './app_base';
import { Caption } from './typography';
import { Icons } from './icons';
import { makeTheme } from './themes/make_theme';

export interface ColorModeSelectorProps {
  visibleModes?: ColorMode[];
}

interface StyledIconProps {
  colors: UiTheme['colors'];
}

function getIconDiameterEm(p: StyledIconProps & {theme: DefaultTheme}): number {
  return p.theme.sizes.lineHeight;
}

function getAccentColorDiameterEm(p: StyledIconProps & {theme: DefaultTheme}): number {
  return getIconDiameterEm(p) / 2;
}

const THEME_COLORS: Record<ColorMode, UiTheme['colors']> = {
  contrastHighDark: makeTheme({ colorMode: 'contrastHighDark' }).colors,
  contrastHighLight: makeTheme({ colorMode: 'contrastHighLight' }).colors,
  contrastLow: makeTheme({ colorMode: 'contrastLow' }).colors,
  contrastMedium: makeTheme({ colorMode: 'contrastMedium' }).colors,
  legacy: makeTheme({ colorMode: 'legacy' }).colors,
};

const DEFAULT_VISIBLE_MODES: readonly ColorMode[] = [
  'contrastHighDark',
  'contrastLow',
  'contrastMedium',
  'contrastHighLight',
];

const StyledIcon = styled.div<StyledIconProps>`
  display: flex;
  position: relative;
`;

const halfCircleDivStyles = css<StyledIconProps>`
  border: 0.075em solid currentColor;
  border-radius: ${p => getIconDiameterEm(p) / 2}em;
  box-sizing: border-box;
  font-size: 1rem;
  height: ${getIconDiameterEm}em;
  width: ${p => getIconDiameterEm(p) / 2}em;
`;

const StyledIconLeftHalf = styled.div<StyledIconProps>`
  ${halfCircleDivStyles};

  background: ${(p) => p.colors.background};
  border-bottom-right-radius: 0;
  border-right: none;
  border-top-right-radius: 0;
`;

const StyledIconRightHalf = styled.div<StyledIconProps>`
  ${halfCircleDivStyles};

  background: ${(p) => p.colors.foreground};
  border-bottom-left-radius: 0;
  border-left: none;
  border-top-left-radius: 0;
`;

const StyledIconAccentColor = styled.div<StyledIconProps>`
  background: ${p => p.colors.accentPrimary};
  border: 0.05em solid currentColor;
  border-radius: ${p => getAccentColorDiameterEm(p) / 2}em;
  box-sizing: border-box;
  display: ${p => p.colors.accentPrimary === p.colors.foreground && 'none'};
  height: ${getAccentColorDiameterEm}em;
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  top: 50%;
  align-self: center;
  justify-self: center;
  width: ${getAccentColorDiameterEm}em;
`;

function renderIcon(colorMode: ColorMode): JSX.Element {
  const colors = THEME_COLORS[colorMode];

  return (
    <StyledIcon colors={colors}>
      <StyledIconLeftHalf colors={colors} />
      <StyledIconRightHalf colors={colors} />
      <StyledIconAccentColor colors={colors} />
    </StyledIcon>
  );
}

const availableOptions: Record<ColorMode, SegmentedButtonOption<ColorMode>> = {
  legacy: {
    id: 'legacy',
    label: '↩️',
    ariaLabel: 'Legacy',
  },
  contrastHighDark: {
    id: 'contrastHighDark',
    label: renderIcon('contrastHighDark'),
    ariaLabel: 'High Contrast - Dark Mode',
  },
  contrastLow: {
    id: 'contrastLow',
    label: renderIcon('contrastLow'),
    ariaLabel: 'Low Contrast',
  },
  contrastMedium: {
    id: 'contrastMedium',
    label: renderIcon('contrastMedium'),
    ariaLabel: 'Medium Contrast',
  },
  contrastHighLight: {
    id: 'contrastHighLight',
    label: renderIcon('contrastHighLight'),
    ariaLabel: 'High Contrast - Light Mode',
  },
};

export function ColorModeSelector(props: ColorModeSelectorProps): JSX.Element {
  const { setColorMode } = React.useContext(UiThemeManagerContext);

  const visibleModes = new Set(props.visibleModes || DEFAULT_VISIBLE_MODES);
  const visibleOptions = Object.values(availableOptions).filter((opt) =>
    visibleModes.has(opt.id)
  );

  return (
    <ThemeConsumer>
      {(currentTheme) => (
        <div>
          <Caption align="center" aria-hidden>
            Contrast
          </Caption>
          <div>
            <SegmentedButton
              onChange={setColorMode}
              options={visibleOptions}
              selectedOptionId={currentTheme.colorMode}
            />
          </div>
        </div>
      )}
    </ThemeConsumer>
  );
}
