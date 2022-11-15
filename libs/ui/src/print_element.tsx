import React, { useEffect } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { assert, getPrinter } from '@votingworks/utils';

const PrintOnly = styled.div`
  @media screen {
    visibility: hidden;
  }
`;

/**
 * Render an element and call the provided print function. The function to render
 * the element takes a callback to indicate when the component has finished rendering
 * and is ready to be printed. This accommodates components that may want to do
 * multiple renders or post-processing before being ready to print.
 * */
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

    ReactDom.render(
      <PrintOnly>{elementWithOnReadyCallback(onElementReady)}</PrintOnly>,
      printRoot
    );
  });
}

/**
 * Wrapper component to give a regular component an "onRendered" callback prop
 * that will get called after the first render of the component finishes.
 * */
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

/**
 * Renders regular React components that are ready to print after their initial
 * render, then  calls the provided print function.
 * */
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

/**
 * Renders a React component that takes a callback to indicate when rendering
 * is finished, and sends it to the printer when ready.
 */
export async function printElementWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  return printElementWhenReadySuper(
    elementWithOnReadyCallback,
    printWithOptions(printOptions)
  );
}

/**
 * Renders a React component and sends it to the printer.
 */
export async function printElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  return printElementSuper(element, printWithOptions(printOptions));
}

/**
 * Renders a React component that takes a callback to indicate when rendering
 * is finished, and returns a promise for it as PDF data.
 */
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

/**
 * Renders a React component and returns a promise for it as PDF data.
 */
export async function printElementToPdf(
  element: JSX.Element
): Promise<Uint8Array> {
  return printElementSuper(element, printToPdf);
}
