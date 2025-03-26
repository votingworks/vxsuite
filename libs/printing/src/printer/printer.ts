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

/**
 * With the thermal receipt printer, the printer will register as disconnected
 * from the CUPS server for a period after each print. We give the printer this
 * much time to reconnect before we consider it disconnected.
 */
const POST_PRINT_DISCONNECT_ALLOWANCE = 3000;

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
        const justPrinted =
          Date.now() - printerDevice.lastPrint <
          POST_PRINT_DISCONNECT_ALLOWANCE;
        const printerDetected = connectedUris.includes(printerDevice.uri);

        // check if the printer was disconnected
        if (!justPrinted && !printerDetected) {
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
