import makeDebug from 'debug';

const debug = makeDebug('election-manager:printer');

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: Exclude<KioskBrowser.PrintOptions['sides'], undefined>;
}

export interface Printer {
  print(options: PrintOptions): Promise<void>;
}

export class LocalPrinter implements Printer {
  public async print(options: PrintOptions): Promise<void> {
    debug('ignoring options given to print: %o', options);
    window.print();
  }
}

export class NullPrinter implements Printer {
  public async print(): Promise<void> {
    // do nothing
  }
}

export default function getPrinter(): Printer {
  return window.kiosk ?? new LocalPrinter();
}
