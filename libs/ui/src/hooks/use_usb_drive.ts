import useInterval from 'use-interval';
import { usbstick } from '@votingworks/utils';
import { useCallback, useState } from 'react';
import makeDebug from 'debug';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useCancelablePromise } from './use_cancelable_promise';

const debug = makeDebug('ui:useUsbDrive');
const { UsbDriveStatus } = usbstick;

export interface UsbDrive {
  status?: usbstick.UsbDriveStatus;
  eject(currentUser: string): Promise<void>;
}

export interface UsbDriveProps {
  logger: Logger;
}

export const POLLING_INTERVAL_FOR_USB = 100;

/**
 * React hook to get a representation of the current USB drive.
 *
 * @example
 *
 * const usbDrive = useUsbDrive({ logger })
 * return (
 *   <USBControllerButton
 *     usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
 *     usbDriveEject={usbDrive.eject}
 *   />
 * )
 */
export function useUsbDrive({ logger }: UsbDriveProps): UsbDrive {
  const [isMountingOrUnmounting, setIsMountingOrUnmounting] = useState(false);
  const [status, setStatus] = useState<usbstick.UsbDriveStatus>();
  const [recentlyEjected, setRecentlyEjected] = useState(false);
  const makeCancelable = useCancelablePromise();

  const eject = useCallback(
    async (currentUser: LoggingUserRole) => {
      debug('eject requested, updating state');
      setIsMountingOrUnmounting(true);
      setStatus(UsbDriveStatus.ejecting);
      await logger.log(LogEventId.UsbDriveEjectInit, currentUser);
      try {
        await makeCancelable(usbstick.doUnmount());
        setRecentlyEjected(true);
        await logger.log(LogEventId.UsbDriveEjected, currentUser, {
          disposition: 'success',
          message: 'USB Drive successfully ejected.',
        });
      } catch (error) {
        await logger.log(LogEventId.UsbDriveEjected, currentUser, {
          disposition: 'failure',
          message: 'USB Drive failed when attempting to eject.',
          error: error.message,
          result: 'USB drive not ejected.',
        });
      } finally {
        await setIsMountingOrUnmounting(false);
      }
    },
    [makeCancelable, logger]
  );

  useInterval(
    async () => {
      if (isMountingOrUnmounting) {
        return;
      }

      const newStatus = await makeCancelable(usbstick.getStatus());
      if (status === newStatus) {
        return;
      }

      debug('USB drive status changed from %s to %s', status, newStatus);
      setStatus(newStatus);
      await logger.log(LogEventId.UsbDriveStatusUpdate, 'system', {
        disposition: 'na',
        message: `USB Drive status updated from ${status} to ${newStatus}`,
        previousStatus: status,
        newStatus,
      });
      if (
        status === UsbDriveStatus.present &&
        newStatus === UsbDriveStatus.absent
      ) {
        debug('USB drive removed');
        setRecentlyEjected(false);
      } else if (
        (status === UsbDriveStatus.absent || status === undefined) &&
        newStatus === UsbDriveStatus.present
      ) {
        try {
          debug('USB drive found, mounting');
          await logger.log(LogEventId.UsbDriveMountInit, 'system');
          setIsMountingOrUnmounting(true);
          await makeCancelable(usbstick.doMount());
          await logger.log(LogEventId.UsbDriveMounted, 'system', {
            disposition: 'success',
            message: 'USB Drive successfully mounted',
          });
        } catch (error) {
          await logger.log(LogEventId.UsbDriveMounted, 'system', {
            disposition: 'failure',
            message: 'USB Drive failed mounting.',
            error: error.message,
            result: 'USB drive not mounted.',
          });
        } finally {
          setIsMountingOrUnmounting(false);
        }
      } else if (
        status === UsbDriveStatus.present &&
        newStatus === UsbDriveStatus.mounted
      ) {
        debug('mount finished');
      } else if (
        status === UsbDriveStatus.ejecting &&
        newStatus === UsbDriveStatus.present
      ) {
        debug('eject finished');
      }
    },
    /* istanbul ignore next */
    status === UsbDriveStatus.notavailable ? false : POLLING_INTERVAL_FOR_USB,
    true
  );

  return {
    status:
      recentlyEjected && status !== UsbDriveStatus.ejecting
        ? UsbDriveStatus.recentlyEjected
        : status,
    eject,
  };
}
