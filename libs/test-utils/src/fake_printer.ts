import { mock } from 'bun:test';
import { Printer } from '@votingworks/types';

export function fakePrinter({
  print = async () => {
    // do nothing
  },
  ...rest
}: Partial<Printer> = {}): jest.Mocked<Printer> {
  return {
    print: mock(print),
    ...rest,
  };
}
