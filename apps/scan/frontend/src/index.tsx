import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { App } from './app';
import { ElectricalTestingApp } from './electrical_testing';
import { PreviewApp } from './preview_app';

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    {isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ELECTRICAL_TESTING_MODE
    ) ? (
      <ElectricalTestingApp />
    ) : process.env.NODE_ENV === 'development' &&
      window.location.pathname.startsWith('/preview') ? (
      <PreviewApp />
    ) : (
      <React.Fragment>
        <App enableStringTranslation />
        <DevDock />
      </React.Fragment>
    )}
  </React.StrictMode>
);
