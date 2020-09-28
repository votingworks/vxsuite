import { render, act, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import fakeKiosk from '../../test/helpers/fakeKiosk'
import PrintButton from './PrintButton'

beforeAll(() => {
  window.kiosk = fakeKiosk()
})

afterAll(() => {
  delete window.kiosk
})

test('if only disconnected printers, show error modal', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'banana',
      isDefault: true,
      name: 'banana',
      status: 1,
      connected: false,
    },
    {
      description: 'VxPrinter',
      isDefault: false,
      name: 'VxPrinter',
      status: 0,
      connected: false,
    },
  ])

  const afterPrint = jest.fn()
  const { getByText } = render(
    <PrintButton afterPrint={afterPrint}>Print Now</PrintButton>
  )

  await act(async () => {
    fireEvent.click(getByText('Print Now'))

    await waitFor(() =>
      getByText('The printer is not connected', { exact: false })
    )
  })

  expect(mockKiosk.getPrinterInfo).toBeCalled()

  expect(mockKiosk.print).not.toBeCalled()
  expect(afterPrint).not.toBeCalled()
})

test('if connected printers, show printing modal', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'banana',
      isDefault: true,
      name: 'banana',
      status: 1,
      connected: false,
    },
    {
      description: 'VxPrinter',
      isDefault: false,
      name: 'VxPrinter',
      status: 0,
      connected: true,
    },
  ])

  const afterPrint = jest.fn()
  const { getByText } = render(
    <PrintButton afterPrint={afterPrint}>Print Now</PrintButton>
  )

  await act(async () => {
    fireEvent.click(getByText('Print Now'))

    await waitFor(() => getByText('Printing', { exact: false }))
  })

  expect(mockKiosk.getPrinterInfo).toBeCalled()

  expect(mockKiosk.print).toBeCalled()
  expect(afterPrint).toBeCalled()
})
