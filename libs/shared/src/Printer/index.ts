import { Printer } from '@votingworks/types';
import { LocalPrinter } from './local_printer';
import { NullPrinter } from './null_printer';

export { LocalPrinter, NullPrinter };

export function getPrinter(): Printer {
  return window.kiosk ?? new LocalPrinter();
}
