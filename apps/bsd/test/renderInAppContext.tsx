import { createMemoryHistory, MemoryHistory } from 'history'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import React from 'react'

import { electionSampleDefinition } from '@votingworks/fixtures'
import { Router } from 'react-router-dom'
import { UsbDriveStatus } from '../src/lib/usbstick'
import AppContext from '../src/contexts/AppContext'
import { ElectionDefinition } from '../src/util/ballot-package'

interface RenderInAppContextParams {
  route?: string | undefined
  history?: MemoryHistory<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  electionDefinition?: ElectionDefinition
  machineId?: string
  usbDriveStatus?: UsbDriveStatus
  usbDriveEject?: () => void
}

// TODO: Replace this with something straight from `@votingworks/fixtures` when
// all ElectionDefinition interface definitions are shared.
const testElectionDefinition: ElectionDefinition = {
  ...electionSampleDefinition,
  electionData: JSON.stringify(electionSampleDefinition.election),
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = testElectionDefinition,
    machineId = '0000',
    usbDriveStatus = UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
  } = {} as RenderInAppContextParams
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig: { machineId },
        usbDriveStatus,
        usbDriveEject,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
