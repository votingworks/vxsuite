import React from 'react';
import {
  DecoratorFunction,
  GlobalTypes,
  Parameters,
  StoryContext,
} from '@storybook/types';

import { AppBase, VoterSettingsManagerContext } from '../src';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';
import { createGlobalStyle } from 'styled-components';

// TODO: Find the storybook.js type declaration for this. Doesn't seem to be in
// the @storybook/types repo.
interface ToolbarItem<T> {
  value: T;
  title: string;
  left?: string;
}

type ScreenTypeToolBarItem = ToolbarItem<ScreenType>;

type ColorModeToolBarItem = ToolbarItem<ColorMode>;

type SizeModeToolBarItem = ToolbarItem<SizeMode>;

const DEFAULT_SCREEN_TYPE: ScreenType = 'builtIn';
const screenTypeToolBarItems: Record<ScreenType, ScreenTypeToolBarItem> = {
  builtIn: { title: 'Generic Built-In Screen', value: 'builtIn' },
  elo13: { title: 'ELO 13" Screen', value: 'elo13' },
  elo15: { title: 'ELO 15" Screen', value: 'elo15' },
  lenovoThinkpad15: { title: 'Lenovo Thinkpad 15"', value: 'lenovoThinkpad15' },
};

const DEFAULT_SIZE_MODE: SizeMode = 'desktop';
const sizeThemeToolBarItems: Record<SizeMode, SizeModeToolBarItem> = {
  desktop: { title: 'Desktop', value: 'desktop' },
  touchSmall: { title: 'Small (Touch)', value: 'touchSmall' },
  touchMedium: { title: 'Medium (Touch)', value: 'touchMedium' },
  touchLarge: { title: 'Large (Touch)', value: 'touchLarge' },
  touchExtraLarge: { title: 'Extra Large (Touch)', value: 'touchExtraLarge' },
  print: { title: 'Print', value: 'print' },
};

const DEFAULT_COLOR_MODE: ColorMode = 'desktop';
const colorThemeToolBarItems: Record<ColorMode, ColorModeToolBarItem> = {
  desktop: { title: 'Desktop', value: 'desktop' },
  contrastHighLight: {
    title: 'High Contrast - Light',
    value: 'contrastHighLight',
  },
  contrastHighDark: {
    title: 'High Contrast - Dark',
    value: 'contrastHighDark',
  },
  contrastMedium: { title: 'Medium Contrast', value: 'contrastMedium' },
  contrastLow: { title: 'Low Contrast', value: 'contrastLow' },
  print: { title: 'Print', value: 'print' },
};

/**
 * Defines global types that are passed through the story context to all stories
 * rendered in the storybook UI.
 *
 * The theme types are consumed below in {@link decorators} to set the VX theme
 * for all components that support theming.
 */
export const globalTypes: GlobalTypes = {
  screenType: {
    name: 'Screen Type',
    toolbar: {
      icon: 'tablet',
      items: Object.values(screenTypeToolBarItems),
      dynamicTitle: true,
    },
    defaultValue: DEFAULT_SCREEN_TYPE,
  },
  colorMode: {
    name: 'Color Theme',
    toolbar: {
      icon: 'sun',
      items: Object.values(colorThemeToolBarItems),
      dynamicTitle: true,
    },
    defaultValue: DEFAULT_COLOR_MODE,
  },
  sizeMode: {
    name: 'Size Theme',
    toolbar: {
      icon: 'ruler',
      items: Object.values(sizeThemeToolBarItems),
      dynamicTitle: true,
    },
    defaultValue: DEFAULT_SIZE_MODE,
  },
};

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
};

/**
 * Pass-through wrapper for stories that updates the UI theme when the defaults
 * are changed via the storybook toolbar.
 */
function StoryWrapper(props: {
  children: React.ReactNode;
  context: StoryContext;
}): JSX.Element {
  const { children, context } = props;
  const globals = context.globals as {
    colorMode: ColorMode;
    sizeMode: SizeMode;
  };

  const { setColorMode, setSizeMode } = React.useContext(
    VoterSettingsManagerContext
  );

  React.useEffect(() => {
    setColorMode(globals.colorMode);
  }, [globals.colorMode]);

  React.useEffect(() => {
    setSizeMode(globals.sizeMode);
  }, [globals.sizeMode]);

  return <React.Fragment>{children}</React.Fragment>;
}

const StoryGlobalStyle = createGlobalStyle`
  html, body {
    overflow: auto !important;
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
    const globals = context.globals as {
      colorMode: ColorMode;
      sizeMode: SizeMode;
      screenType: ScreenType;
    };
    return (
      <React.StrictMode>
        <StoryGlobalStyle />
        <AppBase
          defaultColorMode={globals.colorMode}
          defaultSizeMode={globals.sizeMode}
          screenType={globals.screenType}
        >
          <StoryWrapper context={context}>
            <Story />
          </StoryWrapper>
        </AppBase>
      </React.StrictMode>
    );
  },
];
