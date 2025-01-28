import * as Sentry from '@sentry/browser';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert } from '@votingworks/basics';
import { App } from './app';

/* istanbul ignore next - @preserve */
if (process.env.NODE_ENV === 'production') {
  /* eslint-disable no-underscore-dangle */
  const envVars = window as unknown as {
    _vxdesign_sentry_dsn: string;
    _vxdesign_deploy_env: string;
  };
  Sentry.init({
    dsn: envVars._vxdesign_sentry_dsn,
    environment: envVars._vxdesign_deploy_env,
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
