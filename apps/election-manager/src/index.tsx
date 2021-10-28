import React from 'react';
import ReactDOM from 'react-dom';
import './i18n';
import App from './App';
import * as serviceWorker from './serviceWorker';
import DemoApp from './DemoApp';

const isDemoApp =
  window.location.hash === '#demo' ||
  window.location.hostname.endsWith('votingworks.app');

ReactDOM.render(
  <React.StrictMode>{isDemoApp ? <DemoApp /> : <App />}</React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
