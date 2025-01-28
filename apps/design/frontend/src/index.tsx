import * as Sentry from '@sentry/browser';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert } from '@votingworks/basics';
import { App } from './app';

/* istanbul ignore next - @preserve */
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    // Note: This isn't a secret
    dsn: 'https://941de51b2e7e464aaed34ef659f0036a@o471921.ingest.us.sentry.io/4508717994016768',
    environment: process.env.DEPLOY_ENV,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  });
}

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
