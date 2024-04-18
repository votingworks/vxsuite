import { mockPrinter } from './fake_printer';

test('mockPrinter will use the provided print callback', async () => {
  const printFn = jest.fn();
  const printer = mockPrinter({ print: printFn });
  await printer.print({ sides: 'one-sided' });
  expect(printFn).toHaveBeenCalled();
});
