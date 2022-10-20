import { render, RenderResult } from '@testing-library/react';
import { Optional, Printer, PrintOptions } from '@votingworks/types';
import { advanceTimersAndPromises } from './advance_timers';
import { assert } from './assert';

export const fakePrintElement = jest.fn(
  (_element: JSX.Element, printer: Printer, printOptions: PrintOptions) => {
    return printer.print(printOptions);
  }
);

export const fakePrintElementWhenReady = jest.fn(
  async (
    renderElement: (onReadyToPrint: () => void) => JSX.Element,
    printer: Printer,
    printOptions: PrintOptions
  ) => {
    return printer.print(printOptions);
  }
);

async function inspectPrintedElement(
  inspect: (renderResult: RenderResult) => void
): Promise<void> {
  await advanceTimersAndPromises();
  const lastCall =
    fakePrintElement.mock.calls[fakePrintElement.mock.calls.length - 1];
  assert(lastCall, 'no printed element to inspect');

  const renderResult = render(lastCall[0]);
  inspect(renderResult);

  renderResult.unmount();
  await advanceTimersAndPromises(0);
}

async function inspectPrintedElementWhenReady(
  inspect: (renderResult: RenderResult) => void
): Promise<void> {
  const lastCall =
    fakePrintElementWhenReady.mock.calls[
      fakePrintElementWhenReady.mock.calls.length - 1
    ];
  assert(lastCall, 'no printed element to inspect');
  const renderElement = lastCall[0];

  let renderResult: Optional<RenderResult>;
  const renderedPromise = new Promise<void>((resolve) => {
    renderResult = render(renderElement(resolve));
  });
  /**
   * We have to advance promises here to allow effects to run before
   * running assertion the rendered element.
   */
  await advanceTimersAndPromises();
  await renderedPromise;
  assert(renderResult);
  inspect(renderResult);

  renderResult.unmount();
}

export async function expectPrint(
  inspect?: (renderResult: RenderResult) => void
): Promise<void> {
  await advanceTimersAndPromises();

  const numPrints =
    fakePrintElementWhenReady.mock.calls.length +
    fakePrintElement.mock.calls.length;

  if (numPrints === 0) {
    throw new Error('nothing has been printed');
  }

  if (numPrints > 1) {
    throw new Error('there have been multiple prints');
  }

  if (inspect) {
    if (fakePrintElement.mock.calls.length) {
      await inspectPrintedElement(inspect);
    } else {
      await inspectPrintedElementWhenReady(inspect);
    }
  }

  fakePrintElement.mockClear();
  fakePrintElementWhenReady.mockClear();
}

export function expectAllPrintsTested(): void {
  const numPrints =
    fakePrintElementWhenReady.mock.calls.length +
    fakePrintElement.mock.calls.length;

  if (numPrints !== 0) {
    throw new Error(`${numPrints} untested print(s) in this test`);
  }
}
