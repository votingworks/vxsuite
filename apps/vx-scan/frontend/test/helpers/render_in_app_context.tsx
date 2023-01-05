import { render, RenderResult } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { Logger, LogSource } from '@votingworks/logging';
import { Inserted } from '@votingworks/test-utils';
import React from 'react';
import { MachineConfig } from '../../src/config/types';
import {
  AppContext,
  AppContextInterface,
} from '../../src/contexts/app_context';

export const machineConfig: MachineConfig = {
  machineId: '0003',
  codeVersion: 'TEST',
};

export function renderInAppContext(
  element: JSX.Element,
  context: Partial<AppContextInterface> = {}
): RenderResult {
  return render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig,
        isSoundMuted: false,
        auth: Inserted.fakeLoggedOutAuth(),
        logger: new Logger(LogSource.VxScanFrontend),
        ...context,
      }}
    >
      {element}
    </AppContext.Provider>
  );
}
