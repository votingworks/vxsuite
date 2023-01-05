import useInterval from 'use-interval';
import { sleep, usbstick } from '@votingworks/utils';
import { useCallback, useRef, useState } from 'react';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useCancelablePromise } from './use_cancelable_promise';

export const POLLING_INTERVAL_FOR_USB = 100;
export const MIN_TIME_TO_UNMOUNT_USB = 1000;

export type UsbDriveStatus =
  | 'absent'
  | 'mounting'
  | 'mounted'
  | 'ejecting'
  | 'ejected';

export interface UsbDrive {
  status: UsbDriveStatus;
  eject(currentUser: string): Promise<void>;
}

export interface UsbDriveProps {
  logger: Logger;
}

/**
 * React hook to get a representation of the current USB drive.
 *
 * @example
 *
 * const usbDrive = useUsbDrive({ logger })
 * return (
 *   <USBControllerButton
 *     usbDriveStatus={usbDrive.status}
 *     usbDriveEject={usbDrive.eject}
 *   />
 * )
 */
export function useUsbDrive({ logger }: UsbDriveProps): UsbDrive {
  const makeCancelable = useCancelablePromise();

  // Hardware state
  const availability = useRef<usbstick.UsbDriveAvailability>('absent');

  // Application state
  const [status, setStatus] = useState<UsbDriveStatus>('absent');

  const eject = useCallback(
    async (currentUser: LoggingUserRole) => {
      setStatus('ejecting');
      await logger.log(LogEventId.UsbDriveEjectInit, currentUser);
      try {
        // Wait for minimum delay in parallel to eject, so UX is not too fast
        await makeCancelable(
          Promise.all([usbstick.doEject(), sleep(MIN_TIME_TO_UNMOUNT_USB)])
        );
        setStatus('ejected');
        await logger.log(LogEventId.UsbDriveEjected, currentUser, {
          disposition: 'success',
          message: 'USB drive successfully ejected.',
        });
      } catch (error) {
        setStatus('mounted');
        await logger.log(LogEventId.UsbDriveEjected, currentUser, {
          disposition: 'failure',
          message: 'USB drive failed to eject.',
          error: (error as Error).message,
          result: 'USB drive not ejected.',
        });
      }
    },
    [makeCancelable, logger]
  );

  const mount = useCallback(async () => {
    try {
      await logger.log(LogEventId.UsbDriveMountInit, 'system');
      setStatus('mounting');
      await makeCancelable(usbstick.doMount());
      setStatus('mounted');
      await logger.log(LogEventId.UsbDriveMounted, 'system', {
        disposition: 'success',
        message: 'USB drive successfully mounted',
      });
    } catch (error) {
      await logger.log(LogEventId.UsbDriveMounted, 'system', {
        disposition: 'failure',
        message: 'USB drive failed to mount.',
        error: (error as Error).message,
        result: 'USB drive not mounted.',
      });
    }
  }, [logger, makeCancelable]);

  useInterval(
    async () => {
      // Stop polling during operations - the operation is responsible for state
      if (status === 'ejecting' || status === 'mounting') {
        return;
      }

      const newInfo = await usbstick.getInfo();
      const previousAvailability = availability.current;
      availability.current = usbstick.getAvailability(newInfo);

      // No action needed if hardware state is the same
      if (availability.current === previousAvailability) {
        return;
      }

      // USB drive was detected
      if (
        availability.current !== 'absent' &&
        previousAvailability === 'absent'
      ) {
        await logger.log(LogEventId.UsbDriveDetected, 'system', {
          message: `${
            availability.current === 'mounted' ? 'Mounted' : 'Unmounted'
          } USB drive detected.`,
        });
        if (availability.current === 'present') {
          await mount();
        } else {
          setStatus('mounted');
        }
      }

      // USB drive was removed
      if (
        availability.current === 'absent' &&
        previousAvailability !== 'absent'
      ) {
        await logger.log(LogEventId.UsbDriveRemoved, 'system', {
          message: 'USB drive removed by user.',
          previousStatus: status,
        });
        setStatus('absent');
      }
    },
    window.kiosk ? POLLING_INTERVAL_FOR_USB : false,
    true
  );

  return {
    status,
    eject,
  };
}
