import React, { useEffect, useRef } from 'react';
import ReactDom from 'react-dom';
import styled from 'styled-components';

import { ElementWithCallback, PrintOptions } from '@votingworks/types';
import { assert, getPrinter } from '@votingworks/utils';

const PrintStyles = styled.div`
  display: none;
  background: #ffffff;
  @media print {
    display: block;
  }
`;

// Wrapper that waits for all img elements within it to load before using
// its callback
function WrapperWithCallbackAfterImagesLoaded({
  children,
  onImagesLoaded,
}: {
  children: JSX.Element;
  onImagesLoaded: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    assert(wrapperRef.current);
    const imgElements = Array.from(wrapperRef.current.querySelectorAll('img'));
    const unloadedImages = imgElements.filter(
      (imgElement) => !imgElement.complete
    );

    let unloadedImageCount = unloadedImages.length;
    if (unloadedImageCount === 0) {
      onImagesLoaded();
      return;
    }

    function onLoad() {
      unloadedImageCount -= 1;
      if (unloadedImageCount === 0) {
        onImagesLoaded();
      }
    }

    for (const unloadedImage of unloadedImages) {
      unloadedImage.onload = onLoad;
    }
  }, [onImagesLoaded]);
  return <div ref={wrapperRef}>{children}</div>;
}

// Render an element and print it. The function to render the element takes a
// callback to indicate when the component has finished rendering and is ready
// to be printed. This accommodates components that may want to do multiple
// renders or post-processing before being ready to print.
export async function printElementWhenReady(
  elementWithOnReadyCallback: ElementWithCallback,
  printOptions: PrintOptions
): Promise<void> {
  const printRoot = document.createElement('div');
  printRoot.dataset['testid'] = 'print-root';
  document.body.appendChild(printRoot);

  return new Promise<void>((resolve) => {
    let imagesLoaded = false;
    let elementReady = false;
    async function printAndTeardown() {
      await getPrinter().print(printOptions);
      ReactDom.unmountComponentAtNode(printRoot);
      printRoot.remove();
      resolve();
    }
    async function onImagesLoaded() {
      imagesLoaded = true;
      if (elementReady) {
        await printAndTeardown();
      }
    }
    async function onElementReady() {
      elementReady = true;
      if (imagesLoaded) {
        await printAndTeardown();
      }
    }
    ReactDom.render(
      <PrintStyles>
        <WrapperWithCallbackAfterImagesLoaded onImagesLoaded={onImagesLoaded}>
          {elementWithOnReadyCallback(onElementReady)}
        </WrapperWithCallbackAfterImagesLoaded>
      </PrintStyles>,
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
