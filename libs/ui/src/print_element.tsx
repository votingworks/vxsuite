import React, { useEffect } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { getPrinter } from '@votingworks/utils';

const PrintStyles = styled.div`
  display: none;
  background: #ffffff;
  @media print {
    display: block;
  }
`;

// Render an element and print it. The function to render the element takes a
// callback to indicate when the component has finished rendering and is ready
// to be printed. This accommodates components that may want to do multiple
// renders or post-processing before being ready to print.
export async function printElementWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
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

  return new Promise<void>((resolve, reject) => {
    async function printAndTeardown() {
      try {
        await getPrinter().print(printOptions);
        resolve();
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
      <PrintStyles>{elementWithOnReadyCallback(onElementReady)}</PrintStyles>,
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
export function printElement(
  element: JSX.Element,
  printOptions: PrintOptions
): Promise<void> {
  return printElementWhenReady(
    (onElementReady) => (
      <WrapperWithCallbackAfterFirstRender onRendered={onElementReady}>
        {element}
      </WrapperWithCallbackAfterFirstRender>
    ),
    printOptions
  );
}
