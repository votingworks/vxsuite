import { Printer } from '@votingworks/types';

export class NullPrinter implements Printer {
  async print(): Promise<void> {
    // do nothing
  }
}
