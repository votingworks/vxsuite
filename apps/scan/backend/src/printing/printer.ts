import { PrinterStatus as LegacyPrinterStatus } from '@votingworks/types';
import { detectPrinter, Printer as LegacyPrinter } from '@votingworks/printing';
import {
  PrinterStatus as FujitsuPrinterStatus,
  PrinterState as FujitsuPrinterState,
  PrintResult as FujitsuPrintResult,
  getFujitsuThermalPrinter,
  FujitsuThermalPrinterInterface,
} from '@votingworks/fujitsu-thermal-printer';
import {
  BooleanEnvironmentVariableName,
  getEnvironmentVariable,
} from '@votingworks/utils';
import { BaseLogger } from '@votingworks/logging';
import { assert, Result } from '@votingworks/basics';
import { Buffer } from 'buffer';

export const USE_FUJITSU_PRINTER = getEnvironmentVariable(
  BooleanEnvironmentVariableName.SCAN_USE_FUJITSU_PRINTER
);

export type PrinterStatus =
  | ({
      scheme: 'hardware-v3';
    } & LegacyPrinterStatus)
  | ({
      scheme: 'hardware-v4';
    } & FujitsuPrinterStatus);

export type { FujitsuPrinterState, FujitsuPrinterStatus, FujitsuPrintResult };

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

export async function getPrinter(logger: BaseLogger): Promise<Printer> {
  /* c8 ignore start */
  if (
    getEnvironmentVariable(
      BooleanEnvironmentVariableName.SCAN_USE_FUJITSU_PRINTER
    )
  ) {
    const printer = await getFujitsuThermalPrinter();
    assert(printer); // TODO: build mock and/or reconnection instead of asserting
    return wrapFujitsuThermalPrinter(printer);
  }
  /* c8 ignore stop */

  const legacyPrinter = detectPrinter(logger);
  return wrapLegacyPrinter(legacyPrinter);
}
