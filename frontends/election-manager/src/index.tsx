import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { App } from './app';

ReactDom.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
