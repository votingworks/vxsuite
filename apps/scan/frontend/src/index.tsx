import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { App } from './app';
import { PreviewApp } from './preview_app';

ReactDom.render(
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
  </React.StrictMode>,
  document.getElementById('root')
);
