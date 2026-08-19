import { PrinterConfig, safeParse, safeParseJson } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { readFileSync } from 'node:fs';
import { find } from '@votingworks/basics';

export const PrinterConfigSchema: z.ZodSchema<PrinterConfig> = z.object({
  label: z.string(),
  vendorId: z.number().nonnegative(),
  productId: z.number().nonnegative(),
  baseDeviceUri: z.string(),
  ppd: z.string(),
  supportsIpp: z.boolean(),
  pdfRenderer: z.optional(z.enum(['gs', 'pdftops'])),
  inputSlot: z.optional(z.string()),
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

export const HP_LASER_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'HP Color LaserJet Pro M4001dn'
);

export const CITIZEN_THERMAL_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'Citizen CT-E351'
);

export const M404N_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'HP LaserJet Pro M404n'
);

export const HP_4201_PRINTER_CONFIG = find(
  SUPPORTED_PRINTER_CONFIGS,
  (config) => config.label === 'HP Color LaserJet Pro 4201dn'
);

/**
 * Builds the `lp` options a printer needs on every job to work around its own
 * quirks, so callers don't have to know which printer they're driving. Empty
 * for printers whose config pins neither.
 *
 * See {@link PrinterConfig.pdfRenderer} and {@link PrinterConfig.inputSlot}.
 */
export function getPrinterSpecificOptions(config: PrinterConfig): {
  [key: string]: string;
} {
  const options: { [key: string]: string } = {};
  if (config.pdfRenderer) {
    options['pdftops-renderer'] = config.pdfRenderer;
  }
  if (config.inputSlot) {
    options['InputSlot'] = config.inputSlot;
  }
  return options;
}

/**
 * See {@link deriveM404nPpd} for more details.
 */
export const M404N_INPUT_SLOT = 'M404n_Tray2';

/**
 * Derives the HP LaserJet Pro M404n PPD from the generic PPD. The code prints
 * letter-size sheets, but the M404n has no letter-size paper inputs by
 * default. The printer can't automatically match the letter job to any one
 * input, all of which are configured for "Any" size, so it prompts the
 * operator to load letter paper and confirm the tray.
 *
 * The workaround is 2 part:
 * 1. Register the M404n cassette as a custom input slot here.
 *    See {@link M404N_INPUT_SLOT}.
 * 2. Explicitly select that input slot in print commands, via the config's
 *    `inputSlot`. See {@link PrinterConfig.inputSlot}.
 *
 * Selecting the cassette by position in print commands
 * (InputSlot=M404N_INPUT_SLOT -> MediaPosition 0) makes the printer commit to
 * the cassette and skip the confirmation.
 */
export function deriveM404nPpd(genericPpd: string): string {
  const inputSlotBlockClosingLine = '*CloseUI: *InputSlot';
  const customInputSlotLine = `*InputSlot ${M404N_INPUT_SLOT}/Tray 2: "<</MediaPosition 0 /ManualFeed false>> setpagedevice"`;
  return genericPpd.replace(
    inputSlotBlockClosingLine,
    [customInputSlotLine, inputSlotBlockClosingLine].join('\n')
  );
}
