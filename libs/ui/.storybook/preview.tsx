import React from 'react';
import { DecoratorFunction, Parameters } from '@storybook/types';

import { AppBase } from '../src';

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

// Decorators allow us to wrap stories in custom components, provide context
// data, or modify the existing story context, if needed, to enable proper
// rendering, or to add any desired visual scaffolding.
export const decorators: DecoratorFunction[] = [
  (
    Story: any, // Original type here isn't inferred as a React render function
  ) => {
    return (
      <AppBase>
        <Story />
      </AppBase>
    );
  },
];
