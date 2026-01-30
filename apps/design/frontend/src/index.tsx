import * as Sentry from '@sentry/browser';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { assert, isArray, isPlainObject, isString } from '@votingworks/basics';
import { App } from './app';
import { tiptapErrorContextBox } from './rich_text_editor';

function isTiptapError(event: Sentry.ErrorEvent): boolean {
  const extraArgs = event.extra?.['arguments'];
  if (!isArray(extraArgs)) return false;
  if (!isPlainObject(extraArgs[0])) return false;
  // eslint-disable-next-line prefer-destructuring
  const currentTarget = extraArgs[0]['currentTarget'];
  if (!isString(currentTarget)) return false;
  return currentTarget.includes('tiptap');
}

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
    beforeSend(event) {
      if (event.extra && isTiptapError(event)) {
        // eslint-disable-next-line no-param-reassign
        event.extra['lastPasteClipboardContent'] =
          tiptapErrorContextBox.lastPasteClipboardContent;
      }
      return event;
    },
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
