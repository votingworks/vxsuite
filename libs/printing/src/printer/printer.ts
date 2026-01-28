import { isDeviceAttached, type Device } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { rootDebug } from '../utils/debug';
import { getConnectedDeviceUris } from './device_uri';
import { configurePrinter } from './configure';
import { Printer } from './types';
import { print as printData } from './print';
import { getPrinterConfig } from './supported';
import { MockFilePrinter } from './mocks/file_printer';
import { CUPS_DEFAULT_IPP_URI, getPrinterRichStatus } from './status';

const debug = rootDebug.extend('manager');

interface PrinterDevice {
  uri?: string;
  lastPrint: number;
}

export function detectPrinter(logger: BaseLogger): Printer {
  // mock printer for development and integration tests
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_PRINTER)) {
    return new MockFilePrinter();
  }

  const printerDevice: PrinterDevice = { lastPrint: 0 };

  return {
    status: async () => {
      const connectedUris = await getConnectedDeviceUris();

      if (printerDevice.uri) {
        debug('device uri configured: %s', printerDevice.uri);
        const printerDetected = connectedUris.includes(printerDevice.uri);
        debug('printer detected: %s', printerDetected);

        // Check if printer is still attached via USB (more reliable than CUPS during post-print window)
        const config = getPrinterConfig(printerDevice.uri);
        const usbAttached =
          config &&
          isDeviceAttached(
            /* istanbul ignore next - @preserve */
            (device: Device) =>
              device.deviceDescriptor.idVendor === config.vendorId &&
              device.deviceDescriptor.idProduct === config.productId
          );
        debug(
          'CUPS printer detected: %s, USB attached: %s',
          printerDetected,
          usbAttached
        );

        // check if the printer was disconnected, only disconnect if CUPS shows disconnected AND device is not on USB bus
        // CUPS can briefly show the printer as disconnected right after a print job is sent but the device will remain on the USB bus in this
        // situation. In order to prevent confusion/unnecessary interruptions we only mark the printer as disconnected if both CUPS and USB show it as disconnected.
        if (!printerDetected && !usbAttached) {
          debug('printer disconnected (CUPS and USB both confirm)');
          logger.log(LogEventId.PrinterConfigurationRemoved, 'system', {
            message: 'The previously configured printer is no longer detected.',
            uri: printerDevice.uri,
          });
          printerDevice.uri = undefined;
        }
      }

      if (!printerDevice.uri) {
        // check if a supported printer is attached
        for (const uri of connectedUris) {
          debug('checking connected printer uri: %s', uri);
          const config = getPrinterConfig(uri);
          if (config) {
            debug('supported printer attached: %s', uri);
            logger.log(LogEventId.PrinterConfigurationAdded, 'system', {
              message:
                'A supported printer was discovered and configured for use.',
              uri,
            });
            await configurePrinter({ config, uri });
            printerDevice.uri = uri;
            break;
          }
        }
      }

      if (!printerDevice.uri) {
        debug('no printer connected or memory of previous printer');
        return { connected: false };
      }

      const config = assertDefined(getPrinterConfig(printerDevice.uri));
      return {
        connected: true,
        config,
        richStatus: config.supportsIpp
          ? await getPrinterRichStatus(CUPS_DEFAULT_IPP_URI)
          : undefined,
      };
    },

    print: async (props) => {
      printerDevice.lastPrint = Date.now();
      return printData(props);
    },
  };
}
