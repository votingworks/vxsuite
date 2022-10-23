import { render, RenderResult } from '@testing-library/react';
import {
  ElementWithCallback,
  Optional,
  PrintOptions,
} from '@votingworks/types';
import { advancePromises } from './advance_timers';
import { assert } from './assert';

export class ExpectPrintError extends Error {}

export type InspectPrintFunction = (
  renderResult: RenderResult,
  printOptions?: PrintOptions
) => void;

let lastPrintedElement: Optional<JSX.Element>;
let lastPrintedElementWithCallback: Optional<ElementWithCallback>;
let lastPrintOptions: Optional<PrintOptions>;

export function fakePrintElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  if (lastPrintedElement || lastPrintedElementWithCallback) {
    throw new ExpectPrintError(
      'You have not made any assertions against the last print before printing another within a test.'
    );
  }
  lastPrintedElement = element;
  lastPrintOptions = printOptions;
  return Promise.resolve();
}

export function fakePrintElementWhenReady(
  elementWithCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  if (lastPrintedElement || lastPrintedElementWithCallback) {
    throw new ExpectPrintError(
      'You have not made any assertions against the last print before printing another within a test.'
    );
  }
  lastPrintedElementWithCallback = elementWithCallback;
  lastPrintOptions = printOptions;
  return Promise.resolve();
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
  inspect(renderResult, lastPrintOptions);
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
  // We have to advance promises here to allow effects to run before
  // running assertions against the rendered element.
  await advancePromises();
  await renderedPromise;
  assert(renderResult);
  inspect(renderResult, lastPrintOptions);
  renderResult.unmount();
}

/**
 * Asserts that there are no elements which were mock printed and have not been
 * tested. Should run after tests to confirm there were no unexpected prints.
 */
export function expectAllPrintsAsserted(): void {
  if (lastPrintedElement || lastPrintedElementWithCallback) {
    throw new ExpectPrintError(
      `This test ended with prints that were not asserted against.`
    );
  }
}

export function resetExpectPrint(): void {
  lastPrintedElement = undefined;
  lastPrintedElementWithCallback = undefined;
  lastPrintOptions = undefined;
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
  await advancePromises();

  if (!lastPrintedElement && !lastPrintedElementWithCallback) {
    throw new ExpectPrintError(
      'There have either been no prints or all prints have already been asserted against.'
    );
  }

  if (inspect) {
    if (lastPrintedElement) {
      inspectPrintedElement(inspect);
    } else {
      await inspectPrintedWhenReadyElement(inspect);
    }
  }

  resetExpectPrint();
  await advancePromises();
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
