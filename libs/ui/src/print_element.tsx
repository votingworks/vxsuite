import React, { useEffect } from 'react';
import ReactDom from 'react-dom';

import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { assert, getPrinter } from '@votingworks/utils';

// Render an element and print it. The function to render the element takes a
// callback to indicate when the component has finished rendering and is ready
// to be printed. This accommodates components that may want to do multiple
// renders or post-processing before being ready to print.
async function printElementWhenReadySuper<PrintResult>(
  elementWithOnReadyCallback: ElementWithCallback,
  print: () => Promise<PrintResult>
): Promise<PrintResult> {
  const printRoot = document.createElement('div');
  printRoot.id = 'print-root';
  printRoot.dataset['testid'] = 'print-root';
  document.body.appendChild(printRoot);

  async function waitForImagesToLoad() {
    const imageLoadPromises = Array.from(printRoot.querySelectorAll('img'))
      .filter((imgElement) => !imgElement.complete)
      .map((imgElement) => {
        return new Promise<void>((resolve: () => void, reject: () => void) => {
          imgElement.onload = resolve; // eslint-disable-line no-param-reassign
          imgElement.onerror = reject; // eslint-disable-line no-param-reassign
        });
      });

    return Promise.all(imageLoadPromises);
  }

  return new Promise<PrintResult>((resolve, reject) => {
    async function printAndTeardown() {
      try {
        const printResult = await print();
        resolve(printResult);
      } catch (e) {
        reject(e);
      } finally {
        ReactDom.unmountComponentAtNode(printRoot);
        printRoot.remove();
      }
    }

    async function onElementReady() {
      await waitForImagesToLoad();
      await printAndTeardown();
    }

    ReactDom.render(elementWithOnReadyCallback(onElementReady), printRoot);
  });
}

// Wrapper component to give a regular component an "onRendered"
// callback prop that will get called after the first render of
// the component finishes.
function WrapperWithCallbackAfterFirstRender({
  children,
  onRendered,
}: {
  children: JSX.Element;
  onRendered: () => void;
}) {
  useEffect(() => {
    onRendered();
  }, [onRendered]);
  return children;
}

// Function for printing regular React components that are ready to print
// after their initial render.
function printElementSuper<PrintResult>(
  element: JSX.Element,
  print: () => Promise<PrintResult>
): Promise<PrintResult> {
  const elementWithCallbackAfterFirstRender: ElementWithCallback = (
    onElementReady
  ) => (
    <WrapperWithCallbackAfterFirstRender onRendered={onElementReady}>
      {element}
    </WrapperWithCallbackAfterFirstRender>
  );

  return printElementWhenReadySuper(elementWithCallbackAfterFirstRender, print);
}

function printWithOptions(printOptions: PrintOptions) {
  return () => {
    return getPrinter().print(printOptions);
  };
}

export async function printElementWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  return printElementWhenReadySuper(
    elementWithOnReadyCallback,
    printWithOptions(printOptions)
  );
}

export async function printElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  return printElementSuper(element, printWithOptions(printOptions));
}

async function printToPdf(): Promise<Uint8Array> {
  assert(window.kiosk);
  const pdfData = await window.kiosk.printToPDF();
  return pdfData;
}

export async function printElementToPdfWhenReady(
  elementWithOnReadyCallback: ElementWithCallback
): Promise<Uint8Array> {
  return printElementWhenReadySuper(elementWithOnReadyCallback, printToPdf);
}

export async function printElementToPdf(
  element: JSX.Element
): Promise<Uint8Array> {
  return printElementSuper(element, printToPdf);
}
