import React from 'react';
import { DecoratorFunction, Parameters } from '@storybook/types';

import { AppBase } from '../src';

export const parameters: Parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

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
