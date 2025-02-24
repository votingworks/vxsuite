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

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.Fragment>
    {isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ELECTRICAL_TESTING_MODE
    ) ? (
      <ElectricalTestingApp />
    ) : (
      <React.Fragment>
        <App enableStringTranslation />
        <DevDock />
      </React.Fragment>
    )}
  </React.Fragment>
);
