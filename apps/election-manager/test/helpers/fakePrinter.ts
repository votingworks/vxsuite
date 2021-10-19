import { Printer } from '@votingworks/utils';

export default function fakePrinter({
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
