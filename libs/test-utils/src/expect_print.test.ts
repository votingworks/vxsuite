import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import React from 'react';
import {
  expectAllPrintsAsserted,
  expectPrint,
  ExpectPrintError,
  fakePrintElement,
  fakePrintElementWhenReady,
  resetExpectPrint,
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
  expect.assertions(4);

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

describe('expectAllPrintsAsserted', () => {
  test('does not throw if no unasserted prints', () => {
    expect(expectAllPrintsAsserted).not.toThrow(ExpectPrintError);
  });

  test('does throw if element printed', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    expect(expectAllPrintsAsserted).toThrow(ExpectPrintError);
  });

  test('does throw if element with callback printed', async () => {
    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    expect(expectAllPrintsAsserted).toThrow(ExpectPrintError);
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

    expectAllPrintsAsserted();
  });

  test('can expect prints without inspection', async () => {
    await fakePrintElement(simpleElement, fakeOptions);
    await expectPrint();

    await fakePrintElementWhenReady(simpleElementWithCallback, fakeOptions);
    await expectPrint();

    expectAllPrintsAsserted();
  });

  test('can access printOptions', async () => {
    expect.assertions(1);
    await fakePrintElement(simpleElement, { sides: 'two-sided-long-edge' });
    await expectPrint((_printedElement, printOptions) => {
      expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
    });
  });
});
