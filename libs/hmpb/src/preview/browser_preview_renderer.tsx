import { Buffer } from 'buffer';
import ReactDomServer from 'react-dom/server';
import {
  Page,
  RenderDocument,
  Renderer,
  createDocument,
  createScratchpad,
} from '../renderer';
import { baseStyleElements } from '../base_styles';
import { PAGE_CLASS } from '../ballot_components';

function browserPage(): Page {
  return {
    evaluate<R, Arg>(fn: (arg: Arg) => R, arg: Arg) {
      return fn(arg);
    },

    pdf() {
      return Promise.resolve(Buffer.from(''));
    },

    close() {
      return Promise.resolve();
    },

    content() {
      return Promise.resolve('');
    },
  };
}

function createBrowserPreviewDocument(): RenderDocument {
  document.head.innerHTML += ReactDomServer.renderToString(
    <>
      {baseStyleElements}
      <style type="text/css">
        {`
        body {
          background-color: #ccc;
          padding: 0.25in;
        }

        .${PAGE_CLASS} {
          margin-left: auto;
          margin-right: auto;
          margin-bottom: 0.25in;
        }
      `}
      </style>
    </>
  );

  return createDocument(browserPage());
}

export function createBrowserPreviewRenderer(): Renderer {
  return {
    createScratchpad() {
      return Promise.resolve(createScratchpad(createBrowserPreviewDocument()));
    },
    cloneDocument() {
      return Promise.resolve(createBrowserPreviewDocument());
    },
    cleanup() {
      return Promise.resolve();
    },
  };
}
