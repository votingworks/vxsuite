/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import React from 'react';
import {
  expectTestToEndWithAllPrintsAsserted,
  expectPrint,
  ExpectPrintError,
  mockPrintElement,
  mockPrintElementWhenReady,
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

test('mockPrintElement functions throw errors on un-asserted elements', async () => {
  expect.assertions(4);

  try {
    await mockPrintElement(simpleElement, fakeOptions);
    await mockPrintElement(simpleElement, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await mockPrintElement(simpleElement, fakeOptions);
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await mockPrintElement(simpleElement, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }

  try {
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (e) {
    expect(e).toBeInstanceOf(ExpectPrintError);
  }
});

describe('expectTestToEndWithAllPrintsAsserted', () => {
  test('does not throw if no unasserted prints', () => {
    expect(expectTestToEndWithAllPrintsAsserted).not.toThrow(ExpectPrintError);
  });

  test('does throw if element printed', async () => {
    await mockPrintElement(simpleElement, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);
  });

  test('does throw if element with callback printed', async () => {
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);
  });

  test('cleans up expectPrint state', async () => {
    await mockPrintElement(simpleElement, fakeOptions);
    expect(expectTestToEndWithAllPrintsAsserted).toThrow(ExpectPrintError);

    // Printing another element should not throw an error
    await mockPrintElement(simpleElement, fakeOptions);
  });
});

describe('expectPrint', () => {
  test('throws error if no prints', async () => {
    expect.assertions(1);
    try {
      await expectPrint();
    } catch (e) {
      expect(e).toBeInstanceOf(ExpectPrintError);
    }
  });

  test('can expect multiple prints and use inspection', async () => {
    await mockPrintElement(getElement('1'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('1')).toBeTruthy();
    });

    await mockPrintElementWhenReady(getElementWithCallback('2'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('2')).toBeTruthy();
    });

    await mockPrintElementWhenReady(getElementWithCallback('3'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('3')).toBeTruthy();
    });

    await mockPrintElement(getElement('4'), fakeOptions);
    await expectPrint((printedElement) => {
      expect(printedElement.getByText('4')).toBeTruthy();
    });

    expectTestToEndWithAllPrintsAsserted();
  });

  test('can expect prints without inspection', async () => {
    await mockPrintElement(simpleElement, fakeOptions);
    await expectPrint();

    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await expectPrint();

    expectTestToEndWithAllPrintsAsserted();
  });

  test('can access printOptions', async () => {
    expect.assertions(1);
    await mockPrintElement(simpleElement, { sides: 'two-sided-long-edge' });
    await expectPrint((_printedElement, printOptions) => {
      expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
    });
  });

  test('error messages do not include full DOM', async () => {
    expect.assertions(1);
    render(getElement('screen'));
    screen.getByText('screen');
    await mockPrintElement(simpleElement, { sides: 'two-sided-long-edge' });
    try {
      await expectPrint((printedElement) => {
        printedElement.getByText('not in doc');
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('screen');
    }
  });

  test('cleans up expectPrint state after error', async () => {
    await mockPrintElement(simpleElement, fakeOptions);
    try {
      await expectPrint((printedElement) => {
        printedElement.getByText('not in doc');
      });
    } catch (error) {
      // do nothing
    }

    // Printing another element should not throw an error
    await mockPrintElement(simpleElement, fakeOptions);
  });
});

test('simulateErrorOnNextPrint', async () => {
  expect.assertions(3);

  // Works for mockPrintElement
  simulateErrorOnNextPrint();
  try {
    await mockPrintElement(simpleElement, fakeOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }

  // Should be able to print and assert normally now
  await mockPrintElement(simpleElement, fakeOptions);
  await expectPrint();

  // Works for mockPrintElementWhenReady, with custom error
  simulateErrorOnNextPrint(new Error('message'));
  try {
    await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toEqual('message');
  }

  await mockPrintElementWhenReady(simpleElementWithCallback, fakeOptions);
  await expectPrint();
});

test('deferNextPrint', async () => {
  expect.assertions(1);

  const { resolve } = deferNextPrint();
  const printPromise = mockPrintElement(simpleElement, fakeOptions);

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
  await mockPrintElement(simpleElement, fakeOptions);
  await expectPrintToMatchSnapshot();
});
