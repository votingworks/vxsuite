import { act, render, waitForElementToBeRemoved } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import { fakeKiosk } from '@votingworks/test-utils'
import { NullPrinter } from '@votingworks/utils'
import MockDate from 'mockdate'
import React from 'react'
import AppContext from '../contexts/AppContext'
import PollWorkerScreen from './PollWorkerScreen'

MockDate.set('2020-10-31T00:00:00.000Z')

beforeEach(() => {
  window.location.href = '/'
  window.kiosk = fakeKiosk()
})

afterEach(() => {
  window.kiosk = undefined
})

test('shows security code', async () => {
  const mockTotpGet = jest.fn()
  mockTotpGet.mockResolvedValue({
    timestamp: '2020-10-31T01:01:01.001Z',
    code: '123456',
  })

  window.kiosk!.totp = {
    get: mockTotpGet,
  }

  await act(async () => {
    const { getByText } = render(
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
        />
      </AppContext.Provider>
    )

    await waitForElementToBeRemoved(() => getByText('Security Code: ------'))
    getByText('Security Code: 123456')
  })
})
