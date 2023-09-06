import { z } from 'zod';

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: KioskBrowser.PrintSides;
}
export interface Printer {
  print(options: PrintOptions): Promise<void>;
}

export type PrecinctReportDestination =
  | 'laser-printer'
  | 'thermal-sheet-printer';

export const PrecinctReportDestinationSchema: z.ZodSchema<PrecinctReportDestination> =
  z.union([z.literal('laser-printer'), z.literal('thermal-sheet-printer')]);
