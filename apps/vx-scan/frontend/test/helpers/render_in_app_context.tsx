import { render, RenderResult } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { Logger, LogSource } from '@votingworks/logging';
import { Inserted } from '@votingworks/test-utils';
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
        auth: Inserted.fakeLoggedOutAuth(),
        logger: new Logger(LogSource.VxScanFrontend),
        ...context,
      }}
    >
      {element}
    </AppContext.Provider>
  );
}
