import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { App } from './app';
import * as serviceWorker from './serviceWorker';
import { DemoApp } from './demo_app';

const isDemoApp =
  window.location.hash === '#demo' ||
  window.location.hostname.endsWith('votingworks.app');

ReactDom.render(
  <React.StrictMode>{isDemoApp ? <DemoApp /> : <App />}</React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
