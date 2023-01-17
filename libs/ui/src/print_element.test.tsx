import React, { useEffect } from 'react';
import {
  advancePromises,
  advanceTimersAndPromises,
  fakeKiosk,
  fakePrinter,
} from '@votingworks/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { sleep } from '@votingworks/utils';
import { PrintOptions } from '@votingworks/types';
import {
  printElement,
  printElementToPdf,
  printElementToPdfWhenReady,
  printElementWhenReady,
} from './print_element';

const printer = fakePrinter();

jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    getPrinter: () => printer,
  };
});

const simpleElement: JSX.Element = <p>Print me!</p>;
const fakeOptions: PrintOptions = { sides: 'one-sided' };

describe('printElement', () => {
  test('calls print with expected args', async () => {
    await printElement(simpleElement, fakeOptions);
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(printer.print).toHaveBeenLastCalledWith(
      expect.objectContaining(fakeOptions)
    );
  });

  test('renders element within print container', async () => {
    const printPromise = printElement(simpleElement, {
      sides: 'one-sided',
    });

    await waitFor(async () => {
      const printContainer = await screen.findByTestId('print-root');
      within(printContainer).getByText('Print me!');
    });

    await printPromise;
  });

  test('removes element after print', async () => {
    const printPromise = printElement(simpleElement, {
      sides: 'one-sided',
    });

    await screen.findByText('Print me!');
    await printPromise;
    expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
  });

  test('calls print AFTER element is rendered', async () => {
    const printPromise = printElement(simpleElement, {
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

  test('waits for images to load', async () => {
    const image1Ref = React.createRef<HTMLImageElement>();
    const image2Ref = React.createRef<HTMLImageElement>();

    const printPromise = printElement(
      <div>
        <img alt="" />
        <img ref={image1Ref} src="./image1.svg" alt="" />
        <img ref={image2Ref} src="./image2.svg" alt="" />
      </div>,
      fakeOptions
    );
    await advancePromises();
    expect(printer.print).not.toHaveBeenCalled();

    image1Ref.current!.dispatchEvent(new Event('load'));
    await advancePromises();
    expect(printer.print).not.toHaveBeenCalled();

    image2Ref.current!.dispatchEvent(new Event('load'));
    await advancePromises();
    expect(printer.print).toHaveBeenCalledTimes(1);

    await printPromise;
  });

  test('if print fails, bubbles up error and cleans up', async () => {
    const printError = new Error();
    printer.print.mockRejectedValueOnce(printError);

    expect.assertions(2);
    try {
      await printElement(simpleElement, fakeOptions);
    } catch (e) {
      expect(e).toEqual(printError);
    }

    expect(screen.queryByTestId('print-root')).not.toBeInTheDocument();
  });

  test('printed elements have "visibility: hidden;" wrapper ', async () => {
    const printPromise = printElement(simpleElement, {
      sides: 'one-sided',
    });

    await waitFor(() => {
      const element = screen.getByText('Print me!');
      expect(element.parentElement).toHaveStyleRule('visibility', 'hidden', {
        media: 'screen',
      });
    });
    await printPromise;
  });
});

function SleeperElement({ afterSleep }: { afterSleep: () => void }) {
  useEffect(() => {
    async function sleepThenResolve() {
      await sleep(3000);
      afterSleep();
    }
    void sleepThenResolve();
  }, [afterSleep]);
  return simpleElement;
}

test('printElementWhenReady prints only after element uses callback', async () => {
  jest.useFakeTimers();

  let readyToPrintSpy = jest.fn();

  function renderSleeperElement(readyToPrint: () => void) {
    readyToPrintSpy = jest.fn(readyToPrint);
    return <SleeperElement afterSleep={readyToPrintSpy} />;
  }

  const printPromise = printElementWhenReady(renderSleeperElement, {
    sides: 'one-sided',
  });

  while (readyToPrintSpy.mock.calls.length === 0) {
    expect(printer.print).not.toHaveBeenCalled();
    await advanceTimersAndPromises(1);
  }
  await printPromise;
  expect(printer.print).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('printElementToPdfWhenReady prints only after element uses callback', async () => {
  jest.useFakeTimers();
  const mockKiosk = fakeKiosk();
  mockKiosk.printToPDF = jest.fn();
  window.kiosk = mockKiosk;

  let readyToPrintSpy = jest.fn();

  function renderSleeperElement(readyToPrint: () => void) {
    readyToPrintSpy = jest.fn(readyToPrint);
    return <SleeperElement afterSleep={readyToPrintSpy} />;
  }

  const printToPdfPromise = printElementToPdfWhenReady(renderSleeperElement);

  while (readyToPrintSpy.mock.calls.length === 0) {
    expect(mockKiosk.printToPDF).not.toHaveBeenCalled();
    await advanceTimersAndPromises(1);
  }
  await printToPdfPromise;
  expect(mockKiosk.printToPDF).toHaveBeenCalledTimes(1);

  window.kiosk = undefined;
  jest.useRealTimers();
});

describe('printElementToPdf', () => {
  let mockKiosk = fakeKiosk();

  beforeEach(() => {
    mockKiosk = fakeKiosk();
    mockKiosk.printToPDF = jest.fn();
    window.kiosk = mockKiosk;
  });

  afterEach(() => {
    window.kiosk = undefined;
  });

  test('calls printToPdf after element is rendered', async () => {
    const printToPdfPromise = printElementToPdf(simpleElement);

    await waitFor(() => {
      expect(mockKiosk.printToPDF).not.toHaveBeenCalled();
      screen.getByText('Print me!');
    });

    await printToPdfPromise;
    expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
    expect(mockKiosk.printToPDF).toHaveBeenCalledTimes(1);
  });
});
