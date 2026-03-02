import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppBase } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { App } from './app';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <App />
    </AppBase>
  </React.StrictMode>
);
