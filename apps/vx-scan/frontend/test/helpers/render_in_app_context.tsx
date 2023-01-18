import { render, RenderResult } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import React from 'react';
import {
  AppContext,
  AppContextInterface,
} from '../../src/contexts/app_context';
import { machineConfig } from './mock_api_client';

export function renderInAppContext(
  element: JSX.Element,
  context: Partial<AppContextInterface> = {}
): RenderResult {
  return render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        ...context,
      }}
    >
      {element}
    </AppContext.Provider>
  );
}
