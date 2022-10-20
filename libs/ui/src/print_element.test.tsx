import React, { useEffect } from 'react';
import { advanceTimersAndPromises, fakePrinter } from '@votingworks/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { sleep } from '@votingworks/utils';
import { printElement, printElementWhenReady } from './print_element';

const simpleElement: JSX.Element = <p>Print me!</p>;

describe('printElement', () => {
  test('calls print with expected args', async () => {
    const printer = fakePrinter();
    await printElement(simpleElement, printer, { sides: 'one-sided' });
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(printer.print).toHaveBeenLastCalledWith(
      expect.objectContaining({ sides: 'one-sided' })
    );
  });

  test('renders element within print container', async () => {
    const printer = fakePrinter();
    const printPromise = printElement(simpleElement, printer, {
      sides: 'one-sided',
    });

    await waitFor(async () => {
      const printContainer = await screen.findByTestId('print-container');
      within(printContainer).getByText('Print me!');
    });

    await printPromise;
  });

  test('removes element after print', async () => {
    const printer = fakePrinter();
    const printPromise = printElement(simpleElement, printer, {
      sides: 'one-sided',
    });

    await screen.findByText('Print me!');
    await printPromise;
    expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
  });

  test('calls print AFTER element is rendered', async () => {
    const printer = fakePrinter();
    const printPromise = printElement(simpleElement, printer, {
      sides: 'one-sided',
    });

    await waitFor(() => {
      expect(printer.print).not.toHaveBeenCalled();
      screen.getByText('Print me!');
    });

    await printPromise;
    expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
    expect(printer.print).toHaveBeenCalledTimes(1);
  });
});

function SleeperElement({ afterSleep }: { afterSleep: () => void }) {
  useEffect(() => {
    async function sleepThenResolve() {
      await sleep(10000);
      afterSleep();
    }
    void sleepThenResolve();
  }, [afterSleep]);
  return simpleElement;
}

test('printElementWhenReady prints only after element uses callback', async () => {
  jest.useFakeTimers();
  const printer = fakePrinter();

  let readyToPrintSpy = jest.fn();

  function renderSleeperElement(readyToPrint: () => void) {
    readyToPrintSpy = jest.fn(readyToPrint);
    return <SleeperElement afterSleep={readyToPrintSpy} />;
  }

  const printPromise = printElementWhenReady(renderSleeperElement, printer, {
    sides: 'one-sided',
  });

  while (readyToPrintSpy.mock.calls.length === 0) {
    expect(printer.print).not.toHaveBeenCalled();
    await advanceTimersAndPromises(1);
  }
  await printPromise;
  expect(printer.print).toHaveBeenCalledTimes(1);
});
