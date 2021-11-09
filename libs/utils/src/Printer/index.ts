import { LocalPrinter } from './local_printer';
import { NullPrinter } from './null_printer';
import { Printer } from '../types';

export { LocalPrinter, NullPrinter };

export function getPrinter(): Printer {
  return window.kiosk ?? new LocalPrinter();
}
