import { render } from '@testing-library/react'
import { UsbDriveStatus } from '../lib/usbstick'
import LoadElectionScreen from './LoadElectionScreen'

test('shows a message that there is no election configuration', () => {
  const { getByText } = render(
    <LoadElectionScreen
      setElectionDefinition={jest.fn()}
      usbDriveStatus={UsbDriveStatus.absent}
    />
  )

  getByText('Load Election Configuration')
})
