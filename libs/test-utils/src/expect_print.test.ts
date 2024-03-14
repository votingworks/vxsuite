import { beforeEach, describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import React from 'react';
import {
  expectTestToEndWithAllPrintsAsserted,
  expectPrint,
  ExpectPrintError,
  fakePrintElement,
  fakePrintElementWhenReady,
  resetExpectPrint,
  simulateErrorOnNextPrint,
  expectPrintToMatchSnapshot,
  deferNextPrint,
} from './expect_print';

beforeEach(() => {
  resetExpectPrint();
});

function getElement(textContent: string): JSX.Element {
  return React.createElement('div', undefined, textContent);
}

function getElementWithCallback(textContent: string): ElementWithCallback {
  return (onReadyToPrint: VoidFunction) => {
    onReadyToPrint();
    return React.createElement('div', undefined, textContent);
  };
}

const simpleElement = getElement('simple');
const simpleElementWithCallback = getElementWithCallback('simple');
const fakeOptions: PrintOptions = { sides: 'one-sided' };

test('fakePrintElement functions throw errors on un-asserted elements', async () => {
  try {
    await fakePrintElement(simpleElement, fakeOptions);
    await fakePrintElement(simpleElement, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await fakePrintElement(simpleElement, fakeOptions);
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await fakePrintElement(simpleElement, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }
});

describe('expectTestToEndWithAllPrintsAsserted', () => {
  test('does not throw if no unasserted prints', () => {
    expect(expectTestToEndWithAllPrintsAsserted).not.toThrow(ExpectPrintError);
  });

  test('does throw if element printed', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);
  });

  test('does throw if element with callback printed', async () => {
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);
  });

  test('cleans up expectPrint state', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);

    // Printing another element should not throw an error
    await fakePrintElement(simpleElement, fakeOptions);
  });
});

describe('expectPrint', () => {
  test('throws error if no prints', async () => {
    try {
      await expectPrint();
    } catch (e) {
      expect(e).toBeInstanceOf(ExpectPrintError);
    }
  });

  test('can expect multiple prints and use inspection', async () => {
    await fakePrintElement(getElement('1'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('1')).toBeTruthy();
    });

    await fakePrintElementWhenReady(getElementWithCallback('2'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('2')).toBeTruthy();
    });

    await fakePrintElementWhenReady(getElementWithCallback('3'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('3')).toBeTruthy();
    });

    await fakePrintElement(getElement('4'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('4')).toBeTruthy();
    });

    expectTestToEndWithAllPrintsAsserted();
  });

  test('can expect prints without inspection', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    await expectPrint();

    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await expectPrint();

    expectTestToEndWithAllPrintsAsserted();
  });

  test('can access printOptions', async () => {
    await fakePrintElement(simpleElement, { sides: 'two-sided-long-edge' });
    await expectPrint((_printedElement, printOptions) => {
      expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
    });
  });

  test('error messages do not include full DOM', async () => {
    render(getElement('screen'));
    screen.getByText('screen');
    await fakePrintElement(simpleElement, { sides: 'two-sided-long-edge' });
    try {
      await expectPrint((printedElement) => {
        printedElement.getByText('not in doc');
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('screen');
    }
  });

  test('cleans up expectPrint state after error', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    try {
      await expectPrint((printedElement) => {
        printedElement.getByText('not in doc');
      });
    } catch (error) {
      // do nothing
    }

    // Printing another element should not throw an error
    await fakePrintElement(simpleElement, fakeOptions);
  });
});

test('simulateErrorOnNextPrint', async () => {
  // Works for fakePrintElement
  simulateErrorOnNextPrint();
  try {
    await fakePrintElement(simpleElement, fakeOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }

  // Should be able to print and assert normally now
  await fakePrintElement(simpleElement, fakeOptions);
  await expectPrint();

  // Works for fakePrintElementWhenReady, with custom error
  simulateErrorOnNextPrint(new Error('message'));
  try {
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toEqual('message');
  }

  await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  await expectPrint();
});

test('deferNextPrint', async () => {
  const { resolve } = deferNextPrint();
  const printPromise = fakePrintElement(simpleElement, fakeOptions);

  try {
    await expectPrint();
  } catch (error) {
    expect(error).toBeInstanceOf(ExpectPrintError);
  }

  resolve();
  await expectPrint();

  await printPromise; // clean up
});

test('expectPrintToMatchSnapshot', async () => {
  await fakePrintElement(simpleElement, fakeOptions);
  await expectPrintToMatchSnapshot();
});
