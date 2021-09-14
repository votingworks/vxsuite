import { act, screen, render } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import { fakeKiosk, mockOf } from '@votingworks/test-utils'
import { NullPrinter, usbstick } from '@votingworks/utils'
import MockDate from 'mockdate'
import React from 'react'
import AppContext from '../contexts/AppContext'
import PollWorkerScreen from './PollWorkerScreen'

MockDate.set('2020-10-31T00:00:00.000Z')

beforeEach(() => {
  window.location.href = '/'
})

afterEach(() => {
  window.kiosk = undefined
})

test('shows system authentication code', async () => {
  const mockKiosk = fakeKiosk()
  mockOf(mockKiosk.totp.get).mockResolvedValue({
    isoDatetime: '2020-10-31T01:01:01.001Z',
    code: '123456',
  })
  window.kiosk = mockKiosk

  await act(async () => {
    render(
      <AppContext.Provider
        value={{
          electionDefinition: electionSampleDefinition,
          machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={0}
          isPollsOpen={false}
          togglePollsOpen={jest.fn()}
          getCVRsFromExport={jest.fn().mockResolvedValue([])}
          saveTallyToCard={jest.fn()}
          isLiveMode
          hasPrinterAttached={false}
          printer={new NullPrinter()}
          usbDrive={{
            status: usbstick.UsbDriveStatus.absent,
            eject: jest.fn(),
          }}
        />
      </AppContext.Provider>
    )
  })

  screen.getByText('System Authentication Code: 123·456')
})

test('shows dashes when no totp', async () => {
  const mockKiosk = fakeKiosk()
  mockOf(mockKiosk.totp.get).mockResolvedValue(undefined)
  window.kiosk = mockKiosk

  await act(async () => {
    render(
      <AppContext.Provider
        value={{
          electionDefinition: electionSampleDefinition,
          machineConfig: { machineId: '0000', codeVersion: 'TEST' },
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={0}
          isPollsOpen={false}
          togglePollsOpen={jest.fn()}
          getCVRsFromExport={jest.fn().mockResolvedValue([])}
          saveTallyToCard={jest.fn()}
          isLiveMode
          hasPrinterAttached={false}
          printer={new NullPrinter()}
          usbDrive={{
            status: usbstick.UsbDriveStatus.absent,
            eject: jest.fn(),
          }}
        />
      </AppContext.Provider>
    )
  })

  screen.getByText('System Authentication Code: ---·---')
})
