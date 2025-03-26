import { PrinterConfig, safeParse, safeParseJson } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { find } from '@votingworks/basics';

export const PrinterConfigSchema: z.ZodSchema<PrinterConfig> = z.object({
  label: z.string(),
  vendorId: z.number().nonnegative(),
  productId: z.number().nonnegative(),
  baseDeviceUri: z.string(),
  ppd: z.string(),
  supportsIpp: z.boolean(),
});

const RELATIVE_PATH_TO_SUPPORTED_PRINTERS = '../../supported_printers';
export const SUPPORTED_PRINTER_CONFIGS = safeParse(
  z.array(PrinterConfigSchema),
  safeParseJson(
    readFileSync(
      join(__dirname, RELATIVE_PATH_TO_SUPPORTED_PRINTERS, 'configs.json'),
      'utf8'
    )
  ).unsafeUnwrap()
).unsafeUnwrap();

export function getPrinterConfig(uri: string): PrinterConfig | undefined {
  return SUPPORTED_PRINTER_CONFIGS.find((supportedPrinterConfig) =>
    uri.startsWith(supportedPrinterConfig.baseDeviceUri)
  );
}

export function getPpdPath(printerConfig: PrinterConfig): string {
  return join(
    __dirname,
    RELATIVE_PATH_TO_SUPPORTED_PRINTERS,
    printerConfig.ppd
  );
}

export const BROTHER_THERMAL_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'Brother PJ-822'
);

export const HP_LASER_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'HP Color LaserJet Pro M4001dn'
);

export const CITIZEN_THERMAL_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'Citizen CT-E351'
);
