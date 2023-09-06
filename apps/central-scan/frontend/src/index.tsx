import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import { App } from './app';
import { focusVisible } from './util/focus_visible';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.Fragment>
    <App />
    <DevDock />
  </React.Fragment>
);

focusVisible();
