import 'setimmediate';
import React from 'react';
import ReactDom from 'react-dom';
import { App } from './app';
import { PreviewApp } from './preview_app';

ReactDom.render(
  <React.StrictMode>
    {process.env.NODE_ENV === 'development' &&
    window.location.pathname.startsWith('/preview') ? (
      <PreviewApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
  document.getElementById('root')
);
