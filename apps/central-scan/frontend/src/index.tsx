import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { App } from './app';
import { focusVisible } from './util/focus_visible';

ReactDom.render(
  <React.Fragment>
    <App />
    <DevDock />
  </React.Fragment>,
  document.getElementById('root')
);

focusVisible();
