import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { fakeKiosk, fakeDevice } from '@votingworks/test-utils'
import ScanButton, { FUJITSU_VENDOR_ID } from './ScanButton'

beforeEach(() => {
  delete window.kiosk
})

test('is enabled by default outside kiosk browser', async () => {
  render(<ScanButton onPress={jest.fn()} />)
  const button = (await screen.findByText(
    'Scan New Batch'
  )) as HTMLButtonElement
  expect(button.disabled).toBeFalsy()
})

test('is disabled by default inside kiosk browser', async () => {
  window.kiosk = fakeKiosk()
  render(<ScanButton onPress={jest.fn()} />)
  const button = (await screen.findByText('No Scanner')) as HTMLButtonElement
  expect(button.disabled).toBeTruthy()
})

test('calls onPress when clicked', async () => {
  const onPress = jest.fn()
  render(<ScanButton onPress={onPress} />)
  ;(await screen.findByText('Scan New Batch')).click()
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('reacts to hardware changes in kiosk browser', async () => {
  const kiosk = fakeKiosk()
  window.kiosk = kiosk

  render(<ScanButton onPress={jest.fn()} />)

  act(() => {
    // "plug in" a Fujitsu device
    kiosk.devices.next(new Set([fakeDevice({ vendorId: FUJITSU_VENDOR_ID })]))
  })

  await screen.findByText('Scan New Batch')

  act(() => {
    // "unplug" all devices
    kiosk.devices.next(new Set())
  })

  await screen.findByText('No Scanner')
})
