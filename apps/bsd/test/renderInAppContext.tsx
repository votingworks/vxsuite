import { render as testRender, RenderResult } from '@testing-library/react';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { ElectionDefinition } from '@votingworks/types';
import { MemoryStorage, Storage, usbstick } from '@votingworks/utils';
import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import AppContext from '../src/contexts/AppContext';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => void;
  storage?: Storage;
  lockMachine?: () => void;
  bypassAuthentication?: boolean;
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = testElectionDefinition,
    machineId = '0000',
    bypassAuthentication = true,
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    storage = new MemoryStorage(),
    lockMachine = jest.fn(),
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig: { machineId, bypassAuthentication },
        usbDriveStatus,
        usbDriveEject,
        storage,
        lockMachine,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
