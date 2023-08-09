import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import { App } from './app';
import { PreviewApp } from './preview_app';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    {process.env.NODE_ENV === 'development' &&
    window.location.pathname.startsWith('/preview') ? (
      <PreviewApp />
    ) : (
      <React.Fragment>
        <App />
        <DevDock />
      </React.Fragment>
    )}
  </React.StrictMode>
);
