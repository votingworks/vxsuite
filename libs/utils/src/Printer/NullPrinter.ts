import { Printer } from '../types';

export class NullPrinter implements Printer {
  async print(): Promise<void> {
    // do nothing
  }
}
