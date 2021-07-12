import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import { electionSampleDefinition } from './data'

import App from './App'

import {
  adminCardForElection,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards'

import {
  electionDefinition,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import withMarkup from '../test/helpers/withMarkup'
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

describe('Displays setup warning messages and errors screens', () => {
  it('Displays warning if Accessible Controller connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = await MemoryHardware.buildStandard()
    await hardware.setAccessibleControllerConnected(true)

    await setElectionInStorage(storage)
    await setStateInStorage(storage)

    render(
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
    screen.getByText(insertCardScreenText)
    expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy()

    // Disconnect Accessible Controller
    await act(async () => {
      await hardware.setAccessibleControllerConnected(false)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText(accessibleControllerWarningText)
    screen.getByText(insertCardScreenText)

    // Reconnect Accessible Controller
    await act(async () => {
      await hardware.setAccessibleControllerConnected(true)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy()
    screen.getByText(insertCardScreenText)
  })

  it('Displays error screen if Card Reader connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = await MemoryHardware.buildStandard()
    await setElectionInStorage(storage)
    await setStateInStorage(storage)

    render(
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
    screen.getByText(insertCardScreenText)

    // Disconnect Card Reader
    await act(async () => {
      await hardware.setCardReaderConnected(false)
    })
    await advanceTimersAndPromises()
    screen.getByText('Card Reader Not Detected')

    // Reconnect Card Reader
    await act(async () => {
      await hardware.setCardReaderConnected(true)
    })
    await advanceTimersAndPromises()
    screen.getByText(insertCardScreenText)
  })

  it('Displays error screen if Printer connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
    const hardware = await MemoryHardware.buildStandard()
    await setElectionInStorage(storage)
    await setStateInStorage(storage)
    render(
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
    screen.getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    await act(async () => {
      await hardware.setPrinterConnected(false)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText('No Printer Detected')

    // Reconnect Printer
    await act(async () => {
      await hardware.setPrinterConnected(true)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText(vxPrintInsertCardScreenText)
  })

  it('Displays error screen if Power connection is lost', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({ appMode: VxPrintOnly })
    const hardware = await MemoryHardware.buildStandard()
    await setElectionInStorage(storage)
    await setStateInStorage(storage)
    render(
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
    screen.getByText(vxPrintInsertCardScreenText)

    // Disconnect Power
    await act(async () => {
      await hardware.setBatteryDischarging(true)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText(noPowerDetectedWarningText)

    // Reconnect Power
    await act(async () => {
      await hardware.setBatteryDischarging(false)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy()
    screen.getByText(vxPrintInsertCardScreenText)
  })

  it('Admin screen trumps "No Printer Detected" error', async () => {
    const card = new MemoryCard()
    const adminCard = adminCardForElection(electionDefinition.electionHash)
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider({
      appMode: VxPrintOnly,
    })
    const hardware = await MemoryHardware.buildStandard()
    await setElectionInStorage(storage, electionDefinition)
    await setStateInStorage(storage)
    render(
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
    screen.getByText(vxPrintInsertCardScreenText)

    // Disconnect Printer
    await act(async () => {
      await hardware.setPrinterConnected(false)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText('No Printer Detected')

    // Insert admin card
    card.insertCard(adminCard, electionSampleDefinition.electionData)
    await advanceTimersAndPromises()

    // expect to see admin screen
    screen.getByText('Election Admin Actions')
  })

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()
    const hardware = await MemoryHardware.buildStandard()
    await setElectionInStorage(storage)
    await setStateInStorage(storage)
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )
    const getByTextWithMarkup = withMarkup(screen.getByText)

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    // Start on VxMark Insert Card screen
    screen.getByText(insertCardScreenText)

    // Remove charger and reduce battery level slightly
    await act(async () => {
      await hardware.setBatteryDischarging(true)
      await hardware.setBatteryLevel(0.6)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    screen.getByText(noPowerDetectedWarningText)
    screen.getByText(insertCardScreenText)

    // Battery level drains below low threshold
    await act(async () => {
      await hardware.setBatteryLevel(LOW_BATTERY_THRESHOLD / 2)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    getByTextWithMarkup(lowBatteryErrorScreenText)

    // Attach charger and back on Insert Card screen
    await act(async () => {
      await hardware.setBatteryDischarging(false)
    })
    await advanceTimersAndPromises(HARDWARE_POLLING_INTERVAL / 1000)
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy()
    screen.getByText(insertCardScreenText)
  })
})
