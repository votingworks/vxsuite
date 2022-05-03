import makeDebug from 'debug';
import { Printer, PrintOptions } from '../types';

/* eslint-disable @typescript-eslint/require-await */

const debug = makeDebug('utils:printer');

export class LocalPrinter implements Printer {
  async print(options: PrintOptions): Promise<void> {
    debug('ignoring options given to print: %o', options);
    window.print();
  }
}
