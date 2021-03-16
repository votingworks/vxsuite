import React, { useEffect, useState } from 'react'
import Button from './Button'

export interface Props {
  onPress(): void
  disabled?: boolean
}

export const FUJITSU_VENDOR_ID = 0x4c5

const ScanButton: React.FC<Props> = ({ onPress, disabled }) => {
  const [isScannerConnected, setIsScannerConnected] = useState(!window.kiosk)

  useEffect(() => {
    const subscription = window.kiosk?.devices.subscribe((devices) => {
      setIsScannerConnected(
        [...devices].some((device) => device.vendorId === FUJITSU_VENDOR_ID)
      )
    })
    return () => subscription?.unsubscribe()
  })

  return (
    <Button
      small
      disabled={disabled || !isScannerConnected}
      primary
      onPress={onPress}
    >
      {isScannerConnected ? 'Scan New Batch' : 'No Scanner'}
    </Button>
  )
}

export default ScanButton
