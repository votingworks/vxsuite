import {
  advancePromises,
  mockKiosk,
  mockPrinter,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { PrintOptions } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library';
import { PrintElement, PrintToPdf } from './print_element';
import { TestErrorBoundary } from './error_boundary';

const printer = mockPrinter();

jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    getPrinter: () => printer,
  };
});

const mockOptions: PrintOptions = { sides: 'one-sided' };

describe('PrintElement', () => {
  test('calls print with expected args', async () => {
    const onPrintStarted = jest.fn();

    render(
      <PrintElement onPrintStarted={onPrintStarted} printOptions={mockOptions}>
        <p>Print me!</p>
      </PrintElement>
    );

    screen.getByText('Print me!');

    await advancePromises();
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(printer.print).toHaveBeenLastCalledWith(
      expect.objectContaining(mockOptions)
    );
    expect(onPrintStarted).toHaveBeenCalledTimes(1);
  });

  test('if print fails, bubbles up error', async () => {
    await suppressingConsoleOutput(async () => {
      const onPrintStarted = jest.fn();

      printer.print.mockRejectedValueOnce('print error');

      render(
        <TestErrorBoundary>
          <PrintElement
            onPrintStarted={onPrintStarted}
            printOptions={mockOptions}
          >
            <p>Print me!</p>
          </PrintElement>
        </TestErrorBoundary>
      );

      await screen.findByText('Test Error Boundary');
      screen.getByText('print error');

      expect(onPrintStarted).not.toHaveBeenCalled();
    });
  });

  test('printed elements have "visibility: hidden;" wrapper ', () => {
    render(
      <PrintElement onPrintStarted={jest.fn()} printOptions={mockOptions}>
        <p>Print me!</p>
      </PrintElement>
    );

    screen.getByText('Print me!');

    const element = screen.getByText('Print me!');
    expect(element.parentElement).toHaveStyleRule('visibility', 'hidden', {
      media: 'screen',
    });
  });
});

describe('PrintToPdf', () => {
  let kiosk = mockKiosk();
  const MOCK_PDF_DATA = new Uint8Array([2, 1, 1]);

  beforeEach(() => {
    kiosk = mockKiosk();
    kiosk.printToPDF = jest.fn().mockResolvedValue(MOCK_PDF_DATA);
    window.kiosk = kiosk;
  });

  afterEach(() => {
    window.kiosk = undefined;
  });

  test('calls printToPdf after element is rendered', async () => {
    const onDataReady = jest.fn();

    kiosk.printToPDF = jest.fn().mockResolvedValue(MOCK_PDF_DATA);

    render(
      <PrintToPdf onDataReady={onDataReady}>
        <p>Print me!</p>
      </PrintToPdf>
    );

    const contents = screen.getByText('Print me!');
    expect(contents.parentElement).toHaveStyleRule('visibility', 'hidden', {
      media: 'screen',
    });

    await advancePromises();
    expect(kiosk.printToPDF).toHaveBeenCalledTimes(1);
    expect(onDataReady).toHaveBeenCalledTimes(1);
    expect(onDataReady).toHaveBeenCalledWith(MOCK_PDF_DATA);
  });

  test('propagates print errors', async () => {
    await suppressingConsoleOutput(async () => {
      const onDataReady = jest.fn();

      kiosk.printToPDF.mockRejectedValueOnce('print error');

      render(
        <TestErrorBoundary>
          <PrintToPdf onDataReady={onDataReady}>
            <p>Print me!</p>
          </PrintToPdf>
        </TestErrorBoundary>
      );

      await screen.findByText('Test Error Boundary');
      screen.getByText('print error');

      expect(onDataReady).not.toHaveBeenCalled();
    });
  });
});
