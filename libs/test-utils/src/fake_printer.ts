import { Printer } from '@votingworks/types';

export function fakePrinter({
  print = async () => {
    // do nothing
  },
  ...rest
}: Partial<Printer> = {}): jest.Mocked<Printer> {
  return {
    print: jest.fn(print),
    ...rest,
  };
}
