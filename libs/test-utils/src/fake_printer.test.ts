import { fakePrinter } from './fake_printer';

test('fakePrinter will use the provided print callback', async () => {
  const printFn = jest.fn();
  const printer = fakePrinter({ print: printFn });
  await printer.print({ sides: 'one-sided' });
  expect(printFn).toHaveBeenCalled();
});
