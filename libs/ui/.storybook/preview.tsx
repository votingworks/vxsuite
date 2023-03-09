import React from 'react';
import styled, { css, ThemeConsumer } from 'styled-components';
import {
  DecoratorFunction,
  GlobalTypes,
  InputType,
  Parameters,
} from '@storybook/types';

import { AppBase, ColorModeSelector, P, TextSizeSelector } from '../src';
import { ColorMode, SizeMode } from '@votingworks/types';
import { rgba } from 'polished';

const DEFAULT_SIZE_MODE: SizeMode = 'm';
const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';

export const parameters: Parameters = {
  // This defines which prop name patterns are recognized as event handler
  // (action) props by storybook. They will be auto-populated by a default
  // jest mock which will log events to the "Actions" tab in the storybook UI
  // if a prop value isn't already specified in the *.stories.tsx file.
  // See https://storybook.js.org/docs/react/essentials/actions#automatically-matching-args
  actions: { argTypesRegex: '^on[A-Z].*' },

  // This defines which prop name patterns will cause storybook to render
  // special controls like visual color pickers and date/time selectors.
  // See https://storybook.js.org/docs/react/essentials/controls#custom-control-type-matchers
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },

  // Remove the default padding storybook applies to the preview body:
  layout: 'fullscreen',

  options: {
    storySort: {
      method: 'alphabetical',
      order: ['Atoms', 'Molecules', 'Organisms', 'libs-ui'],
    },
  },
};

// Sizes are in px here, since we want these styles to stay consistent
// across all size modes.
const StyledPreviewContainer = styled.div`
  /* Top padding makes room for absolute-positioned header: */
  padding: 148px 27px 18px;
`;

// Sizes are in px and em here, since we want these styles to stay consistent
// across all size modes.
const StyledHeader = styled.div`
  background: ${p => p.theme.colors.background};
  border-bottom: 5px ${p => p.theme.colors.foreground};
  box-shadow: 0 0.25em 0.25em ${p => rgba(p.theme.colors.foreground, 0.25)};
  box-sizing: border-box;
  display: flex;
  font-size: 24px !important;
  gap: 1.5em;
  padding: 9px 27px 18px;
  position: absolute;
  width: 100%;

  & * {
    font-size: 1em !important;
  }
`;

// Decorators allow us to wrap stories in custom components, provide context
// data, or modify the existing story context, if needed, to enable proper
// rendering, or to add any desired visual scaffolding.
export const decorators: DecoratorFunction[] = [
  (
    Story: any, // Original type here isn't inferred as a React render function
    context
  ) => {
    // const [colorMode, setColorMode] = React.useState<ColorMode>(DEFAULT_COLOR_MODE);

    return (
      <AppBase
        colorMode={DEFAULT_COLOR_MODE}
        enableScroll
        screenType="browser"
        sizeMode={DEFAULT_SIZE_MODE}
      >
          <StyledHeader>
            <TextSizeSelector devOnlyShowLegacyOption />
            <ColorModeSelector visibleModes={[
              'contrastHighDark',
              'contrastHighLight',
              'contrastLow',
              'contrastMedium',
              'legacy',
            ]} />
          </StyledHeader>
        <StyledPreviewContainer>
            <Story />
        </StyledPreviewContainer>
      </AppBase>
    );
  },
];
