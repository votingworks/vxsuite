import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { App } from './app';
import { DemoApp } from './demo_app';

const isDemoApp =
  window.location.hash === '#demo' ||
  window.location.hostname.endsWith('votingworks.app');

ReactDom.render(
  <React.StrictMode>{isDemoApp ? <DemoApp /> : <App />}</React.StrictMode>,
  document.getElementById('root')
);
