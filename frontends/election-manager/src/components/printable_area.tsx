import React, { useEffect, useRef } from 'react';
import ReactDom from 'react-dom';

interface Props {
  children?: React.ReactNode;
}

/**
 * <PrintableArea> renders the provided children in a standalone div with the .print-only class
 * name (standalone meaning via a React portal to ensure that a parent's CSS styles don't prevent
 * printability)
 */
export function PrintableArea({ children }: Props): JSX.Element {
  const printableContainerRef = useRef(document.createElement('div'));
  const printableContainer = printableContainerRef.current;
  printableContainer.classList.add('print-only');

  useEffect(() => {
    document.body.appendChild(printableContainer);
    return () => {
      document.body.removeChild(printableContainer);
    };
  }, [printableContainer]);

  return ReactDom.createPortal(children, printableContainer);
}
