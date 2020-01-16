import { Printer } from '../../src/utils/printer'

export default function fakePrinter({
  print = async function(this: Printer) {
    // do nothing
  },
  ...rest
}: Partial<Printer> = {}): jest.Mocked<Printer> {
  return {
    print: jest.fn(print),
    ...rest,
  }
}
