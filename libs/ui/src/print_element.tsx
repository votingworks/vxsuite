import React from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { PrintOptions } from '@votingworks/types';
import { getPrinter } from '@votingworks/utils';
import { assert } from '@votingworks/basics';

const PrintOnly = styled.div`
  @media screen {
    visibility: hidden;
  }
`;

async function printWithOptions(printOptions: PrintOptions) {
  await getPrinter().print(printOptions);
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

function getPrintRoot() {
  const existingElement = document.getElementById('print-root');

  if (existingElement) {
    return existingElement;
  }

  const newElement = document.createElement('div');
  newElement.id = 'print-root';
  newElement.dataset['testid'] = 'print-root';
  document.body.appendChild(newElement);

  return newElement;
}

function Printable(props: { children: React.ReactNode }) {
  const { children } = props;

  return ReactDom.createPortal(
    <PrintOnly aria-hidden>{children}</PrintOnly>,
    getPrintRoot()
  );
}

export interface PrintToPdfProps {
  children: React.ReactNode;
  onDataReady: (pdfData: Uint8Array) => void;
}

export function PrintToPdf(props: PrintToPdfProps): JSX.Element {
  const { children, onDataReady } = props;
  const [printError, setPrintError] = React.useState<unknown>();

  //
  // Store props in refs to avoid any prop changes re-triggering the print
  // effect below:
  //

  const onDataReadyRef = React.useRef(onDataReady);
  React.useEffect(() => {
    onDataReadyRef.current = onDataReady;
  }, [onDataReady]);

  //
  // Trigger a print-to-pdf of the current page after initial render:
  //

  React.useEffect(() => {
    async function doPrint() {
      let pdfData: Uint8Array;
      try {
        pdfData = await printToPdf();
      } catch (error) {
        setPrintError(error);
        return;
      }

      onDataReadyRef.current(pdfData);
    }

    // Wait for next tick to print, to allow images to render.
    window.setTimeout(doPrint);
  }, []);

  if (printError) {
    throw printError;
  }

  return <Printable>{children}</Printable>;
}

export interface PrintElementProps {
  children: React.ReactNode;
  onPrintStarted: () => void;
  printOptions: PrintOptions;
}

export function PrintElement(props: PrintElementProps): JSX.Element {
  const { children, onPrintStarted, printOptions } = props;
  const [printError, setPrintError] = React.useState<unknown>();

  //
  // Store props in refs to avoid any prop changes re-triggering the print
  // effect below:
  //

  const onPrintStartedRef = React.useRef(onPrintStarted);
  React.useEffect(() => {
    onPrintStartedRef.current = onPrintStarted;
  }, [onPrintStarted]);

  const printOptionsRef = React.useRef(printOptions);
  React.useEffect(() => {
    printOptionsRef.current = printOptions;
  }, [printOptions]);

  //
  // Trigger a print of the current page after initial render:
  //

  React.useEffect(() => {
    async function doPrint() {
      try {
        await printWithOptions(printOptionsRef.current);
      } catch (error) {
        setPrintError(error);
        return;
      }

      onPrintStartedRef.current();
    }

    // Wait for next tick to print, to allow images to render.
    window.setTimeout(doPrint);
  }, []);

  if (printError) {
    throw printError;
  }

  return <Printable>{children}</Printable>;
}
