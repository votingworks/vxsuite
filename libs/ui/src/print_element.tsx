import React, { useEffect } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { assert, getPrinter } from '@votingworks/utils';

const ScreenDisplayNone = styled.div`
  display: none;
  @media print {
    display: block;
  }
`;

interface PrintElementBaseOptions {
  screenDisplayNone?: boolean;
}

export type PrintElementToPdfOptions = PrintElementBaseOptions;

export interface PrintElementOptions
  extends PrintElementBaseOptions,
    PrintOptions {}

type PrintElementToPdfOptionsDiscriminated = PrintElementToPdfOptions & {
  printToPdf: true;
};
type PrintElementOptionsDiscriminated = PrintElementOptions & {
  printToPdf: false;
};
type PrintElementSuperOptionsDiscriminated =
  | PrintElementToPdfOptionsDiscriminated
  | PrintElementOptionsDiscriminated;

// Render an element and print it. The function to render the element takes a
// callback to indicate when the component has finished rendering and is ready
// to be printed. This accommodates components that may want to do multiple
// renders or post-processing before being ready to print.
async function printElementWhenReadySuper(
  elementWithOnReadyCallback: ElementWithCallback,
  printElementToPrinterOptions: PrintElementOptionsDiscriminated
): Promise<void>;
async function printElementWhenReadySuper(
  elementWithOnReadyCallback: ElementWithCallback,
  printElementToPdfOptions: PrintElementToPdfOptionsDiscriminated
): Promise<Uint8Array>;
async function printElementWhenReadySuper(
  elementWithOnReadyCallback: ElementWithCallback,
  {
    screenDisplayNone = true,
    ...printOptionsDiscriminated
  }: PrintElementSuperOptionsDiscriminated
): Promise<void | Uint8Array> {
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

  return new Promise<void | Uint8Array>((resolve, reject) => {
    async function printAndTeardown() {
      try {
        if (printOptionsDiscriminated.printToPdf) {
          assert(window.kiosk);
          const pdfData = await window.kiosk.printToPDF();
          resolve(pdfData);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { printToPdf, ...printOptions } = printOptionsDiscriminated;
          await getPrinter().print(printOptions);
          resolve();
        }
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
      screenDisplayNone ? (
        <ScreenDisplayNone>
          {elementWithOnReadyCallback(onElementReady)}
        </ScreenDisplayNone>
      ) : (
        elementWithOnReadyCallback(onElementReady)
      ),
      printRoot
    );
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
async function printElementSuper(
  element: JSX.Element,
  printElementToPrinterOptions: PrintElementOptionsDiscriminated
): Promise<void>;
async function printElementSuper(
  element: JSX.Element,
  printElementToPdfOptions: PrintElementToPdfOptionsDiscriminated
): Promise<Uint8Array>;
function printElementSuper(
  element: JSX.Element,
  printElementSuperOptions: PrintElementSuperOptionsDiscriminated
): Promise<void | Uint8Array> {
  const elementWithCallbackAfterFirstRender: ElementWithCallback = (
    onElementReady
  ) => (
    <WrapperWithCallbackAfterFirstRender onRendered={onElementReady}>
      {element}
    </WrapperWithCallbackAfterFirstRender>
  );

  // Silly, but typescript doesn't handle the overload with the union type
  // argument, so we have two different calls to printElementWhenReadySuper
  if (printElementSuperOptions.printToPdf) {
    return printElementWhenReadySuper(
      elementWithCallbackAfterFirstRender,
      printElementSuperOptions
    );
  }
  return printElementWhenReadySuper(
    elementWithCallbackAfterFirstRender,
    printElementSuperOptions
  );
}

export async function printElementWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printElementOptions: PrintElementOptions
): Promise<void> {
  return printElementWhenReadySuper(elementWithOnReadyCallback, {
    printToPdf: false,
    ...printElementOptions,
  });
}

export async function printElement(
  element: JSX.Element,
  printElementOptions: PrintElementOptions
): Promise<void> {
  return printElementSuper(element, {
    printToPdf: false,
    ...printElementOptions,
  });
}

export async function printElementToPdfWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printElementToPdfOptions: PrintElementToPdfOptions = {}
): Promise<Uint8Array> {
  return printElementWhenReadySuper(elementWithOnReadyCallback, {
    printToPdf: true,
    ...printElementToPdfOptions,
  });
}

export async function printElementToPdf(
  element: JSX.Element,
  printElementToPdfOptions: PrintElementToPdfOptions = {}
): Promise<Uint8Array> {
  return printElementSuper(element, {
    printToPdf: true,
    ...printElementToPdfOptions,
  });
}
