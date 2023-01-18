import useInterval from 'use-interval';
import { assert, sleep, usbstick } from '@votingworks/utils';
import { useCallback, useRef, useState } from 'react';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useCancelablePromise } from './use_cancelable_promise';

export const POLLING_INTERVAL_FOR_USB = 100;
export const MIN_TIME_TO_UNMOUNT_USB = 1000;

function isFat32(usbDriveInfo: KioskBrowser.UsbDriveInfo) {
  return usbDriveInfo.fsType === 'vfat' && usbDriveInfo.fsVersion === 'FAT32';
}

const CASE_INSENSITIVE_ALPHANUMERICS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomCaseInsensitiveAlphanumeric(): string {
  return CASE_INSENSITIVE_ALPHANUMERICS[
    Math.floor(Math.random() * CASE_INSENSITIVE_ALPHANUMERICS.length)
  ];
}

const VX_USB_LABEL_REGEXP = /VxUSB-[A-Z0-9]{5,}/i;

function generateVxUsbLabel(usbDriveInfo: KioskBrowser.UsbDriveInfo): string {
  const oldLabel = usbDriveInfo.label;
  if (oldLabel && VX_USB_LABEL_REGEXP.test(oldLabel)) {
    return oldLabel;
  }

  let newLabel = 'VxUSB-';

  for (let i = 0; i < 5; i += 1) {
    newLabel += randomCaseInsensitiveAlphanumeric();
  }

  return newLabel;
}

export interface PostFormatUsbOptions {
  action: 'mount' | 'eject';
}

export type UsbDriveStatus =
  | 'absent'
  | 'bad_format'
  | 'mounting'
  | 'mounted'
  | 'ejecting'
  | 'ejected';

export interface UsbDrive {
  status: UsbDriveStatus;
  eject(currentUser: LoggingUserRole): Promise<void>;
  format(
    currentUser: LoggingUserRole,
    options: PostFormatUsbOptions
  ): Promise<void>;
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

  // The hardware state blips / flickers during formatting, so we need to
  // know when to skip polling. We could add this as a `UsbDriveStatus`, but
  // then we would have to handle in the frontends.
  const [isFormatting, setIsFormatting] = useState(false);

  const eject = useCallback(
    async (currentUser: LoggingUserRole) => {
      await logger.log(LogEventId.UsbDriveEjectInit, currentUser);
      setStatus('ejecting');
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

  const format = useCallback(
    async (currentUser: LoggingUserRole, options: PostFormatUsbOptions) => {
      setIsFormatting(true);
      try {
        await logger.log(LogEventId.UsbDriveFormatInit, currentUser);
        const usbDriveInfo = await usbstick.getInfo();
        assert(usbDriveInfo);
        const name = generateVxUsbLabel(usbDriveInfo);
        await makeCancelable(
          usbstick.doFormat({
            format: 'fat32',
            name,
          })
        );
        await logger.log(LogEventId.UsbDriveFormatted, 'system', {
          disposition: 'success',
          message: `USB drive successfully formatted with a single FAT32 volume named "${name}".`,
        });

        if (options.action === 'mount') {
          await mount();
        } else {
          setStatus('ejected');
        }
      } catch (error) {
        await logger.log(LogEventId.UsbDriveFormatted, 'system', {
          disposition: 'failure',
          message: `Failed to format USB drive.`,
          error: (error as Error).message,
          result: 'USB drive not formatted.',
        });
        // throw the error so handling can take place in the app
        throw error;
      } finally {
        setIsFormatting(false);
      }
    },
    [logger, makeCancelable, mount]
  );

  useInterval(
    async () => {
      if (isFormatting || status === 'mounting' || status === 'ejecting') {
        return;
      }

      const usbDriveInfo = await usbstick.getInfo();
      const previousAvailability = availability.current;
      availability.current = usbstick.getAvailability(usbDriveInfo);

      // No action needed if hardware state is the same
      if (availability.current === previousAvailability) {
        return;
      }

      // USB drive was detected
      if (
        availability.current !== 'absent' &&
        previousAvailability === 'absent'
      ) {
        assert(usbDriveInfo);
        const isCorrectFormat = isFat32(usbDriveInfo);
        await logger.log(LogEventId.UsbDriveDetected, 'system', {
          message: `${
            availability.current === 'mounted' ? 'Mounted' : 'Unmounted'
          } USB drive detected with ${
            isCorrectFormat ? 'compatible' : 'incompatible'
          } file system.`,
          fsType: usbDriveInfo.fsType,
          fsVersion: usbDriveInfo.fsVersion,
        });

        if (availability.current === 'present') {
          if (isFat32(usbDriveInfo)) {
            await mount();
          } else {
            setStatus('bad_format');
          }
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
    format,
  };
}
