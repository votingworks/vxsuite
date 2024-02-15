import { Buffer } from 'buffer';
import ReactDomServer from 'react-dom/server';
import {
  Page,
  RenderDocument,
  Renderer,
  createDocument,
  createScratchpad,
} from './renderer';
import { globalStyleElements } from './global_styles';

function browserPage(): Page {
  return {
    evaluate<R, Arg>(fn: (arg: Arg) => R, arg: Arg) {
      return fn(arg);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pdf(_options) {
      return Promise.resolve(Buffer.from(''));
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    close(_options) {
      return Promise.resolve();
    },
  };
}

function createBrowserPreviewDocument(): RenderDocument {
  document.head.innerHTML += ReactDomServer.renderToString(
    <>
      {globalStyleElements}
      <style type="text/css">
        {`
        body {
          background-color: #ccc;
          padding: 0.25in;
        }

        .Page {
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
      return createScratchpad(createBrowserPreviewDocument());
    },
    cleanup() {
      return Promise.resolve();
    },
  };
}
