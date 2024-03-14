import { render, RenderResult, waitFor } from '@testing-library/react';
import { assert, deferred, Optional } from '@votingworks/basics';
import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { expect } from 'bun:test';

export class ExpectPrintError extends Error {}

export type PrintRenderResult = RenderResult;

export type InspectPrintFunction = (
  renderResult: PrintRenderResult,
  printOptions?: PrintOptions
) => void;

let lastPrintedElement: Optional<JSX.Element>;
let lastPrintedElementWithCallback: Optional<ElementWithCallback>;
let lastPrintOptions: Optional<PrintOptions>;
let errorOnNextPrint: Optional<Error>;
let deferredPromiseOnNextPrint: Optional<Promise<void>>;

let lastPdfPrintCommand: Optional<JSX.Element>;

/**
 * Clears the state of this module i.e. data about what was last printed.
 * Use only for testing the module itself.
 */
export function resetExpectPrint(): void {
  lastPrintedElement = undefined;
  lastPrintedElementWithCallback = undefined;
  lastPrintOptions = undefined;
  errorOnNextPrint = undefined;
  deferredPromiseOnNextPrint = undefined;
}

export function resetExpectPrintToPdf(): void {
  lastPdfPrintCommand = undefined;
}

/**
 * Throws the provided error the next time that fakePrintElement, fakePrintElementToPdf, or
 * fakePrintElementWhenReady are called. Used to simulate errors we
 * may receive from the printer itself.
 */
export function simulateErrorOnNextPrint(error: Error = new Error()): void {
  errorOnNextPrint = error;
}

/**
 * Sets up the next print so that it does not resolve until the returned `resolve` callback is called.
 */
export function deferNextPrint(): {
  resolve: VoidFunction;
} {
  const { promise, resolve } = deferred<void>();
  deferredPromiseOnNextPrint = promise;
  return { resolve };
}

function expectAllPrintsAsserted(message: string) {
  if (
    lastPrintedElement ||
    lastPrintedElementWithCallback ||
    lastPdfPrintCommand
  ) {
    const culprits = [];
    if (lastPrintedElement) {
      culprits.push('lastPrintedElement');
    }
    if (lastPrintedElementWithCallback) {
      culprits.push('lastPrintedElementWithCallback');
    }
    if (lastPdfPrintCommand) {
      culprits.push('lastPdfPrintCommand');
    }
    resetExpectPrint();
    resetExpectPrintToPdf();
    throw new ExpectPrintError(`${message}. Culprit: ${culprits.join(', ')}`);
  }
}

export async function fakePrintElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  expectAllPrintsAsserted(
    'You have not made any assertions against the last print before another print within a test.'
  );

  if (deferredPromiseOnNextPrint) {
    await deferredPromiseOnNextPrint;
    deferredPromiseOnNextPrint = undefined;
  }

  if (errorOnNextPrint) {
    const failedPrintPromise = Promise.reject(errorOnNextPrint);
    errorOnNextPrint = undefined;
    return failedPrintPromise;
  }

  lastPrintedElement = element;
  lastPrintOptions = printOptions;
  return Promise.resolve();
}

export async function fakePrintElementToPdf(
  element: JSX.Element
): Promise<Uint8Array> {
  expectAllPrintsAsserted(
    'You have not made any assertions against the last PDF print before another PDF print within a test.'
  );

  if (deferredPromiseOnNextPrint) {
    await deferredPromiseOnNextPrint;
    deferredPromiseOnNextPrint = undefined;
  }

  // errorOnNextPrint unsupported. If adding support, consider whether errorOnNextPrint should
  // be shared with the physical printing mock or if there should be a separate one for PDF printing.

  lastPdfPrintCommand = element;
  return Promise.resolve(new Uint8Array(0));
}

export async function fakePrintElementWhenReady(
  elementWithCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  expectAllPrintsAsserted(
    'You have not made any assertions against the last print before another print within a test.'
  );

  if (deferredPromiseOnNextPrint) {
    await deferredPromiseOnNextPrint;
    deferredPromiseOnNextPrint = undefined;
  }

  if (errorOnNextPrint) {
    const failedPrintPromise = Promise.reject(errorOnNextPrint);
    errorOnNextPrint = undefined;
    return failedPrintPromise;
  }

  lastPrintedElementWithCallback = elementWithCallback;
  lastPrintOptions = printOptions;
  return Promise.resolve();
}

/**
 * Asserts that there are no elements which were mock printed and have not been
 * tested. Should run after tests to confirm there were no unexpected prints.
 */
export function expectTestToEndWithAllPrintsAsserted(): void {
  expectAllPrintsAsserted(
    'Test ended with prints that were not asserted against.'
  );
}

function getPrintRoot() {
  let printRoot = document.querySelector(
    '#print-root'
  ) as Optional<HTMLDivElement>;
  if (printRoot) return printRoot;

  printRoot = document.createElement('div');
  printRoot.id = 'print-root';
  printRoot.dataset['testid'] = 'print-root';
  document.body.appendChild(printRoot);
  return printRoot;
}

/**
 * Renders the element passed to fakePrintElement and allows assertions
 * against its content.
 *
 * @param inspect method which runs queries against the render result
 */
function inspectPrintedElement(inspect: InspectPrintFunction): void {
  assert(lastPrintedElement);
  const renderResult = render(lastPrintedElement, {
    baseElement: getPrintRoot(),
  });

  try {
    inspect(renderResult, lastPrintOptions);
  } finally {
    renderResult.unmount();
  }
}

/**
 * Renders the element passed to fakePrintElementToPdf and allows assertions
 * against its content.
 *
 * @param inspect method which runs queries against the render result
 */
function inspectPdfPrintedElement(inspect: InspectPrintFunction): void {
  assert(lastPdfPrintCommand);
  const renderResult = render(lastPdfPrintCommand, {
    baseElement: getPrintRoot(),
  });

  try {
    inspect(renderResult);
  } finally {
    renderResult.unmount();
  }
}

/**
 * Renders the element with callback passed to fakePrintElementWhenReady
 * and allows assertions against its content.
 *
 * @param inspect method which runs queries against the render result
 */
async function inspectPrintedWhenReadyElement(
  inspect: InspectPrintFunction
): Promise<void> {
  assert(lastPrintedElementWithCallback);

  let onRendered!: VoidFunction;
  const onRenderedPromise = new Promise<void>((resolve) => {
    onRendered = resolve;
  });

  const renderResult = render(lastPrintedElementWithCallback(onRendered), {
    baseElement: getPrintRoot(),
  });
  await onRenderedPromise;

  try {
    inspect(renderResult, lastPrintOptions);
  } finally {
    renderResult.unmount();
  }
}

/**
 * Asserts that a physical print took place via the mocks of printElement or
 * printElementWhenReady. Renders the printed element and allows assertions
 * against its content. When using this utility, you should assert against
 * all prints.
 *
 * @param inspect method which runs queries against the render result
 */
export async function expectPrint(
  inspect?: InspectPrintFunction
): Promise<void> {
  await waitFor(() => {
    if (!lastPrintedElement && !lastPrintedElementWithCallback) {
      throw new ExpectPrintError(
        'There have either been no prints or all prints have already been asserted against.'
      );
    }
  });

  try {
    if (inspect) {
      if (lastPrintedElement) {
        inspectPrintedElement(inspect);
      } else {
        await inspectPrintedWhenReadyElement(inspect);
      }
    }
  } finally {
    resetExpectPrint();
  }
}

/**
 * Asserts that a print to PDF took place. Currently only printElementToPdf is supported;
 * printElementToPdfWhenReady is unsupported. Renders the PDF printed element and allows
 * assertions against its content.
 *
 * @param inspect method which runs queries against the render result
 */
export async function expectPrintToPdf(
  inspect?: InspectPrintFunction
): Promise<void> {
  await waitFor(() => {
    if (!lastPdfPrintCommand) {
      throw new ExpectPrintError(
        'There have either been no prints to PDF or all prints to PDF have already been asserted against.'
      );
    }
  });

  try {
    if (inspect) {
      if (lastPdfPrintCommand) {
        inspectPdfPrintedElement(inspect);
      }
    }
  } finally {
    resetExpectPrintToPdf();
  }
}

/**
 * Asserts that the content of a print made through printElement or
 * printElementWhenReady matches its previous snapshot.
 *
 * @param inspect method which runs queries against the render result
 */
export async function expectPrintToMatchSnapshot(): Promise<void> {
  await expectPrint((printedElement) => {
    expect(printedElement.container.outerHTML).toMatchSnapshot();
  });
}
