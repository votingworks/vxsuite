import 'setimmediate';
import React from 'react';
import ReactDom from 'react-dom';
import { App } from './app';
import { PreviewApp } from './preview_app';
import * as serviceWorker from './serviceWorker';

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

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
