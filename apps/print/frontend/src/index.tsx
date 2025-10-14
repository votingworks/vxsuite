import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert } from '@votingworks/basics';
import { App } from './app';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
