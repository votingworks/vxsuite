import React from 'react';
import {
  DecoratorFunction,
  GlobalTypes,
  Parameters,
  StoryContext,
} from '@storybook/types';

import { TouchColorMode, TouchSizeMode } from '@votingworks/types';
import { AppBase, DisplaySettingsManagerContext } from '@votingworks/ui';

// TODO: Find the storybook.js type declaration for this. Doesn't seem to be in
// the @storybook/types repo.
interface ToolbarItem<T> {
  value: T;
  title: string;
  left?: string;
}

type ColorModeToolBarItem = ToolbarItem<TouchColorMode>;

type SizeModeToolBarItem = ToolbarItem<TouchSizeMode>;

const DEFAULT_SIZE_MODE: TouchSizeMode = 'touchMedium';
const sizeThemeToolBarItems: Record<TouchSizeMode, SizeModeToolBarItem> = {
  touchSmall: { title: 'Small (Touch)', value: 'touchSmall' },
  touchMedium: { title: 'Medium (Touch)', value: 'touchMedium' },
  touchLarge: { title: 'Large (Touch)', value: 'touchLarge' },
  touchExtraLarge: {
    title: 'Extra Large (Touch)',
    value: 'touchExtraLarge',
  },
};

const DEFAULT_COLOR_MODE: TouchColorMode = 'contrastHighLight';
const colorThemeToolBarItems: Record<TouchColorMode, ColorModeToolBarItem> = {
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
};

/**
 * Defines global types that are passed through the story context to all stories
 * rendered in the storybook UI.
 *
 * The theme types are consumed below in {@link decorators} to set the VX theme
 * for all components that support theming.
 */
export const globalTypes: GlobalTypes = {
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
    colorMode: TouchColorMode;
    sizeMode: TouchSizeMode;
  };

  const { setColorMode, setSizeMode } = React.useContext(
    DisplaySettingsManagerContext
  );

  React.useEffect(() => {
    setColorMode(globals.colorMode);
  }, [globals.colorMode]);

  React.useEffect(() => {
    setSizeMode(globals.sizeMode);
  }, [globals.sizeMode]);

  return <React.Fragment>{children}</React.Fragment>;
}

// Decorators allow us to wrap stories in custom components, provide context
// data, or modify the existing story context, if needed, to enable proper
// rendering, or to add any desired visual scaffolding.
export const decorators: DecoratorFunction[] = [
  (
    Story: any, // Original type here isn't inferred as a React render function
    context
  ) => {
    const globals = context.globals as {
      colorMode: TouchColorMode;
      sizeMode: TouchSizeMode;
    };
    return (
      <AppBase
        defaultColorMode={globals.colorMode}
        defaultSizeMode={globals.sizeMode}
      >
        <StoryWrapper context={context}>
          <Story />
        </StoryWrapper>
      </AppBase>
    );
  },
];
