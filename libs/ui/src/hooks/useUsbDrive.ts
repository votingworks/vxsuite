import useInterval from 'use-interval'
import { usbstick } from '@votingworks/utils'
import { useCallback, useState } from 'react'
import makeDebug from 'debug'
import { useCancelablePromise } from './useCancelablePromise'

const debug = makeDebug('ui:useUsbDrive')
const { UsbDriveStatus } = usbstick

export interface UsbDrive {
  status?: usbstick.UsbDriveStatus
  eject(): Promise<void>
}

export const POLLING_INTERVAL_FOR_USB = 100

/**
 * React hook to get a representation of the current USB drive.
 *
 * @example
 *
 * const usbDrive = useUsbDrive()
 * return (
 *   <USBControllerButton
 *     usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
 *     usbDriveEject={usbDrive.eject}
 *   />
 * )
 */
export const useUsbDrive = (): UsbDrive => {
  const [isMountingOrUnmounting, setIsMountingOrUnmounting] = useState(false)
  const [status, setStatus] = useState<usbstick.UsbDriveStatus>()
  const [recentlyEjected, setRecentlyEjected] = useState(false)
  const makeCancelable = useCancelablePromise()

  const eject = useCallback(async () => {
    debug('eject requested, updating state')
    setIsMountingOrUnmounting(true)
    setStatus(UsbDriveStatus.ejecting)
    try {
      await makeCancelable(usbstick.doUnmount())
      setRecentlyEjected(true)
    } finally {
      setIsMountingOrUnmounting(false)
    }
  }, [makeCancelable])

  useInterval(
    async () => {
      if (isMountingOrUnmounting) {
        return
      }

      const newStatus = await makeCancelable(usbstick.getStatus())
      if (status === newStatus) {
        return
      }

      debug('USB drive status changed from %s to %s', status, newStatus)
      setStatus(newStatus)
      if (
        status === UsbDriveStatus.present &&
        newStatus === UsbDriveStatus.absent
      ) {
        debug('USB drive removed')
        setRecentlyEjected(false)
      } else if (
        (status === UsbDriveStatus.absent || status === undefined) &&
        newStatus === UsbDriveStatus.present
      ) {
        try {
          debug('USB drive found, mounting')
          setIsMountingOrUnmounting(true)
          await makeCancelable(usbstick.doMount())
        } finally {
          setIsMountingOrUnmounting(false)
        }
      } else if (
        status === UsbDriveStatus.present &&
        newStatus === UsbDriveStatus.mounted
      ) {
        debug('mount finished')
      } else if (
        status === UsbDriveStatus.ejecting &&
        newStatus === UsbDriveStatus.present
      ) {
        debug('eject finished')
      }
    },
    /* istanbul ignore next */
    status === UsbDriveStatus.notavailable ? false : POLLING_INTERVAL_FOR_USB,
    true
  )

  return {
    status:
      recentlyEjected && status !== UsbDriveStatus.ejecting
        ? UsbDriveStatus.recentlyEjected
        : status,
    eject,
  }
}
