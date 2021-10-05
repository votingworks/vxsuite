import React from 'react'
import { render, screen } from '@testing-library/react'
import ScannerCrashedScreen from './ScannerCrashedScreen'

test('render crash screen as expected', async () => {
  render(<ScannerCrashedScreen />)
  await screen.findByText('Scanner Reboot Required')
  await screen.findByText('Ballot will be scanned and counted after reboot.')
  await screen.findByText('Ask a poll worker for assistance.')
})
