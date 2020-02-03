import React from 'react'
import { render, wait } from '@testing-library/react'

import { electionSample } from '@votingworks/ballot-encoder'

import App from './App'
import { AppStorage } from './AppRoot'
import { MemoryHardware } from './utils/Hardware'
import { MemoryStorage } from './utils/Storage'

import {
  adminCard,
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import withMarkup from '../test/helpers/withMarkup'
import { VxPrintOnly } from './config/types'
import { MemoryCard } from './utils/Card'
import fakeMachineId from '../test/helpers/fakeMachineId'
import {
  HARDWARE_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from './config/globals'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

const insertCardScreenText = 'Insert voter card to load ballot.'
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low'
const noPowerDetectedWarningText = 'No Power Detected.'

describe('Displays setup warning messages and errors scrrens', () => {
  it('Displays warning if Accessible Controller connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
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

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)
    expect(queryByText(accessibleControllerWarningText)).toBeFalsy()

    // Disconnect Accessible Controller
    hardware.setAccesssibleControllerConnected(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)

    // Reconnect Accessible Controller
    hardware.setAccesssibleControllerConnected(true)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => !queryByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)
  })

  it('Displays error screen if Card Reader connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
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

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

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
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
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

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxPrint Insert Card screen
    const vxPrintInsertCardScreenText =
      'Insert Card to print your official ballot.'
    getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    hardware.setPrinterConnected(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByText('No Printer Detected'))

    // Reconnect Printer
    hardware.setPrinterConnected(true)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByText(vxPrintInsertCardScreenText))
  })

  it('Admin screen trumps "No Printer Detected" error', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
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

    // no printer
    // Start on VxPrint Insert Card screen
    const vxPrintInsertCardScreenText =
      'Insert Card to print your official ballot.'
    getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    hardware.setPrinterConnected(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByText('No Printer Detected'))

    // Insert admin card
    card.insertCard(adminCard, electionSample)
    await advanceTimersAndPromises()

    // expect to see admin screen
    getByText('/ Election Admin Actions')
  })

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
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

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)

    // Remove charger and reduce battery level slightly
    hardware.setBatteryDischarging(true)
    hardware.setBatteryLevel(0.6)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)

    // Battery level drains below low threshold
    hardware.setBatteryLevel(LOW_BATTERY_THRESHOLD / 2)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => getByTextWithMarkup(lowBatteryErrorScreenText))

    // Attach charger and back on Insert Card screen
    hardware.setBatteryDischarging(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await wait(() => !queryByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)
  })

  it('Cause hardware status polling to catch', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage)
    setStateInStorage(storage)
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

    // Mock failed battery check
    const readBatteryStatusMock = jest
      .spyOn(hardware, 'readBatteryStatus')
      .mockRejectedValue(new Error('NOPE'))

    // Ensure polling interval time is passed
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)

    // Expect that hardware status was called once
    expect(readBatteryStatusMock).toHaveBeenCalledTimes(1)

    // Ensure hardware status interval time is passed again
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)

    // Expect that hardware status has not been called again
    expect(readBatteryStatusMock).toHaveBeenCalledTimes(1)
  })
})
