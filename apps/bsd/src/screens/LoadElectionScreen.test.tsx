import { render } from '@testing-library/react'
import React from 'react'
import { UsbDriveStatus } from '../lib/usbstick'
import LoadElectionScreen from './LoadElectionScreen'

test('shows a message that there is no election configuration', () => {
  const { getByText } = render(
    <LoadElectionScreen
      setElection={jest.fn()}
      usbDriveStatus={UsbDriveStatus.absent}
    />
  )

  getByText('Not Configured')
})
