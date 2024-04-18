import React, { useEffect } from 'react';
import {
  advancePromises,
  advanceTimersAndPromises,
  mockKiosk,
  fakePrinter,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';
import { PrintOptions } from '@votingworks/types';
import { screen, waitFor } from '../test/react_testing_library';
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
    await suppressingConsoleOutput(async () => {
      await printElement(simpleElement, fakeOptions);
      expect(printer.print).toHaveBeenCalledTimes(1);
      expect(printer.print).toHaveBeenLastCalledWith(
        expect.objectContaining(fakeOptions)
      );
    });
  });

  test('removes element after print', async () => {
    await suppressingConsoleOutput(async () => {
      const printPromise = printElement(simpleElement, {
        sides: 'one-sided',
      });

      await screen.findByText('Print me!');
      await printPromise;
      expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
    });
  });

  test('calls print AFTER element is rendered', async () => {
    await suppressingConsoleOutput(async () => {
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
  });

  test('waits for images to load', async () => {
    await suppressingConsoleOutput(async () => {
      const image1Ref = React.createRef<HTMLImageElement>();
      const image2Ref = React.createRef<HTMLImageElement>();

      const printPromise = printElement(
        <div>
          <p>Print Me!</p>
          <img alt="" />
          <img ref={image1Ref} src="./image1.svg" alt="" />
          <img ref={image2Ref} src="./image2.svg" alt="" />
        </div>,
        fakeOptions
      );
      await screen.findByText('Print Me!');
      expect(printer.print).not.toHaveBeenCalled();

      image1Ref.current!.dispatchEvent(new Event('load'));
      await advancePromises();
      expect(printer.print).not.toHaveBeenCalled();

      image2Ref.current!.dispatchEvent(new Event('load'));
      await advancePromises();
      expect(printer.print).toHaveBeenCalledTimes(1);

      await printPromise;
    });
  });

  test('if print fails, bubbles up error and cleans up', async () => {
    await suppressingConsoleOutput(async () => {
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
  });

  test('printed elements have "visibility: hidden;" wrapper ', async () => {
    await suppressingConsoleOutput(async () => {
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
});

function SleeperElement({ afterSleep }: { afterSleep: () => void }) {
  useEffect(() => {
    async function sleepThenResolve() {
      await sleep(500);
      afterSleep();
    }
    void sleepThenResolve();
  }, [afterSleep]);
  return simpleElement;
}

test('printElementWhenReady prints only after element uses callback', async () => {
  await suppressingConsoleOutput(async () => {
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
  });
});

test('printElementToPdfWhenReady prints only after element uses callback', async () => {
  await suppressingConsoleOutput(async () => {
    const kiosk = mockKiosk();
    kiosk.printToPDF = jest.fn();
    window.kiosk = kiosk;

    let readyToPrintSpy = jest.fn();

    function renderSleeperElement(readyToPrint: () => void) {
      readyToPrintSpy = jest.fn(readyToPrint);
      return <SleeperElement afterSleep={readyToPrintSpy} />;
    }

    const printToPdfPromise = printElementToPdfWhenReady(renderSleeperElement);

    while (readyToPrintSpy.mock.calls.length === 0) {
      expect(kiosk.printToPDF).not.toHaveBeenCalled();
      await advanceTimersAndPromises(1);
    }
    await printToPdfPromise;
    expect(kiosk.printToPDF).toHaveBeenCalledTimes(1);

    window.kiosk = undefined;
  });
});

describe('printElementToPdf', () => {
  let kiosk = mockKiosk();

  beforeEach(() => {
    kiosk = mockKiosk();
    kiosk.printToPDF = jest.fn();
    window.kiosk = kiosk;
  });

  afterEach(() => {
    window.kiosk = undefined;
  });

  test('calls printToPdf after element is rendered', async () => {
    await suppressingConsoleOutput(async () => {
      const printToPdfPromise = printElementToPdf(simpleElement);

      await waitFor(() => {
        expect(kiosk.printToPDF).not.toHaveBeenCalled();
        screen.getByText('Print me!');
      });

      await printToPdfPromise;
      expect(screen.queryByText('Print me!')).not.toBeInTheDocument();
      expect(kiosk.printToPDF).toHaveBeenCalledTimes(1);
    });
  });
});
