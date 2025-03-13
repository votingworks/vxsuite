import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert } from '@votingworks/basics';
import App from './App';
import { AppBase } from '@votingworks/ui';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      enableOverflow={true}
    >
      <App />
    </AppBase>
  </React.StrictMode>
);
