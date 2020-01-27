import React from 'react'
import { render, wait } from '@testing-library/react'

import App from './App'
import { AppStorage } from './AppRoot'
import { MemoryHardware } from './utils/Hardware'
import { MemoryStorage } from './utils/Storage'

import { advanceTimers } from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import withMarkup from '../test/helpers/withMarkup'
import { VxPrintOnly } from './config/types'
import { MemoryCard } from './utils/Card'
import fakeMachineId from '../test/helpers/fakeMachineId'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

const card = new MemoryCard()
const storage = new MemoryStorage<AppStorage>()
const machineId = fakeMachineId()

const insertCardScreenText = 'Insert voter card to load ballot.'
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low'
const noPowerDetectedWarningText = 'No Power Detected.'

describe('Displays setup warning messages and errors scrrens', () => {
  it('Displays warning if Accessible Controller connection is lost', async () => {
    const hardware = new MemoryHardware()
    hardware.setAccesssibleControllerConnected(true)

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )
    const accessibleControllerWarningText =
      'Voting with an accessible controller is not currently available.'

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)
    expect(queryByText(accessibleControllerWarningText)).toBeFalsy()

    // Disconnect Accessible Controller
    hardware.setAccesssibleControllerConnected(false)
    advanceTimers()
    await wait(() => getByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)

    // Reconnect Accessible Controller
    hardware.setAccesssibleControllerConnected(true)
    advanceTimers()
    await wait(() => !queryByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)
  })

  it('Displays error screen if Card Reader connection is lost', async () => {
    const hardware = new MemoryHardware()
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)

    // Disconnect Card Reader
    hardware.setCardReaderConnected(false)
    advanceTimers()
    await wait(() => getByText('Card Reader Not Detected'))

    // Reconnect Card Reader
    hardware.setCardReaderConnected(true)
    advanceTimers()
    await wait(() => getByText(insertCardScreenText))
  })

  it('Displays error screen if Printer connection is lost', async () => {
    const hardware = new MemoryHardware()
    setElectionInStorage(storage)
    setStateInStorage(storage, {
      appMode: VxPrintOnly,
    })
    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

    // Start on VxPrint Insert Card screen
    const vxPrintInsertCardScreenText =
      'Insert Card to print your official ballot.'
    getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    hardware.setPrinterConnected(false)
    advanceTimers()
    await wait(() => getByText('No Printer Detected'))

    // Reconnect Printer
    hardware.setPrinterConnected(true)
    advanceTimers()
    await wait(() => getByText(vxPrintInsertCardScreenText))
  })

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    const hardware = new MemoryHardware()
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )
    const getByTextWithMarkup = withMarkup(getByText)

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)

    // Remove charger and reduce battery level slightly
    hardware.setBatteryDischarging(true)
    hardware.setBatteryLevel(0.6)
    advanceTimers()
    await wait(() => getByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)

    // Battery level drains below GLOBALS.LOW_BATTERY_THRESHOLD
    hardware.setBatteryLevel(0.24)
    advanceTimers()
    await wait(() => getByTextWithMarkup(lowBatteryErrorScreenText))

    // Attach charger and back on Insert Card screen
    hardware.setBatteryDischarging(false)
    advanceTimers()
    await wait(() => !queryByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)
  })

  it('Cause hardware status polling to catch', async () => {
    const hardware = new MemoryHardware()
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

    // Mock failed card reader response
    const readReaderStatusMock = jest
      .spyOn(hardware, 'readCardReaderStatus')
      .mockRejectedValue(new Error('NOPE'))

    // Ensure polling interval time is passed
    advanceTimers()

    // Wait for component to render
    await wait(() => getByText(insertCardScreenText))

    // Expect that hardware status was called once
    expect(readReaderStatusMock).toHaveBeenCalledTimes(1)

    // Ensure hardware status interval time is passed again
    advanceTimers()

    // Expect that hardware status has not been called again
    expect(readReaderStatusMock).toHaveBeenCalledTimes(1)
  })
})
