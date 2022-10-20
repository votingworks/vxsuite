import React, { useEffect } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { Printer, PrintOptions } from '@votingworks/types';

const PrintStyles = styled.div`
  display: none;
  @media print {
    display: block;
  }
`;

// Render an element and print it. The function to render the element takes an
// onReadyToPrint callback to indicate when the component has finished rendering
// and is ready to be printed. This accommodates components that may want to do
// multiple renders or post-processing before being ready to print.
export async function printElementWhenReady(
  renderElement: (onReadyToPrint: () => void) => JSX.Element,
  printer: Printer,
  printOptions: PrintOptions
): Promise<void> {
  const printContainer = document.createElement('div');
  printContainer.dataset['testid'] = 'print-container';
  document.body.appendChild(printContainer);

  return new Promise<void>((resolve) => {
    async function onReadyToPrint() {
      await printer.print(printOptions);
      ReactDom.unmountComponentAtNode(printContainer);
      printContainer.remove();
      resolve();
    }
    ReactDom.render(
      <PrintStyles>{renderElement(onReadyToPrint)}</PrintStyles>,
      printContainer
    );
  });
}

// Wrapper component to give a regular component an "onRendered"
// callback prop that will get called after the first render of
// the component finishes.
export function WrapperWithCallbackAfterFirstRender({
  children,
  onRendered,
}: {
  children: JSX.Element;
  onRendered: () => void;
}): JSX.Element {
  useEffect(() => {
    onRendered();
  }, [onRendered]);
  return children;
}

// Function for printing regular React components that are ready to print
// after their initial render.
export function printElement(
  element: JSX.Element,
  printer: Printer,
  printOptions: PrintOptions
): Promise<void> {
  return printElementWhenReady(
    (readyToPrint) => (
      <WrapperWithCallbackAfterFirstRender onRendered={readyToPrint}>
        {element}
      </WrapperWithCallbackAfterFirstRender>
    ),
    printer,
    printOptions
  );
}
