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

/**
 * See {@link deriveM404nPpd} for more details.
 */
export const M404N_INPUT_SLOT_OPTION = {
  InputSlot: 'Tray2',
} as const;

/**
 * Derives the HP LaserJet Pro M404n PPD from the generic PPD. Using our
 * generic PPD with the M404n results in the M404n asking the user to confirm
 * the paper size before it prints. The edit below, paired with specifying
 * InputSlot=Tray2 in the print options (see {@link M404N_INPUT_SLOT_OPTION}),
 * allows the M404n to print without this confirmation.
 *
 * While early data suggests that the modification below can be made to the
 * generic PPD without any negative consequences for other printers, we're
 * playing it safe until we can test more fully on all our supported printer
 * configurations.
 */
export function deriveM404nPpd(genericPpd: string): string {
  const inputSlotBlockClosingLine = '*CloseUI: *InputSlot';
  const customInputSlotLine =
    '*InputSlot Tray2/Tray 2: "<</MediaPosition 0 /ManualFeed false>> setpagedevice"';
  return genericPpd.replace(
    inputSlotBlockClosingLine,
    [customInputSlotLine, inputSlotBlockClosingLine].join('\n')
  );
}
