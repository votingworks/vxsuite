import {
  prettyDOM,
  render,
  RenderResult,
  waitFor,
} from '@testing-library/react';
import {
  ElementWithCallback,
  Optional,
  PrintOptions,
} from '@votingworks/types';
import { assert } from './assert';

export class ExpectPrintError extends Error {}

export type InspectPrintFunction = (
  renderResult: RenderResult,
  printOptions?: PrintOptions
) => void;

let lastPrintedElement: Optional<JSX.Element>;
let lastPrintedElementWithCallback: Optional<ElementWithCallback>;
let lastPrintOptions: Optional<PrintOptions>;

/**
 * Clears the state of this module i.e. data about what was last printed.
 * Use only for testing the module itself.
 */
export function resetExpectPrint(): void {
  lastPrintedElement = undefined;
  lastPrintedElementWithCallback = undefined;
  lastPrintOptions = undefined;
}

function expectAllPrintsAsserted(message: string) {
  if (lastPrintedElement || lastPrintedElementWithCallback) {
    resetExpectPrint();
    throw new ExpectPrintError(message);
  }
}

export function fakePrintElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  expectAllPrintsAsserted(
    'You have not made any assertions against the last print before another print within a test.'
  );

  lastPrintedElement = element;
  lastPrintOptions = printOptions;
  return Promise.resolve();
}

export function fakePrintElementWhenReady(
  elementWithCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  expectAllPrintsAsserted(
    'You have not made any assertions against the last print before another print within a test.'
  );

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

/**
 * Applies an inspection function (containing jest assertions) to a render
 * result and, on error, edits the messages to be more useful on test failure
 */
function inspectRenderResult(
  inspect: InspectPrintFunction,
  renderResult: RenderResult
) {
  try {
    inspect(renderResult, lastPrintOptions);
  } catch (error) {
    assert(error instanceof Error);
    const errorMessageMinusDom = error.message.split('\n')[0];
    const renderResultDom = prettyDOM(renderResult.container);
    error.message = `${errorMessageMinusDom}\n\n${renderResultDom}`;
    throw error;
  }
}

/**
 * Renders the element passed to fakePrintElement and allows assertions
 * against its content.
 *
 * @param inspect method which runs queries against the render result
 */
function inspectPrintedElement(inspect: InspectPrintFunction): void {
  assert(lastPrintedElement);
  const renderResult = render(lastPrintedElement);
  inspectRenderResult(inspect, renderResult);
  renderResult.unmount();
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
  let renderResult: Optional<RenderResult>;
  const renderedPromise = new Promise<void>((resolve) => {
    assert(lastPrintedElementWithCallback);
    renderResult = render(lastPrintedElementWithCallback(resolve));
  });
  await renderedPromise;
  assert(renderResult);
  inspectRenderResult(inspect, renderResult);
  renderResult.unmount();
}

/**
 * Asserts that a print took place via the mocks of printElement or
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
 * Asserts that the content of a print made through printElement or
 * printElementWhenReady matches its previous snapshot.
 *
 * @param inspect method which runs queries against the render result
 */
export async function expectPrintToMatchSnapshot(): Promise<void> {
  await expectPrint((printedElement) => {
    expect(printedElement.container).toMatchSnapshot();
  });
}
