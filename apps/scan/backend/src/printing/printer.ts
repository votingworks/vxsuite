import { PrinterStatus as LegacyPrinterStatus } from '@votingworks/types';
import { detectPrinter, Printer as LegacyPrinter } from '@votingworks/printing';
import {
  PrinterStatus as FujitsuPrinterStatus,
  PrinterState as FujitsuPrinterState,
  PrintResult as FujitsuPrintResult,
  ErrorType as FujitsuErrorType,
  FujitsuThermalPrinterInterface,
  getFujitsuThermalPrinter,
} from '@votingworks/fujitsu-thermal-printer';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { assert, Result } from '@votingworks/basics';
import { Buffer } from 'node:buffer';

export type PrinterStatus =
  | ({
      scheme: 'hardware-v3';
    } & LegacyPrinterStatus)
  | ({
      scheme: 'hardware-v4';
    } & FujitsuPrinterStatus);

export type {
  FujitsuErrorType,
  FujitsuPrinterState,
  FujitsuPrinterStatus,
  FujitsuPrintResult,
};

/**
 * An abstraction that wraps old CUPS-based printing and V4 hardware custom driver printing.
 */
export type Printer = {
  getStatus: () => Promise<PrinterStatus>;
} & (
  | {
      scheme: 'hardware-v3';
      print(data: Uint8Array): Promise<void>;
    }
  | {
      scheme: 'hardware-v4';
      print(data: Uint8Array): Promise<Result<void, FujitsuPrinterStatus>>;
    }
);

export type PrintResult =
  | {
      scheme: 'hardware-v3';
      pageCount: number;
    }
  | {
      scheme: 'hardware-v4';
      result: FujitsuPrintResult;
    };

export function wrapLegacyPrinter(legacyPrinter: LegacyPrinter): Printer {
  return {
    scheme: 'hardware-v3',
    print: (data: Uint8Array) =>
      legacyPrinter.print({ data: Buffer.from(data) }),
    getStatus: async () => {
      const legacyStatus = await legacyPrinter.status();
      return {
        scheme: 'hardware-v3',
        ...legacyStatus,
      };
    },
  };
}

export function wrapFujitsuThermalPrinter(
  printer: FujitsuThermalPrinterInterface
): Printer {
  return {
    scheme: 'hardware-v4',
    print: (data: Uint8Array) => printer.print(Buffer.from(data)),
    getStatus: async () => {
      const status = await printer.getStatus();
      return {
        scheme: 'hardware-v4',
        ...status,
      };
    },
  };
}

export function getPrinter(logger: Logger): Printer {
  if (
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_BROTHER_PRINTER)
  ) {
    const legacyPrinter = detectPrinter(logger);
    return wrapLegacyPrinter(legacyPrinter);
  }

  const printer = getFujitsuThermalPrinter(logger);
  assert(printer);
  return wrapFujitsuThermalPrinter(printer);
}
