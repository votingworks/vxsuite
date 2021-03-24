import React from 'react'
import { render, waitFor } from '@testing-library/react'

import { electionSampleDefinition } from './data'

import App from './App'
import { MemoryHardware } from './utils/Hardware'
import { MemoryStorage } from './utils/Storage'

import {
  adminCardForElection,
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards'

import {
  electionDefinition,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import withMarkup from '../test/helpers/withMarkup'
import { MemoryCard } from './utils/Card'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import {
  HARDWARE_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from './config/globals'
import { VxPrintOnly } from './config/types'

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
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = MemoryHardware.standard
    hardware.setAccesssibleControllerConnected(true)

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
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
    await waitFor(() => getByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)

    // Reconnect Accessible Controller
    hardware.setAccesssibleControllerConnected(true)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => !queryByText(accessibleControllerWarningText))
    getByText(insertCardScreenText)
  })

  it('Displays error screen if Card Reader connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxMark Insert Card screen
    getByText(insertCardScreenText)

    // Disconnect Card Reader
    hardware.setCardReaderConnected(false)
    advanceTimers()
    await waitFor(() => getByText('Card Reader Not Detected'))

    // Reconnect Card Reader
    hardware.setCardReaderConnected(true)
    advanceTimers()
    await waitFor(() => getByText(insertCardScreenText))
  })

  it('Displays error screen if Printer connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
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
    await waitFor(() => getByText('No Printer Detected'))

    // Reconnect Printer
    hardware.setPrinterConnected(true)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => getByText(vxPrintInsertCardScreenText))
  })

  it('Displays error screen if Power connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxPrint Insert Card screen
    const vxPrintInsertCardScreenText =
      'Insert Card to print your official ballot.'
    getByText(vxPrintInsertCardScreenText)

    // Disconnect Power
    hardware.setBatteryDischarging(true)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => getByText(noPowerDetectedWarningText))

    // Reconnect Power
    hardware.setBatteryDischarging(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => !queryByText(noPowerDetectedWarningText))
    getByText(vxPrintInsertCardScreenText)
  })

  it('Admin screen trumps "No Printer Detected" error', async () => {
    const card = new MemoryCard()
    const adminCard = adminCardForElection(electionDefinition.electionHash)
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({
      appMode: VxPrintOnly,
    })
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage, electionDefinition)
    setStateInStorage(storage)
    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )

    await advanceTimersAndPromises()

    // no printer
    // Start on VxPrint Insert Card screen
    const vxPrintInsertCardScreenText =
      'Insert Card to print your official ballot.'
    getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    hardware.setPrinterConnected(false)
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    getByText('No Printer Detected')

    // Insert admin card
    card.insertCard(adminCard, electionSampleDefinition.electionData)
    await advanceTimersAndPromises()

    // expect to see admin screen
    getByText('/ Election Admin Actions')
  })

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = MemoryHardware.standard
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
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
    await waitFor(() => getByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)

    // Battery level drains below low threshold
    hardware.setBatteryLevel(LOW_BATTERY_THRESHOLD / 2)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => getByTextWithMarkup(lowBatteryErrorScreenText))

    // Attach charger and back on Insert Card screen
    hardware.setBatteryDischarging(false)
    advanceTimers(HARDWARE_POLLING_INTERVAL / 1000)
    await waitFor(() => !queryByText(noPowerDetectedWarningText))
    getByText(insertCardScreenText)
  })
})
