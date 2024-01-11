import { assertDefined } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { rootDebug } from '../utils/debug';
import { getConnectedDeviceUris } from './device_uri';
import { configurePrinter } from './configure';
import { Printer } from './types';
import { print as printData } from './print';
import { getPrinterConfig } from './supported';

const debug = rootDebug.extend('manager');

interface PrinterDevice {
  uri?: string;
}

export function detectPrinter(logger: Logger): Printer {
  const printerDevice: PrinterDevice = {};

  return {
    status: async () => {
      const connectedUris = await getConnectedDeviceUris();

      if (printerDevice.uri) {
        // check if the printer was disconnected
        if (!connectedUris.includes(printerDevice.uri)) {
          debug('printer disconnected');
          void logger.log(LogEventId.PrinterConfigurationRemoved, 'system', {
            message: 'The previously configured printer is no longer detected.',
            uri: printerDevice.uri,
          });
          printerDevice.uri = undefined;
        }
      }

      if (!printerDevice.uri) {
        // check if a supported printer is attached
        for (const uri of connectedUris) {
          const config = getPrinterConfig(uri);
          if (config) {
            debug('supported printer attached: %s', uri);
            void logger.log(LogEventId.PrinterConfigurationAdded, 'system', {
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
        return { connected: false };
      }
      return {
        connected: true,
        config: assertDefined(getPrinterConfig(printerDevice.uri)),
      };
    },

    print: printData,
  };
}
